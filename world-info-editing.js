// Mobile World Info text editing. Expanded edits stay local until Save.

// TauriTavern can mount a CodeMirror editor over the content textarea. The
// editor only copies its text INTO the textarea (debounced, on blur and when
// the entry closes); it never reads the textarea back. So any value this
// extension writes to the textarea must also be pushed into the editor, or the
// host's next flush silently overwrites it with the editor's old text.
let hostEditorModule = null;
try {
    import(new URL('../../../tauri/codemirror-editor.js', import.meta.url).href)
        .then(module => { hostEditorModule = module; })
        .catch(() => {});
} catch { /* plain SillyTavern: no code editor */ }

function hostEditor(source) {
    try { return hostEditorModule?.getMountedCodeMirrorEditor?.(source) ?? null; } catch { return null; }
}

// Commit the editor's latest text into the textarea (and the host's save).
export function pullEditorText(source) {
    try { hostEditor(source)?.flush?.({ input: true }); } catch { /* keep textarea as is */ }
}

// Show the textarea's current value in the editor.
export function pushEditorText(source) {
    try { hostEditor(source)?.reset?.(); } catch { /* no editor mounted */ }
}
export function createHistory(initial, limit = 150) {
    let values = [initial];
    return {
        record(value) {
            if (value === values[values.length - 1]) return;
            values.push(value);
            if (values.length > limit) values.shift();
        },
        undo() { if (values.length > 1) values.pop(); return values[values.length - 1]; },
        reset(value) { values = [value]; },
        get canUndo() { return values.length > 1; },
    };
}

export function bindContentEditing(entry, actions) {
    const source = entry.querySelector('textarea[name="content"]');
    if (!source) return { reset() {}, cleanup() {} };
    const stopSelectionLimit = bindSelectionScrollLimit(source);
    const history = createHistory(source.value);
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'tt-wi-edit-undo';
    undo.textContent = '撤销';
    actions.insertBefore(undo, actions.lastElementChild);
    let composing = false;
    let dialog = null;
    const refresh = () => { undo.disabled = !history.canUndo; };
    const record = () => { if (!composing) { history.record(source.value); refresh(); } };
    const write = (value) => {
        source.value = value;
        pushEditorText(source);
        // The host listens with jQuery, which also lets enhanced editors resync.
        if (globalThis.jQuery) globalThis.jQuery(source).trigger('input').trigger('change');
        else {
            source.dispatchEvent(new Event('input', { bubbles: true }));
            source.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };
    const startComposition = () => { composing = true; };
    const endComposition = () => { composing = false; record(); };
    const beforeInput = () => { if (!composing) record(); };
    source.addEventListener('beforeinput', beforeInput);
    source.addEventListener('compositionstart', startComposition);
    source.addEventListener('compositionend', endComposition);
    const jq = globalThis.jQuery;
    if (jq) jq(source).on('input.ttWiUndo change.ttWiUndo', record);
    else source.addEventListener('input', record);
    const undoClick = () => {
        pullEditorText(source);
        if (!history.canUndo) return;
        const top = source.scrollTop;
        write(history.undo());
        source.scrollTop = top;
        refresh();
    };
    undo.addEventListener('click', undoClick);

    const expand = (event) => {
        const button = event.target.closest?.('.editor_maximize');
        if (!button || !entry.contains(button)
            || button.getAttribute('data-for') !== source.id) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (dialog) return;
        const modal = document.createElement('dialog');
        modal.className = 'tt-wi-draft-dialog';
        modal.setAttribute('aria-label', '编辑世界书内容');
        const draft = document.createElement('textarea');
        draft.className = 'tt-wi-draft-text';
        draft.setAttribute('aria-label', '世界书内容');
        pullEditorText(source);
        draft.value = source.value;
        draft.spellcheck = false;
        draft.style.fontSize = getComputedStyle(source).fontSize;
        const draftHistory = createHistory(draft.value);
        const bar = document.createElement('div');
        bar.className = 'tt-wi-draft-actions';
        const buttons = ['取消', '撤销', '保存'].map(label => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            bar.append(b);
            return b;
        });
        buttons[1].disabled = true;
        let draftComposing = false;
        const remember = () => {
            if (draftComposing) return;
            draftHistory.record(draft.value);
            buttons[1].disabled = !draftHistory.canUndo;
        };
        draft.addEventListener('beforeinput', remember);
        draft.addEventListener('input', remember);
        draft.addEventListener('compositionstart', () => { draftComposing = true; });
        draft.addEventListener('compositionend', () => { draftComposing = false; remember(); });
        const close = () => { modal.close(); modal.remove(); dialog = null; };
        buttons[0].addEventListener('click', close);
        buttons[1].addEventListener('click', () => {
            const top = draft.scrollTop;
            draft.value = draftHistory.undo();
            draft.scrollTop = top;
            buttons[1].disabled = !draftHistory.canUndo;
        });
        buttons[2].addEventListener('click', () => {
            if (!source.isConnected) return close();
            history.record(source.value);
            write(draft.value);
            record();
            close();
        });
        modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
        modal.append(draft, bar);
        document.body.append(modal);
        dialog = modal;
        modal.showModal();
        // Avoid summoning the keyboard until the user taps the text.
        buttons[0].focus({ preventScroll: true });
    };
    document.addEventListener('click', expand, true);
    refresh();
    return {
        reset() { pullEditorText(source); history.reset(source.value); refresh(); },
        cleanup() {
            stopSelectionLimit();
            dialog?.close(); dialog?.remove(); dialog = null;
            document.removeEventListener('click', expand, true);
            source.removeEventListener('beforeinput', beforeInput);
            source.removeEventListener('compositionstart', startComposition);
            source.removeEventListener('compositionend', endComposition);
            if (jq) jq(source).off('input.ttWiUndo change.ttWiUndo', record);
            else source.removeEventListener('input', record);
            undo.remove();
        },
    };
}

