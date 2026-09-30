// Mobile World Info text editing. Expanded edits stay local until Save.
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
        reset() { history.reset(source.value); refresh(); },
        cleanup() {
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
