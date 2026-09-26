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
    let readerTookOver = false;
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
        if (!active || !snapshot || readerTookOver) return;

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
        if (!active || readerTookOver) return;
        if (!snapshot) remember();
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
        readerTookOver = false; // A new Send starts a new, independent protection window.
        arm();
        // A slash command or an empty input might not produce MESSAGE_SENT.
        if (snapshot) finish();
    }

    function onUserIntent(event) {
        if (!snapshot) return;
        if (event.target?.closest?.('#send_form, #form_sheld, #send_but, #send_textarea')) return;
        const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
        const rect = chat.getBoundingClientRect();
        const inside = chat === event.target || chat.contains(event.target)
            || (Number.isFinite(point.clientX) && Number.isFinite(point.clientY)
                && point.clientX >= rect.left && point.clientX <= rect.right
                && point.clientY >= rect.top && point.clientY <= rect.bottom);
        if (!inside) return;

        // Never compete with a physical gesture, including touch inertia or a
        // scrollbar drag. Future generation events must not re-arm this send.
        readerTookOver = true;
        clear();
    }

    function onScroll() {
        scheduleRestore();
    }

    function onNavigationKey(event) {
        if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
        if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
            readerTookOver = true;
            clear();
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
    subscribe('CHAT_CHANGED', () => {
        readerTookOver = false;
        clear();
    });

    document.addEventListener('pointerdown', onSend, true);
    document.addEventListener('click', onSend, true);
    document.addEventListener('keydown', onSend, true);
    document.addEventListener('keydown', onNavigationKey, true);
    document.addEventListener('wheel', onUserIntent, { capture: true, passive: true });
    document.addEventListener('touchstart', onUserIntent, { capture: true, passive: true });
    document.addEventListener('touchmove', onUserIntent, { capture: true, passive: true });
    document.addEventListener('pointerdown', onUserIntent, { capture: true, passive: true });
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
        document.removeEventListener('wheel', onUserIntent, true);
        document.removeEventListener('touchstart', onUserIntent, true);
        document.removeEventListener('touchmove', onUserIntent, true);
        document.removeEventListener('pointerdown', onUserIntent, true);
        chat.removeEventListener('scroll', onScroll);
        chat.removeEventListener('load', scheduleRestore, true);
        dispose = null;
    };
}

export function cleanupChatScrollGuard() {
    dispose?.();
}
