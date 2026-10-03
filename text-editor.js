// 全屏大窗口改长文字（v1.18.18）：跟世界书内容那个大窗口一个样子（tt-wi-draft-dialog 那套样式），
// 用来改「写法说明」这类长提示词。用户 2026-10-04：「普通那个提示词太难改了，直接做成这个吧……用他们这个全功能」。
// 取消 / 撤销 / 保存；顶上「恢复原版」；改了没保存亮「● 没保存」，没保存就取消先问一句。

import { createHistory } from './world-info-editing.js';

let open = null;

export function openTextEditor({ title = '', value = '', defaultValue = null, onSave }) {
    if (open) return;
    const modal = document.createElement('dialog');
    modal.className = 'tt-wi-draft-dialog tt-text-editor';
    modal.setAttribute('aria-label', title || '编辑');

    const head = document.createElement('div');
    head.className = 'tt-text-editor-head';
    const name = document.createElement('b');
    name.textContent = title;
    const dirtyMark = document.createElement('span');
    dirtyMark.className = 'tt-text-editor-dirty';
    dirtyMark.textContent = '● 没保存';
    dirtyMark.hidden = true;
    head.append(name, dirtyMark);
    let resetBtn = null;
    if (defaultValue != null) {
        resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'tt-text-editor-reset';
        resetBtn.textContent = '恢复原版';
        head.append(resetBtn);
    }

    const draft = document.createElement('textarea');
    draft.className = 'tt-wi-draft-text';
    draft.spellcheck = false;
    draft.value = value;
    const history = createHistory(value);

    const bar = document.createElement('div');
    bar.className = 'tt-wi-draft-actions';
    const [cancel, undo, saveBtn] = ['取消', '撤销', '保存'].map((label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        bar.append(b);
        return b;
    });
    undo.disabled = true;

    let composing = false;
    const refresh = () => {
        undo.disabled = !history.canUndo;
        dirtyMark.hidden = draft.value === value;
    };
    const remember = () => { if (!composing) { history.record(draft.value); refresh(); } };
    draft.addEventListener('beforeinput', remember);
    draft.addEventListener('input', remember);
    draft.addEventListener('compositionstart', () => { composing = true; });
    draft.addEventListener('compositionend', () => { composing = false; remember(); });

    const close = () => { modal.close(); modal.remove(); open = null; };
    const tryClose = () => {
        if (draft.value !== value && !globalThis.confirm?.('改的还没保存，不要了吗？')) return;
        close();
    };
    cancel.addEventListener('click', tryClose);
    modal.addEventListener('cancel', (event) => { event.preventDefault(); tryClose(); });
    undo.addEventListener('click', () => {
        const top = draft.scrollTop;
        draft.value = history.undo();
        draft.scrollTop = top;
        refresh();
    });
    resetBtn?.addEventListener('click', () => {
        if (!globalThis.confirm?.('换成原版？点了还要再点「保存」才算数。')) return;
        history.record(draft.value);
        draft.value = defaultValue;
        history.record(draft.value);
        refresh();
    });
    saveBtn.addEventListener('click', () => {
        try { onSave?.(draft.value); } finally { close(); }
    });

    modal.append(head, draft, bar);
    document.body.append(modal);
    open = modal;
    modal.showModal();
    cancel.focus({ preventScroll: true });
    return modal;
}
