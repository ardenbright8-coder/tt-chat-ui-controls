// 全屏大窗口改长文字（v1.18.18）：跟世界书内容那个大窗口一个样子（tt-wi-draft-dialog 那套样式），
// 用来改「写法说明」这类长提示词。用户 2026-10-04：「普通那个提示词太难改了，直接做成这个吧……用他们这个全功能」。
// 取消 / 撤销 / 保存；改了没保存亮「● 没保存」，没保存就取消先问一句。
//
// v1.18.23 存档：传了 archive 时，右上角「恢复原版」换成「存档」，点开是一列存过的版本（同一个窗口里翻页，不另弹）：
//   上面「自带的」（原版 + 以前的版本），下面「我存的」；点一条 = 换进框里（还要点「保存」才算数，换错了点「撤销」）；
//   我存的每条右边「改」「删」；底下「＋ 存一份现在的」「＋ 空白一条」（空白的直接进去自己填）。
//   用户：「右上角那个恢复以前……弄成一个小目录……我自己有个加号，我可以再加一条……额外加一条空的，我自己填」。
// v1.18.24 一列到底、按位置编号（1、2、3），名字单独一行、概括内容（用户：「名字……概括准确一点……用编号编起来」）：
//   自带的和自己存的在同一列，每条都能「改」「删」，什么都不自动删（用户：「不要删我那些东西……我自己会手动删」）。
//   没起名的按内容自动概括（`archive.summarize`），自己起了名（named）就用自己的。
// archive = { list(), add({ text, auto }) → 新条目, update(id, { name, named, text }), remove(id), summarize(text) }

import { createHistory } from './world-info-editing.js';
import { tip } from './tip.js';

let open = null;

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ask = (text) => globalThis.confirm ? globalThis.confirm(text) : true;
const pad = (n) => String(n).padStart(2, '0');
export const stamp = (at = Date.now()) => { const d = new Date(at); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// 预览跳过开头「【深入这场戏】」这种标题行，几版都一样，看不出区别
// 名字是从哪句概括来的，预览里就不再重复那句
const preview = (text, name = '') => {
    const key = String(name).replace(/…$/, '').replace(/^[^·：]*[·：]\s*/, '');
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !/^【[^】]*】$/.test(l));
    const rest = key ? lines.filter((l) => !l.replace(/^[-·•\d.、\s]+/, '').startsWith(key)) : lines;
    return rest.slice(0, 2).join('\n') || lines.slice(0, 2).join('\n') || '（空的）';
};

function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    if (tag === 'button') node.type = 'button';
    return node;
}

// 一个带撤销的大文本框
function makeDraft(text, onChange) {
    const area = el('textarea', 'tt-wi-draft-text');
    area.spellcheck = false;
    area.value = text;
    const history = createHistory(text);
    let composing = false;
    const remember = () => { if (!composing) { history.record(area.value); onChange(); } };
    area.addEventListener('beforeinput', remember);
    area.addEventListener('input', remember);
    area.addEventListener('compositionstart', () => { composing = true; });
    area.addEventListener('compositionend', () => { composing = false; remember(); });
    return {
        area,
        history,
        set(value) { history.record(area.value); area.value = value; history.record(value); onChange(); },
        undo() { const top = area.scrollTop; area.value = history.undo(); area.scrollTop = top; onChange(); },
    };
}