// Rate-limit only scrolls accompanying a changing native text selection.
// Do not rewrite selection endpoints or run a loop that fights ordinary panning.
export function selectionScrollStep(previous, requested, elapsed, lineHeight, credit = 0) {
    const line = Math.max(12, lineHeight);
    const budget = Math.min(line, credit + Math.max(0, elapsed) * line * 3 / 1000);
    const distance = requested - previous;
    const used = Math.min(Math.abs(distance), budget);
    return { top: previous + Math.sign(distance) * used, credit: budget - used };
}

// The host may replace the content textarea with a code editor
// (CodeMirror: contenteditable .cm-content inside .cm-scroller). The user
// then selects text in that editor, never in the hidden textarea, so the
// active editable is resolved at event time instead of being fixed.
function contentScope(source) {
    return source.closest('.tt-wi-content-block') ?? source.parentElement ?? source;
}

function activeEditable(source) {
    const el = document.activeElement;
    if (!el) return null;
    if (el === source) return el;
    if (el.isContentEditable && contentScope(source).contains(el)) return el;
    return null;
}

// Returns true while a non-empty selection lives in the content editor.
function hasContentSelection(source, editable) {
    if (!editable) return false;
    if (editable === source) return source.selectionStart !== source.selectionEnd;
    const sel = document.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    return editable.contains(sel.anchorNode) || editable.contains(sel.focusNode);
}

// The inline editor sits inside the World Info popup, which scrolls too.
// Revealing a moving selection end scrolls every ancestor (the editor's own
// scroller, the popup, the page), so all of them are limited together.
function scrollContainers(editable) {
    const list = [];
    if (editable.tagName === 'TEXTAREA') list.push(editable);
    for (let node = editable.parentElement; node; node = node.parentElement) {
        if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) list.push(node);
    }
    const root = document.scrollingElement;
    if (root && !list.includes(root)) list.push(root);
    return list;
}

