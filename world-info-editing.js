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
        queueMicrotask(() => entryBox?.isConnected && updatePreview());
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
        openDraft();
    };
    // v1.18.12：外面的小框只当入口（用户：「外边这个滑块已经没有实际作用……只是给里边那个大框做个入口」）。
    // 小框（官方代码编辑器 / 原文本框）藏起来，换成一个固定的小气泡「按住打开编辑」+ 一行内容开头；
    // 按住 0.6 秒才开大窗口，手指一滑就取消（「有时候滑屏直接滑上去……又在翻这个」），气泡本身不滚。
    const block = contentScope(source);
    const entryBox = document.createElement('div');
    entryBox.className = 'tt-wi-content-entry';
    entryBox.setAttribute('role', 'button');
    entryBox.setAttribute('aria-label', '按住打开编辑');
    entryBox.innerHTML = '<div class="tt-wi-entry-fill"></div><i class="fa-solid fa-pen-to-square"></i><div class="tt-wi-entry-text"><b>按住打开编辑</b><small class="tt-wi-entry-preview"></small></div>';
    block.append(entryBox);
    block.classList.add('tt-wi-entry-on');
    const preview = entryBox.querySelector('.tt-wi-entry-preview');
    const updatePreview = () => { preview.textContent = source.value.replace(/\s+/g, ' ').trim().slice(0, 80) || '（还没写内容）'; };
    updatePreview();
    const HOLD_MS = 600;
    let holdTimer = null;
    let holdX = 0;
    let holdY = 0;
    const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; entryBox.classList.remove('tt-holding'); };
    const startHold = (event) => {
        if (dialog) return;
        const p = event.touches?.[0] ?? event;
        holdX = p.clientX ?? 0;
        holdY = p.clientY ?? 0;
        cancelHold();
        // 先让填满动画从 0 开始
        void entryBox.offsetWidth;
        entryBox.classList.add('tt-holding');
        holdTimer = setTimeout(() => {
            holdTimer = null;
            entryBox.classList.remove('tt-holding');
            try { navigator.vibrate?.(15); } catch { /* 不支持就算了 */ }
            openDraft();
        }, HOLD_MS);
    };
    const moveHold = (event) => {
        if (!holdTimer) return;
        const p = event.touches?.[0] ?? event;
        if (Math.hypot((p.clientX ?? 0) - holdX, (p.clientY ?? 0) - holdY) > 10) cancelHold();
    };
    const noMenu = (event) => event.preventDefault();
    entryBox.addEventListener('touchstart', startHold, { passive: true });
    entryBox.addEventListener('touchmove', moveHold, { passive: true });
    entryBox.addEventListener('touchend', cancelHold);
    entryBox.addEventListener('touchcancel', cancelHold);
    entryBox.addEventListener('contextmenu', noMenu);
    // 电脑上没有触摸：按住鼠标也一样
    const mouseDown = (event) => { if (event.pointerType === 'mouse') startHold(event); };
    const mouseUp = (event) => { if (event.pointerType === 'mouse') cancelHold(); };
    entryBox.addEventListener('pointerdown', mouseDown);
    entryBox.addEventListener('pointerup', mouseUp);
    entryBox.addEventListener('pointerleave', mouseUp);
    const onSourceChange = () => updatePreview();
    source.addEventListener('input', onSourceChange);
    source.addEventListener('change', onSourceChange);

    function openDraft() {
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
    }
    document.addEventListener('click', expand, true);
    refresh();
    return {
        reset() { pullEditorText(source); history.reset(source.value); refresh(); },
        cleanup() {
            stopSelectionLimit();
            dialog?.close(); dialog?.remove(); dialog = null;
            document.removeEventListener('click', expand, true);
            cancelHold();
            source.removeEventListener('input', onSourceChange);
            source.removeEventListener('change', onSourceChange);
            entryBox.remove();
            block.classList.remove('tt-wi-entry-on');
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
// v1.18.7：每秒 3 行 → 1.5 行（用户：「一滑一下就几十行……再压几倍都行」）
export function selectionScrollStep(previous, requested, elapsed, lineHeight, credit = 0) {
    const line = Math.max(12, lineHeight);
    const budget = Math.min(line, credit + Math.max(0, elapsed) * line * 1.5 / 1000);
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
    // v1.18.7 压慢：每秒约 1 行（刚到边）到约 5.5 行（拖出边外）；原来是 3～15 行，
    // 再加上每次滚动白送 0.25 行，手机一秒几十次滚动事件，实际一秒滚二三十行（用户 2026-10-04）。
    return { depth, rate: line * (1 + 3 * d), cap: line * 0.5 };
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

// ---------------------------------------------------------------- 纯文本框：选字时我来滚（v1.18.8）
// 以前的做法是手机先自己滚、扩展再拽回来慢慢放：选区先跑到底，框再一顿一顿往下挪（用户 2026-10-04：
// 「一下一秒就到底，然后右边的滑块再慢慢往下滑……不够丝滑」）。现在拖选字手柄时先把框和外层的
// 原生滚动冻住（overflow:hidden，只在选区正在变的时候），手柄在中间时内容不动、选区紧跟手指；
// 手柄（光标）进了框的上下边缘区，才由这里按帧平滑地慢慢滚。

// 文本框里第 pos 个字的光标顶部离内容顶部多远（镜像 div 量）
function caretTop(textarea, pos, cache) {
    const value = textarea.value;
    if (cache.value === value && cache.pos === pos && cache.width === textarea.clientWidth) return cache.top;
    let mirror = cache.mirror;
    if (!mirror) {
        mirror = cache.mirror = document.createElement('div');
        mirror.setAttribute('aria-hidden', 'true');
        document.body.append(mirror);
    }
    const style = getComputedStyle(textarea);
    const copy = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize',
        'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize'];
    for (const key of copy) mirror.style[key] = style[key];
    Object.assign(mirror.style, {
        position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden',
        whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word', borderStyle: 'solid',
        width: `${textarea.clientWidth + (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0)}px`,
    });
    mirror.textContent = value.slice(0, pos);
    const mark = document.createElement('span');
    mark.textContent = value.slice(pos, pos + 1) || '.';
    mirror.append(mark);
    const top = mark.offsetTop - (Number.parseFloat(style.borderTopWidth) || 0);
    Object.assign(cache, { value, pos, width: textarea.clientWidth, top });
    return top;
}

// 选字时我来滚：measure() 每帧告诉这里该往哪边滚、多深（0 = 不滚），scroller 是要滚的那个框。
// 纯文本框量镜像 div；官方代码编辑器（CodeMirror，.cm-scroller 里的可编辑区）量选区那一端的位置。
// v1.18.10：手指拖出框外时，系统会把选区直接算到框下面看不见的字上（用户：「一秒钟不到选了这么多」）。
// beyond() 发现移动那一端跑出了可视带，就 clamp() 把它按回框里最上 / 最下一行（edgeHold），
// 之后每帧框慢慢滚一点、选区跟着长一点，跟手机原生输入框一样；手指往回拖进框里就退出。
export function createSelectionDrive({ getScroller, measure, isSelecting, lineHeight, onDone, beyond, clamp }) {
    let lockedUntil = 0;
    let edgeHold = 0;
    let selfChanging = false;
    let selfTimer = null;
    let pins = 0;
    let fingerDown = false;
    let frozen = [];          // [node, 原来的 inline overflowY]
    let frame = null;
    let exact = null;
    let scroller = null;
    let last = 0;
    let moved = 0;
    const now = () => performance.now();

    const freeze = () => {
        if (frozen.length) return;
        scroller = getScroller();
        if (!scroller) return;
        const nodes = scrollContainers(scroller);
        if (!nodes.includes(scroller)) nodes.unshift(scroller);
        for (const node of nodes) {
            if (node === document.scrollingElement || node === document.documentElement || node === document.body) continue;
            frozen.push([node, node.style.overflowY]);
            node.style.overflowY = 'hidden';
        }
        exact = scroller.scrollTop;
        moved = 0;
        pins = 0;
    };
    const pin = (dir) => {
        if (!clamp || !scroller) return;
        selfChanging = true;
        clearTimeout(selfTimer);
        try { clamp(scroller, dir); pins++; } catch { /* 量不到就算了 */ }
        selfTimer = setTimeout(() => { selfChanging = false; }, 40);
    };
    const unfreeze = () => {
        edgeHold = 0;
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        if (!frozen.length) return;
        for (const [node, value] of frozen) node.style.overflowY = value;
        frozen = [];
        onDone?.(moved, pins);
    };
    const tick = () => {
        frame = null;
        const time = now();
        // 手指还按着、或者选区刚变过（0.6 秒内）就一直接管；都没了就还给原生
        if ((!fingerDown && time > lockedUntil) || !isSelecting() || !scroller) { unfreeze(); return; }
        const elapsed = Math.min(64, time - (last || time));
        last = time;
        const max = scroller.scrollHeight - scroller.clientHeight;
        if (edgeHold) {
            // 手指在框外：框匀速慢慢走（每秒约 3.5 行），选区跟着按到最边上那一行
            const line = Math.max(12, lineHeight());
            const before = scroller.scrollTop;
            exact = Math.min(max, Math.max(0, (exact ?? before) + edgeHold * line * 3.5 * elapsed / 1000));
            const target = Math.round(exact);
            if (target !== before) { moved += Math.abs(target - before); scroller.scrollTop = target; }
            pin(edgeHold);
            if ((edgeHold > 0 && exact >= max) || (edgeHold < 0 && exact <= 0)) edgeHold = 0;
            frame = requestAnimationFrame(tick);
            return;
        }
        const m = measure(scroller);
        if (m && m.dir) {
            const line = Math.max(12, lineHeight());
            const d = Math.min(Math.max(m.depth, 0), 1.5);
            const rate = line * (1 + 3 * d);                 // 每秒约 1～5.5 行
            exact = Math.min(max, Math.max(0, (exact ?? scroller.scrollTop) + m.dir * rate * elapsed / 1000));
            const target = Math.round(exact);
            if (target !== scroller.scrollTop) { moved += Math.abs(target - scroller.scrollTop); scroller.scrollTop = target; }
        } else {
            exact = scroller.scrollTop;
        }
        frame = requestAnimationFrame(tick);
    };
    return {
        get active() { return frozen.length > 0; },
        owns(node) { return frozen.some(([n]) => n === node); },
        get selfChanging() { return selfChanging; },
        onSelection() {
            if (selfChanging || !isSelecting()) return;
            lockedUntil = now() + 600;
            freeze();
            if (!frozen.length) return;
            const b = beyond ? beyond(scroller) : 0;
            if (b) { edgeHold = b; pin(b); }
            else edgeHold = 0;
            if (frame === null) { last = 0; frame = requestAnimationFrame(tick); }
        },
        fingerDown() { fingerDown = true; },
        fingerUp() { fingerDown = false; lockedUntil = Math.min(lockedUntil, now() + 120); },
        stop() { fingerDown = false; lockedUntil = 0; unfreeze(); },
    };
}

// 边缘区判断：光标（选区移动那一端）进了可视带上下沿 zone 以内就往那边滚
function edgeDir(caretTop, caretBottom, bandTop, bandBottom, line, canUp) {
    const zone = Math.max(line * 1.5, 36);
    if (caretBottom > bandBottom - zone) return { dir: 1, depth: (caretBottom - (bandBottom - zone)) / zone };
    if (canUp && caretTop < bandTop + zone) return { dir: -1, depth: (bandTop + zone - caretTop) / zone };
    return { dir: 0, depth: 0 };
}

// 兼容 v1.18.8 的名字：纯文本框
export function createTextareaDrive(source, lineHeight, onDone) {
    const cache = {};
    const drive = createSelectionDrive({
        getScroller: () => source,
        isSelecting: () => source.selectionStart !== source.selectionEnd,
        lineHeight: () => lineHeight(source),
        onDone,
        measure: (scroller) => {
            const line = Math.max(12, lineHeight(source));
            const pos = source.selectionDirection === 'backward' ? source.selectionStart : source.selectionEnd;
            const top = caretTop(source, pos, cache);
            return edgeDir(top, top + line, scroller.scrollTop, scroller.scrollTop + scroller.clientHeight, line, scroller.scrollTop > 0);
        },
        beyond: (scroller) => {
            const line = Math.max(12, lineHeight(source));
            const pos = source.selectionDirection === 'backward' ? source.selectionStart : source.selectionEnd;
            const top = caretTop(source, pos, cache);
            if (top > scroller.scrollTop + scroller.clientHeight - line * 0.3) return 1;
            if (top + line < scroller.scrollTop + line * 0.3) return -1;
            return 0;
        },
        clamp: (scroller, dir) => {
            const line = Math.max(12, lineHeight(source));
            const backward = source.selectionDirection === 'backward';
            const fixed = backward ? source.selectionEnd : source.selectionStart;
            const pos = backward ? source.selectionStart : source.selectionEnd;
            let lo, hi, best;
            if (dir > 0) {
                // 框里最后一整行之前、离 pos 最近的那个字
                const limit = scroller.scrollTop + scroller.clientHeight - line;
                lo = Math.min(fixed, pos); hi = pos; best = lo;
                while (lo <= hi) { const mid = (lo + hi) >> 1; if (caretTop(source, mid, cache) <= limit) { best = mid; lo = mid + 1; } else hi = mid - 1; }
            } else {
                const limit = scroller.scrollTop;
                lo = pos; hi = Math.max(fixed, pos); best = hi;
                while (lo <= hi) { const mid = (lo + hi) >> 1; if (caretTop(source, mid, cache) >= limit) { best = mid; hi = mid - 1; } else lo = mid + 1; }
            }
            if (best === pos) return;
            if (backward) source.setSelectionRange(Math.min(best, fixed), Math.max(best, fixed), best <= fixed ? 'backward' : 'forward');
            else source.setSelectionRange(Math.min(fixed, best), Math.max(fixed, best), best >= fixed ? 'forward' : 'backward');
        },
    });
    const destroy = () => { drive.stop(); cache.mirror?.remove(); };
    return Object.assign(drive, { destroy });
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
    const logDone = (kind) => (moved, pins = 0) => {
        import('./var-log.js').then(({ vlog }) => vlog('选字滚动', `世界书${kind}拖选字结束：自己滚了 ${Math.round(moved)} 像素，手指拖出框外、把选区按回框里 ${pins} 次`)).catch(() => {});
    };
    const drive = createTextareaDrive(source, lineHeight, logDone('文本框'));
    // 官方代码编辑器（CodeMirror）：冻住 .cm-scroller 和外层，按选区移动那一端的位置自己滚
    const cmDrive = createSelectionDrive({
        getScroller: () => {
            const editable = activeEditable(source);
            if (!editable || editable === source) return null;
            return editable.closest('.cm-scroller') ?? scrollContainers(editable).find((n) => n !== document.scrollingElement) ?? null;
        },
        isSelecting: () => hasContentSelection(source, activeEditable(source)),
        lineHeight: () => lineHeight(activeEditable(source)),
        onDone: logDone('编辑器'),
        measure: (scroller) => {
            const editable = activeEditable(source);
            if (!editable) return null;
            const sel = document.getSelection?.();
            if (!sel?.rangeCount) return null;
            const node = moving === 'anchor' ? sel.anchorNode : sel.focusNode;
            const offset = moving === 'anchor' ? sel.anchorOffset : sel.focusOffset;
            if (!node || !editable.contains(node)) return null;
            const rect = pointRect(node, offset);
            if (!rect) return null;
            const box = scroller.getBoundingClientRect();
            const vv = globalThis.visualViewport;
            const bandTop = Math.max(box.top + scroller.clientTop, vv ? vv.offsetTop : 0);
            const bandBottom = Math.min(box.top + scroller.clientTop + scroller.clientHeight, vv ? vv.offsetTop + vv.height : innerHeight);
            if (!(bandBottom > bandTop)) return null;
            return edgeDir(rect.top, rect.bottom, bandTop, bandBottom, Math.max(12, lineHeight(editable)), scroller.scrollTop > 0);
        },
        beyond: (scroller) => {
            const info = cmEndInfo(scroller);
            if (!info) return 0;
            const { rect, bandTop, bandBottom, line } = info;
            if (rect.bottom > bandBottom + line * 0.3) return 1;
            if (rect.top < bandTop - line * 0.3) return -1;
            return 0;
        },
        clamp: (scroller, dir) => {
            const info = cmEndInfo(scroller);
            if (!info) return;
            const { editable, sel, bandTop, bandBottom, line } = info;
            const box = scroller.getBoundingClientRect();
            const y = dir > 0 ? bandBottom - line * 0.6 : bandTop + line * 0.6;
            const x = dir > 0 ? box.right - 6 : box.left + 6;
            let node = null;
            let offset = 0;
            if (document.caretRangeFromPoint) {
                const r = document.caretRangeFromPoint(x, y);
                if (r) { node = r.startContainer; offset = r.startOffset; }
            } else if (document.caretPositionFromPoint) {
                const p = document.caretPositionFromPoint(x, y);
                if (p) { node = p.offsetNode; offset = p.offset; }
            }
            if (!node || !editable.contains(node)) return;
            if (moving === 'anchor') sel.setBaseAndExtent(node, offset, sel.focusNode, sel.focusOffset);
            else sel.setBaseAndExtent(sel.anchorNode, sel.anchorOffset, node, offset);
        },
    });
    // 代码编辑器里选区移动那一端的位置和编辑器可视带
    function cmEndInfo(scroller) {
        const editable = activeEditable(source);
        if (!editable || editable === source) return null;
        const sel = document.getSelection?.();
        if (!sel?.rangeCount) return null;
        const node = moving === 'anchor' ? sel.anchorNode : sel.focusNode;
        const offset = moving === 'anchor' ? sel.anchorOffset : sel.focusOffset;
        if (!node || !editable.contains(node)) return null;
        const rect = pointRect(node, offset);
        if (!rect) return null;
        const box = scroller.getBoundingClientRect();
        const vv = globalThis.visualViewport;
        const bandTop = Math.max(box.top + scroller.clientTop, vv ? vv.offsetTop : 0);
        const bandBottom = Math.min(box.top + scroller.clientTop + scroller.clientHeight, vv ? vv.offsetTop + vv.height : innerHeight);
        if (!(bandBottom > bandTop)) return null;
        return { editable, sel, rect, bandTop, bandBottom, line: Math.max(12, lineHeight(editable)) };
    }
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
        // 纯文本框交给 drive，代码编辑器交给 cmDrive：原生滚动冻住，自己平滑滚（cmDrive 要先知道哪一端在动，放到下面）
        if (editable === source) drive.onSelection();
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
            cmDrive.onSelection();
        }
    };
    // 记小数位置：慢速时一次只走零点几像素，直接写 scrollTop 会被取整吃掉、永远不动
    const apply = (node, previous, top, time, credit) => {
        state.set(node, { top, time, credit });
        const target = Math.round(top);
        if (Math.abs(target - node.scrollTop) >= 1) {
            node.scrollTop = target;
            expected.set(node, node.scrollTop);
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
            return;
        }
        expected.delete(node);
        const editable = activeEditable(source);
        // drive 接管时滚动是它自己做的，不再拽回
        if (drive.active || cmDrive.active) { state.set(node, { top: requested, time, credit: 0 }); return; }
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
        const budget = Math.min(allow.cap, previous.credit + Math.max(0, time - previous.time) * allow.rate / 1000);
        const used = Math.min(Math.abs(distance), budget);
        apply(node, previous, previous.top + Math.sign(distance) * used, time, budget - used);
    };
    const inScope = event => contentScope(source).contains(event.target);
    const bypass = event => {
        if (!inScope(event)) return;
        bypassUntil = now() + 250;
        selectionAt = -Infinity;
    };
    const release = () => { selectionAt = -Infinity; bypassUntil = now() + 80; drive.fingerUp(); cmDrive.fingerUp(); };
    const press = () => { drive.fingerDown(); cmDrive.fingerDown(); };
    const focusChange = () => { selecting = false; selectionAt = -Infinity; ends = null; state.clear(); drive.stop(); cmDrive.stop(); };
    document.addEventListener('beforeinput', bypass, true);
    document.addEventListener('keydown', bypass, true);
    document.addEventListener('wheel', bypass, { capture: true, passive: true });
    document.addEventListener('focusin', focusChange, true);
    document.addEventListener('focusout', focusChange, true);
    document.addEventListener('selectionchange', observeSelection);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('touchend', release, { passive: true });
    document.addEventListener('touchcancel', release, { passive: true });
    document.addEventListener('pointerup', release, true);
    document.addEventListener('touchstart', press, { passive: true });
    return () => {
        drive.destroy();
        cmDrive.stop();
        document.removeEventListener('touchcancel', release);
        document.removeEventListener('touchstart', press);
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