export function openTextEditor({ title = '', value = '', defaultValue = null, archive = null, onSave }) {
    if (open) return;
    const modal = el('dialog', 'tt-wi-draft-dialog tt-text-editor');
    modal.setAttribute('aria-label', title || '编辑');

    const head = el('div', 'tt-text-editor-head');
    const body = el('div', 'tt-text-editor-body');
    const bar = el('div', 'tt-wi-draft-actions');

    let mode = 'main'; // main 正文 / list 存档目录 / entry 改一条存档
    let entry = null; // { item, draft, name, isNew }
    let refreshBar = () => {};

    const main = makeDraft(value, () => refreshBar());

    const close = () => { modal.close(); modal.remove(); open = null; };

    // ------------------------------------------------ 正文
    function renderMain() {
        mode = 'main';
        head.replaceChildren();
        head.className = 'tt-text-editor-head';
        const dirty = el('span', 'tt-text-editor-dirty', '● 没保存');
        head.append(el('b', '', title), dirty);
        if (archive) {
            const btn = el('button', 'tt-text-editor-reset', '存档');
            btn.addEventListener('click', renderList);
            head.append(btn);
        } else if (defaultValue != null) {
            const btn = el('button', 'tt-text-editor-reset', '恢复原版');
            btn.addEventListener('click', () => {
                if (!ask('换成原版？点了还要再点「保存」才算数。')) return;
                main.set(defaultValue);
            });
            head.append(btn);
        }
        body.replaceChildren(main.area);
        const [cancel, undo, saveBtn] = threeButtons();
        refreshBar = () => { undo.disabled = !main.history.canUndo; dirty.hidden = main.area.value === value; };
        refreshBar();
        cancel.addEventListener('click', tryClose);
        undo.addEventListener('click', () => main.undo());
        saveBtn.addEventListener('click', () => { try { onSave?.(main.area.value); } finally { close(); } });
    }

    function threeButtons() {
        bar.className = 'tt-wi-draft-actions';
        const buttons = ['取消', '撤销', '保存'].map((label) => el('button', '', label));
        bar.replaceChildren(...buttons);
        return buttons;
    }

    const tryClose = () => {
        if (main.area.value !== value && !ask('改的还没保存，不要了吗？')) return;
        close();
    };

    // ------------------------------------------------ 存档目录
    const titleOf = (item) => (item.named ? item.name : archive.summarize?.(item.text)) || '（空的）';

    function row(no, item) {
        const name = titleOf(item);
        const isNow = item.text.trim() === main.area.value.trim();
        const wrap = el('div', 'tt-archive-row');
        if (isNow) wrap.classList.add('is-now');
        const pick = el('button', 'tt-archive-pick');
        const tags = [
            item.builtin ? '<span class="tt-archive-tag">自带</span>' : '',
            item.auto ? '<span class="tt-archive-tag">自动存的</span>' : '',
            isNow ? '<span class="tt-archive-tag now">框里的</span>' : '',
        ].join('');
        pick.innerHTML = `<span class="tt-archive-name"><span class="tt-archive-no">${no}.</span>${esc(name)}</span>`
            + `<span class="tt-archive-meta">${tags}${item.builtin || !item.at ? '' : `<span class="tt-archive-time">${esc(stamp(item.at))}</span>`}</span>`
            + `<span class="tt-archive-preview">${esc(archive.changed?.(item.text)?.slice(0, 2).join('\n') || preview(item.text, name))}</span>`;
        pick.addEventListener('click', () => {
            if (!item.text.trim()) { globalThis.toastr?.info?.('这条还是空的，点「改」先填上'); return; }
            main.set(item.text);
            renderMain();
            globalThis.toastr?.info?.('换进框里了，点「保存」才算数；不对就点「撤销」', name);
        });
        const ops = el('div', 'tt-archive-ops');
        const edit = el('button', '', '改');
        const del = el('button', 'del', '删');
        edit.addEventListener('click', () => renderEntry(item, false));
        del.addEventListener('click', () => {
            if (!ask(`删掉「${no}. ${name}」？删了就没了。`)) return;
            const top = body.querySelector('.tt-archive-list')?.scrollTop || 0;
            archive.remove(item.id);
            renderList(top);
        });
        ops.append(edit, del);
        wrap.append(pick, ops);
        return wrap;
    }

    function renderList(keepTop = null) {
        mode = 'list';
        refreshBar = () => {};
        head.replaceChildren();
        head.className = 'tt-text-editor-head tt-tip-row';
        const back = el('button', 'tt-text-editor-back', '‹ 返回');
        back.addEventListener('click', renderMain);
        const name = el('b', '', '存档');
        head.append(back, name);
        head.insertAdjacentHTML('beforeend', tip('点一条换进框里，还要点「保存」才算数，换错了点「撤销」。名字按内容自动概括，想自己起就点「改」。每次保存，换下来的旧版自动存一份；什么都不会自动删，多了自己点「删」。'));

        const list = el('div', 'tt-archive-list');
        const all = archive.list() || [];
        if (!all.length) list.append(el('div', 'tt-archive-empty', '还没有，点下面「＋」存一份'));
        all.forEach((item, i) => list.append(row(i + 1, item)));
        body.replaceChildren(list);

        bar.className = 'tt-wi-draft-actions tt-archive-actions';
        const addNow = el('button', '', '＋ 存一份现在的');
        const addBlank = el('button', '', '＋ 空白一条');
        addNow.addEventListener('click', () => {
            if (!main.area.value.trim()) { globalThis.toastr?.info?.('框里是空的，没东西可存'); return; }
            archive.add({ text: main.area.value });
            renderList();
        });
        addBlank.addEventListener('click', () => {
            const item = archive.add({ text: '' });
            renderEntry(item, true);
        });
        bar.replaceChildren(addNow, addBlank);
        globalThis.requestAnimationFrame?.(() => { list.scrollTop = keepTop ?? list.scrollHeight; });
    }

    // ------------------------------------------------ 改一条存档
    function renderEntry(item, isNew) {
        mode = 'entry';
        head.replaceChildren();
        head.className = 'tt-text-editor-head';
        const nameInput = el('input', 'tt-text-editor-name text_pole');
        nameInput.value = item.named ? item.name : '';
        const autoName = () => archive.summarize?.(draft.area.value) || '';
        nameInput.placeholder = '不起名就按内容自动起';
        const dirty = el('span', 'tt-text-editor-dirty', '● 没保存');
        head.append(nameInput, dirty);
        const draft = makeDraft(item.text, () => refreshBar());
        entry = { item, draft, nameInput, isNew };
        nameInput.addEventListener('input', () => refreshBar());
        body.replaceChildren(draft.area);
        const [cancel, undo, saveBtn] = threeButtons();
        const oldName = item.named ? item.name : '';
        const changed = () => draft.area.value !== item.text || nameInput.value.trim() !== oldName;
        refreshBar = () => {
            undo.disabled = !draft.history.canUndo;
            dirty.hidden = !changed();
            const a = autoName();
            nameInput.placeholder = a && a !== '（空的）' ? `自动：${a}` : '不起名就按内容自动起';
        };
        refreshBar();
        entry.changed = changed;
        cancel.addEventListener('click', tryLeaveEntry);
        undo.addEventListener('click', () => draft.undo());
        saveBtn.addEventListener('click', () => {
            const typed = nameInput.value.trim();
            archive.update(item.id, { name: typed, named: !!typed, text: draft.area.value });
            entry = null;
            renderList();
        });
        if (isNew) draft.area.focus({ preventScroll: true });
    }

    const tryLeaveEntry = () => {
        if (!entry) return renderList();
        if (entry.changed() && !ask('这条改的还没保存，不要了吗？')) return;
        // 新加的空白一条什么都没填就退出：不留空条目
        if (entry.isNew && !entry.item.text.trim()) archive.remove(entry.item.id);
        entry = null;
        renderList();
    };

    // 手机返回键 / Esc：一层一层退
    modal.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (mode === 'entry') tryLeaveEntry();
        else if (mode === 'list') renderMain();
        else tryClose();
    });

    renderMain();
    modal.append(head, body, bar);
    document.body.append(modal);
    open = modal;
    modal.showModal();
    bar.firstChild?.focus({ preventScroll: true });
    return modal;
}
