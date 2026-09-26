// Keep the message the reader is looking at in place while a new reply is added.
// The host's "Auto-scroll Chat" switch only covers its own scrollChatToBottom calls;
// themes, streaming renderers and mobile focus changes can move #chat separately.
let dispose;

export function initChatScrollGuard() {
    if (dispose) return;

    const chat = document.getElementById('chat');
    if (!chat) return;

    const context = globalThis.SillyTavern?.getContext?.();
    let snapshot = null;
    let frame = null;
    let settleTimer = null;
    let watchdog = null;
    let userIntentUntil = 0;
    let pointerInsideChat = false;
    let active = true;

    function clear() {
        snapshot = null;
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        clearTimeout(settleTimer);
        clearTimeout(watchdog);
        settleTimer = watchdog = null;
    }

    function nearBottom() {
        return chat.scrollHeight - chat.clientHeight - chat.scrollTop < 28;
    }

    function remember() {
        if (nearBottom()) {
            clear();
            return;
        }

        const chatTop = chat.getBoundingClientRect().top;
        const message = [...chat.querySelectorAll('.mes')].find((node) =>
            node.getBoundingClientRect().bottom > chatTop + 1);
        snapshot = {
            node: message ?? null,
            id: message?.getAttribute('mesid') ?? null,
            offset: message ? message.getBoundingClientRect().top - chatTop : 0,
            scrollTop: chat.scrollTop,
        };
    }

    function restore() {
        frame = null;
        if (!active || !snapshot || pointerInsideChat || performance.now() < userIntentUntil) return;

        let { node } = snapshot;
        if (node && !chat.contains(node)) {
            node = [...chat.querySelectorAll('.mes')].find((item) =>
                item.getAttribute('mesid') === snapshot.id) ?? null;
            snapshot.node = node;
        }
        if (node) {
            const offset = node.getBoundingClientRect().top - chat.getBoundingClientRect().top;
            const difference = offset - snapshot.offset;
            if (Math.abs(difference) > 1) chat.scrollTop += difference;
        } else if (Math.abs(chat.scrollTop - snapshot.scrollTop) > 1) {
            chat.scrollTop = snapshot.scrollTop;
        }
    }

    function scheduleRestore() {
        if (snapshot && frame === null) frame = requestAnimationFrame(restore);
    }

    function arm() {
        if (!active) return;
        if (!snapshot) {
            // Touch inertia from reading should not be mistaken for a new gesture after Send.
            pointerInsideChat = false;
            userIntentUntil = 0;
            remember();
        }
        if (!snapshot) return;
        clearTimeout(settleTimer);
        clearTimeout(watchdog);
        // Also release if sending was cancelled or the host never emits an end event.
        watchdog = setTimeout(clear, 10 * 60 * 1000);
        scheduleRestore();
    }

    function finish() {
        if (!snapshot) return;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(clear, 1800); // Allow late layout and image updates.
    }

    function onSend(event) {
        if (event.type === 'keydown') {
            if (event.target?.id !== 'send_textarea' || event.key !== 'Enter'
                || event.shiftKey || event.isComposing) return;
        } else if (!event.target?.closest?.('#send_but')) {
            return;
        }
        arm();
        // A slash command or an empty input might not produce MESSAGE_SENT.
        if (snapshot) finish();
    }

    function onUserIntent(event) {
        if (event.type === 'pointerdown' || event.type === 'touchstart') {
            pointerInsideChat = true;
        }
        userIntentUntil = performance.now() + 500;
    }

    function onPointerUp() {
        if (!pointerInsideChat) return;
        pointerInsideChat = false;
        userIntentUntil = performance.now() + 500; // Touch inertia belongs to the reader.
        setTimeout(scheduleRestore, 550);
    }

    function onScroll() {
        if (!snapshot) return;
        if (pointerInsideChat || performance.now() < userIntentUntil) {
            remember(); // Follow the reader's own scrolling, including touch inertia.
        } else {
            scheduleRestore();
        }
    }

    function onNavigationKey(event) {
        if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
        if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
            userIntentUntil = performance.now() + 500;
        }
    }

    const observer = new MutationObserver(scheduleRestore);
    observer.observe(chat, { childList: true, subtree: true });
    const poll = setInterval(scheduleRestore, 150); // Covers media size and CSS layout changes.
    const subscriptions = [];
    function subscribe(name, handler) {
        const type = context?.eventTypes?.[name];
        if (!type || !context?.eventSource) return;
        context.eventSource.on(type, handler);
        subscriptions.push([type, handler]);
    }
    subscribe('MESSAGE_SENT', arm);
    subscribe('GENERATION_STARTED', arm);
    subscribe('GENERATION_ENDED', finish);
    subscribe('GENERATION_STOPPED', finish);
    subscribe('CHAT_CHANGED', clear);

    document.addEventListener('pointerdown', onSend, true);
    document.addEventListener('click', onSend, true);
    document.addEventListener('keydown', onSend, true);
    document.addEventListener('keydown', onNavigationKey, true);
    chat.addEventListener('wheel', onUserIntent, { passive: true });
    chat.addEventListener('touchstart', onUserIntent, { passive: true });
    chat.addEventListener('pointerdown', onUserIntent, { passive: true });
    document.addEventListener('touchend', onPointerUp, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    chat.addEventListener('scroll', onScroll, { passive: true });
    chat.addEventListener('load', scheduleRestore, true);

    dispose = () => {
        active = false;
        clear();
        observer.disconnect();
        clearInterval(poll);
        subscriptions.forEach(([type, handler]) => context.eventSource.removeListener(type, handler));
        document.removeEventListener('pointerdown', onSend, true);
        document.removeEventListener('click', onSend, true);
        document.removeEventListener('keydown', onSend, true);
        document.removeEventListener('keydown', onNavigationKey, true);
        chat.removeEventListener('wheel', onUserIntent);
        chat.removeEventListener('touchstart', onUserIntent);
        chat.removeEventListener('pointerdown', onUserIntent);
        document.removeEventListener('touchend', onPointerUp, true);
        document.removeEventListener('pointerup', onPointerUp, true);
        document.removeEventListener('pointercancel', onPointerUp, true);
        chat.removeEventListener('scroll', onScroll);
        chat.removeEventListener('load', scheduleRestore, true);
        dispose = null;
    };
}

export function cleanupChatScrollGuard() {
    dispose?.();
}