// Native-app style edge autoscroll (Android EditText, iOS, Google Docs):
// while a selection handle moves through the middle of the visible text,
// nothing scrolls. Only when the moving end reaches the top/bottom edge zone
// does the view scroll, and only toward that edge, faster the deeper in.
// Pulling the handle back out of the zone stops scrolling at once.
export function edgeScrollAllowance({ direction, endTop, endBottom, visTop, visBottom, line }) {
    const zone = Math.max(line * 2, 48);
    let depth = 0;
    if (direction > 0) depth = (endBottom - (visBottom - zone)) / zone;
    else if (direction < 0) depth = ((visTop + zone) - endTop) / zone;
    if (!(depth > 0)) return { depth: 0, rate: 0, cap: 0 };
    const d = Math.min(depth, 1.5);
    // Lines per second: ~3 at the zone boundary, up to ~15 when the finger is past the edge.
    return { depth, rate: line * (3 + 8 * d), cap: line * (1 + d) };
}

function pointRect(node, offset) {
    try {
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        let rect = [...range.getClientRects()].at(-1) ?? range.getBoundingClientRect();
        if ((!rect || (!rect.height && !rect.top)) && node.nodeType === Node.TEXT_NODE && offset > 0) {
            range.setStart(node, offset - 1);
            range.setEnd(node, offset);
            rect = [...range.getClientRects()].at(-1);
        }
        if (!rect || (!rect.height && !rect.top)) {
            const el = node.nodeType === Node.ELEMENT_NODE ? node.childNodes[offset] ?? node : node.parentElement;
            rect = el?.getBoundingClientRect?.();
        }
        return rect && (rect.height || rect.top) ? rect : null;
    } catch {
        return null;
    }
}

export function bindSelectionScrollLimit(source) {
    if (!globalThis.matchMedia?.('(pointer: coarse)').matches) return () => {};
    const state = new Map();
    const expected = new WeakMap();
    let selecting = false;
    let selectionAt = -Infinity;
    let bypassUntil = 0;
    let ends = null;          // last anchor/focus, to tell which handle is moving
    let moving = 'focus';
    const now = () => performance.now();
    const lineHeight = (editable) => {
        const style = getComputedStyle(editable ?? source);
        return Number.parseFloat(style.lineHeight) || (Number.parseFloat(style.fontSize) || 16) * 1.5;
    };
    const snapshot = (editable) => {
        state.clear();
        if (!editable) return;
        const time = now();
        const credit = 0;
        for (const node of scrollContainers(editable)) {
            state.set(node, { top: node.scrollTop, time, credit });
            expected.delete(node);
        }
    };
    // How far `el` has been moved up by scrolls we have not accepted yet.
    const pendingOffset = (el) => {
        let sum = 0;
        for (const [node, info] of state) {
            if (node !== el && node.contains(el)) sum += node.scrollTop - info.top;
        }
        return sum;
    };
    // Visible band of the editor: every scroll container and the visual viewport
    // (the on-screen keyboard shrinks the latter), in pre-scroll coordinates.
    const visibleBand = () => {
        const vv = globalThis.visualViewport;
        let top = vv ? vv.offsetTop : 0;
        let bottom = vv ? vv.offsetTop + vv.height : innerHeight;
        for (const node of state.keys()) {
            if (node === document.scrollingElement || node === document.documentElement || node === document.body) continue;
            const r = node.getBoundingClientRect();
            const shift = pendingOffset(node);
            top = Math.max(top, r.top + node.clientTop + shift);
            bottom = Math.min(bottom, r.top + node.clientTop + node.clientHeight + shift);
        }
        return bottom > top ? { top, bottom } : null;
    };
    const movingEndRect = (editable) => {
        const sel = document.getSelection?.();
        if (!sel?.rangeCount) return null;
        const node = moving === 'anchor' ? sel.anchorNode : sel.focusNode;
        const offset = moving === 'anchor' ? sel.anchorOffset : sel.focusOffset;
        if (!node || !editable.contains(node)) return null;
        const rect = pointRect(node, offset);
        if (!rect) return null;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        const shift = pendingOffset(el);
        return { top: rect.top + shift, bottom: rect.bottom + shift };
    };
    const observeSelection = () => {
        const editable = activeEditable(source);
        if (!hasContentSelection(source, editable)) {
            selecting = false;
            selectionAt = -Infinity;
            ends = null;
            return;
        }
        // A selection just appeared: take fresh baselines for every container.
        if (!selecting) snapshot(editable);
        selecting = true;
        selectionAt = now();
        if (editable !== source) {
            const sel = document.getSelection();
            const next = { an: sel.anchorNode, ao: sel.anchorOffset, fn: sel.focusNode, fo: sel.focusOffset };
            if (ends) {
                const focusMoved = next.fn !== ends.fn || next.fo !== ends.fo;
                const anchorMoved = next.an !== ends.an || next.ao !== ends.ao;
                if (focusMoved) moving = 'focus';
                else if (anchorMoved) moving = 'anchor';
            } else moving = 'focus';
            ends = next;
        }
    };
    const apply = (node, previous, top, time, credit) => {
        state.set(node, { top, time, credit });
        if (Math.abs(top - node.scrollTop) >= 1) {
            node.scrollTop = top;
            expected.set(node, node.scrollTop);
            state.get(node).top = node.scrollTop;
        }
    };
    const scroll = event => {
        const node = event.target === document ? document.scrollingElement : event.target;
        const previous = state.get(node);
        if (!previous) return;
        const time = now();
        const requested = node.scrollTop;
        if (expected.has(node) && Math.abs(expected.get(node) - requested) < 1) {
            expected.delete(node);
            previous.top = requested;
            previous.time = time;
            return;
        }
        expected.delete(node);
        const editable = activeEditable(source);
        // Only scrolls that follow a moving selection are touched;
        // ordinary finger panning (selection unchanged) passes through.
        if (!hasContentSelection(source, editable) || time < bypassUntil || time - selectionAt > 120) {
            state.set(node, { top: requested, time, credit: 0 });
            return;
        }
        const line = Math.max(12, lineHeight(editable));
        const distance = requested - previous.top;
        const end = editable === source ? null : movingEndRect(editable);
        const band = end ? visibleBand() : null;
        if (!end || !band) {
            // Plain textarea or unmeasurable handle: fall back to a gentle rate limit.
            const next = selectionScrollStep(previous.top, requested, time - previous.time, line, previous.credit);
            apply(node, previous, next.top, time, next.credit);
            return;
        }
        const allow = edgeScrollAllowance({
            direction: Math.sign(distance),
            endTop: end.top,
            endBottom: end.bottom,
            visTop: band.top,
            visBottom: band.bottom,
            line,
        });
        if (!allow.rate) {
            // Handle is away from the edge (or moving back): keep the text still.
            apply(node, previous, previous.top, time, 0);
            return;
        }
        const budget = Math.min(allow.cap, previous.credit + Math.max(0, time - previous.time) * allow.rate / 1000 + line * 0.25);
        const used = Math.min(Math.abs(distance), budget);
        apply(node, previous, previous.top + Math.sign(distance) * used, time, budget - used);
    };
    const inScope = event => contentScope(source).contains(event.target);
    const bypass = event => {
        if (!inScope(event)) return;
        bypassUntil = now() + 250;
        selectionAt = -Infinity;
    };
    const release = () => { selectionAt = -Infinity; bypassUntil = now() + 80; };
    const focusChange = () => { selecting = false; selectionAt = -Infinity; ends = null; state.clear(); };
    document.addEventListener('beforeinput', bypass, true);
    document.addEventListener('keydown', bypass, true);
    document.addEventListener('wheel', bypass, { capture: true, passive: true });
    document.addEventListener('focusin', focusChange, true);
    document.addEventListener('focusout', focusChange, true);
    document.addEventListener('selectionchange', observeSelection);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('touchend', release, { passive: true });
    document.addEventListener('pointerup', release, true);
    return () => {
        document.removeEventListener('beforeinput', bypass, true);
        document.removeEventListener('keydown', bypass, true);
        document.removeEventListener('wheel', bypass, { capture: true });
        document.removeEventListener('focusin', focusChange, true);
        document.removeEventListener('focusout', focusChange, true);
        document.removeEventListener('selectionchange', observeSelection);
        document.removeEventListener('scroll', scroll, true);
        document.removeEventListener('touchend', release);
        document.removeEventListener('pointerup', release, true);
    };
}
