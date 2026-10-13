// 全屏大窗口改长文字（v1.18.18）：跟世界书内容那个大窗口一个样子（tt-wi-draft-dialog 那套样式）。
// 用户 2026-10-04：「普通那个提示词太难改了，直接做成这个吧……用他们这个全功能」。
// 取消 / 撤销 / 保存；改了没保存亮「● 没保存」，没保存就取消先问一句。
//
// openPromptBook：≡「写法说明」用的三层翻页（v1.18.29，用户 2026-10-13 定的顺序，看过样子图）：
//   ① 选哪段（每段下面写「正在用：xxx」）→ ② 这段的存档列表 → ③ 改一条。同一个窗口里翻，不另弹。
//   每层左上「‹ 返回」回上一层，右上「✕」一下全关（用户：「保存了以后一键关闭……不用再返回上一层了」）。
//   列表里正在用的那条绿框「✓ 正在用」；点一条 = 直接换上（不用再点保存），弹「已换上」。
//   正在用的那条不能删（先换上别的）；「＋ 复制正在用的」复制一份出来改，不碰正在用的。
//   改一条点保存后回到列表（v1.18.30 用户：「保存完……没必要一直停留在这」；v1.18.29 是停在改字页）：
//   改的是正在用的就马上生效，改别的只改那条、不换上。
//   v1.18.23～28 是反的：先进改字页，右上角「存档」才翻到列表，点一条只是换进框里、还要再点保存。
//   名字没起就按内容自动概括（`archive.summarize`），什么都不自动删（用户：「不要删我那些东西……我自己会手动删」）。
// section = { name, desc, archive, current() → 正在用的文字, use(text) 换上 }
// archive = { list(), add({ text, auto }) → 新条目, update(id, { name, named, text }), remove(id), summarize(text), changed(text) }

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
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

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

function makeDialog(label) {
    const modal = el('dialog', 'tt-wi-draft-dialog tt-text-editor');
    modal.setAttribute('aria-label', label);
    const head = el('div', 'tt-text-editor-head');
    const body = el('div', 'tt-text-editor-body');
    const bar = el('div', 'tt-wi-draft-actions');
    modal.append(head, body, bar);
    const close = () => { modal.close(); modal.remove(); open = null; };
    const show = () => {
        document.body.append(modal);
        open = modal;
        modal.showModal();
        bar.firstChild?.focus({ preventScroll: true });
    };
    const threeButtons = () => {
        bar.className = 'tt-wi-draft-actions';
        const buttons = ['取消', '撤销', '保存'].map((label) => el('button', '', label));
        bar.replaceChildren(...buttons);
        return buttons;
    };
    return { modal, head, body, bar, close, show, threeButtons };
}

// 单独改一段长文字（没有存档）
export function openTextEditor({ title = '', value = '', defaultValue = null, onSave }) {
    if (open) return;
    const { modal, head, body, close, show, threeButtons } = makeDialog(title || '编辑');
    const dirty = el('span', 'tt-text-editor-dirty', '● 没保存');
    let refreshBar = () => {};
    const main = makeDraft(value, () => refreshBar());
    head.append(el('b', '', title), dirty);
    if (defaultValue != null) {
        const btn = el('button', 'tt-text-editor-reset', '恢复原版');
        btn.addEventListener('click', () => {
            if (!ask('换成原版？点了还要再点「保存」才算数。')) return;
            main.set(defaultValue);
        });
        head.append(btn);
    }
    body.append(main.area);
    const [cancel, undo, saveBtn] = threeButtons();
    refreshBar = () => { undo.disabled = !main.history.canUndo; dirty.hidden = main.area.value === value; };
    refreshBar();
    const tryClose = () => {
        if (main.area.value !== value && !ask('改的还没保存，不要了吗？')) return;
        close();
    };
    cancel.addEventListener('click', tryClose);
    undo.addEventListener('click', () => main.undo());
    saveBtn.addEventListener('click', () => { try { onSave?.(main.area.value); } finally { close(); } });
    modal.addEventListener('cancel', (event) => { event.preventDefault(); tryClose(); });
    show();
    return modal;
}

// ≡「写法说明」：选哪段 → 存档列表 → 改一条
export function openPromptBook({ title = '写法说明', homeTip = '', listTip = '', sections = [] }) {
    if (open) return;
    const { modal, head, body, bar, close, show, threeButtons } = makeDialog(title);

    let mode = 'home'; // home 选哪段 / list 存档列表 / entry 改一条
    let section = null;
    let entry = null; // { item, draft, nameInput, isNew, changed() }

    const titleOf = (item) => (item.named ? item.name : section.archive.summarize?.(item.text)) || '（空的）';

    // 顶上一行：‹ 返回、标题、ⓘ、✕
    function header({ back = null, name = '', tipText = '', extra = [] }) {
        head.replaceChildren();
        head.className = 'tt-text-editor-head tt-tip-row';
        if (back) {
            const btn = el('button', 'tt-text-editor-back', '‹ 返回');
            btn.addEventListener('click', back);
            head.append(btn);
        }
        head.append(el('b', '', name), ...extra);
        if (tipText) head.insertAdjacentHTML('beforeend', tip(tipText));
        const x = el('button', 'tt-text-editor-x', '✕');
        x.setAttribute('aria-label', '关闭');
        x.addEventListener('click', closeAll);
        head.append(x);
    }

    // 编辑中没保存先问；新加的空白一条什么都没填就走：不留空条目
    function leaveEntry() {
        if (!entry) return true;
        if (entry.changed() && !ask('这条改的还没保存，不要了吗？')) return false;
        // 「复制正在用的」进来一个字没改就走：跟正在用的一模一样，不留这份重复的
        if ((entry.isNew && !entry.item.text.trim()) || entry.copy) section.archive.remove(entry.item.id);
        entry = null;
        return true;
    }
    function closeAll() { if (leaveEntry()) close(); }

    // 正在用的文字不在列表里（以前直接改过、或者第一次打开）就补一条进去，列表里永远看得到正在用的是哪条
    function ensureCurrent(sec) {
        const now = sec.current();
        if (now.trim() && !sec.archive.list().some((x) => same(x.text, now))) sec.archive.add({ text: now, auto: true });
    }

    // ------------------------------------------------ ① 选哪段
    function renderHome() {
        mode = 'home';
        section = null;
        header({ name: title, tipText: homeTip });
        const list = el('div', 'tt-archive-list tt-prompt-home');
        for (const sec of sections) {
            ensureCurrent(sec);
            const now = sec.archive.list().find((x) => same(x.text, sec.current()));
            const using = now ? ((now.named ? now.name : sec.archive.summarize?.(now.text)) || '（空的）') : '';
            const btn = el('button', 'menu_button tt-prompt-pick');
            btn.innerHTML = `<b>${esc(sec.name)}</b><small>${esc(sec.desc || '')}</small>`
                + (using ? `<span class="tt-prompt-using">正在用：${esc(using)}</span>` : '');
            btn.addEventListener('click', () => { section = sec; renderList(); });
            list.append(btn);
        }
        body.replaceChildren(list);
        bar.className = 'tt-wi-draft-actions tt-prompt-home-actions';
        bar.replaceChildren();
    }

    // ------------------------------------------------ ② 存档列表
    function row(no, item) {
        const name = titleOf(item);
        const isNow = same(item.text, section.current());
        const wrap = el('div', 'tt-archive-row');
        if (isNow) wrap.classList.add('is-now');
        const pick = el('button', 'tt-archive-pick');
        const tags = [
            isNow ? '<span class="tt-archive-tag now">✓ 正在用</span>' : '',
            item.builtin ? '<span class="tt-archive-tag">自带</span>' : '',
            item.auto ? '<span class="tt-archive-tag">自动存的</span>' : '',
        ].join('');
        pick.innerHTML = `<span class="tt-archive-name"><span class="tt-archive-no">${no}.</span>${esc(name)}</span>`
            + `<span class="tt-archive-meta">${tags}${item.builtin || !item.at ? '' : `<span class="tt-archive-time">${esc(stamp(item.at))}</span>`}</span>`
            + `<span class="tt-archive-preview">${esc(section.archive.changed?.(item.text)?.slice(0, 2).join('\n') || preview(item.text, name))}</span>`;
        pick.addEventListener('click', () => {
            if (!item.text.trim()) { globalThis.toastr?.info?.('这条还是空的，点「改」先填上'); return; }
            if (isNow) { globalThis.toastr?.info?.('现在用的就是这条', name); return; }
            section.use(item.text);
            renderList(listTop());
            globalThis.toastr?.success?.(`已换上：${no}. ${name}`, section.name);
        });
        const ops = el('div', 'tt-archive-ops');
        const edit = el('button', '', '改');
        const del = el('button', 'del', '删');
        edit.addEventListener('click', () => renderEntry(item, false));
        del.addEventListener('click', () => {
            if (isNow) { globalThis.toastr?.info?.('正在用的这条不能删，先点别的一条换上，再回来删'); return; }
            if (!ask(`删掉「${no}. ${name}」？删了就没了。`)) return;
            const top = listTop();
            section.archive.remove(item.id);
            renderList(top);
        });
        ops.append(edit, del);
        wrap.append(pick, ops);
        return wrap;
    }
    const listTop = () => body.querySelector('.tt-archive-list')?.scrollTop || 0;

    function renderList(keepTop = null) {
        mode = 'list';
        ensureCurrent(section);
        header({ back: renderHome, name: section.name, tipText: listTip });
        const list = el('div', 'tt-archive-list');
        const all = section.archive.list() || [];
        if (!all.length) list.append(el('div', 'tt-archive-empty', '还没有，点下面「＋」加一条'));
        all.forEach((item, i) => list.append(row(i + 1, item)));
        body.replaceChildren(list);

        bar.className = 'tt-wi-draft-actions tt-archive-actions';
        const copy = el('button', '', '＋ 复制正在用的');
        const addBlank = el('button', '', '＋ 空白一条');
        copy.addEventListener('click', () => {
            const now = section.current();
            if (!now.trim()) { globalThis.toastr?.info?.('正在用的是空的，没东西可复制'); return; }
            renderEntry(section.archive.add({ text: now }), false, true);
        });
        addBlank.addEventListener('click', () => renderEntry(section.archive.add({ text: '' }), true));
        bar.replaceChildren(copy, addBlank);
        globalThis.requestAnimationFrame?.(() => { list.scrollTop = keepTop ?? list.scrollHeight; });
    }

    // ------------------------------------------------ ③ 改一条
    function renderEntry(item, isNew, copy = false) {
        mode = 'entry';
        const no = section.archive.list().indexOf(item) + 1;
        const dirty = el('span', 'tt-text-editor-dirty', '● 没保存');
        header({ back: () => { if (leaveEntry()) renderList(); }, name: `改第 ${no} 条`, extra: [dirty] });
        const nameInput = el('input', 'tt-text-editor-name text_pole');
        nameInput.value = item.named ? item.name : '';
        let refreshBar = () => {};
        const draft = makeDraft(item.text, () => refreshBar());
        const changed = () => draft.area.value !== item.text || nameInput.value.trim() !== (item.named ? item.name : '');
        entry = { item, draft, nameInput, isNew, copy, changed };
        nameInput.addEventListener('input', () => refreshBar());
        body.replaceChildren(nameInput, draft.area);
        const [cancel, undo, saveBtn] = threeButtons();
        refreshBar = () => {
            undo.disabled = !draft.history.canUndo;
            dirty.hidden = !changed();
            const a = section.archive.summarize?.(draft.area.value) || '';
            nameInput.placeholder = a && a !== '（空的）' ? `名字（不起就叫：${a}）` : '名字（不起就按内容自动起）';
        };
        refreshBar();
        cancel.addEventListener('click', () => { if (leaveEntry()) renderList(); });
        undo.addEventListener('click', () => draft.undo());
        saveBtn.addEventListener('click', () => {
            // 刚复制出来的那份跟正在用的字一样，但它不是正在用的那条
            const wasNow = !entry.copy && same(item.text, section.current());
            const typed = nameInput.value.trim();
            section.archive.update(item.id, { name: typed, named: !!typed, text: draft.area.value });
            if (wasNow && draft.area.value.trim()) section.use(draft.area.value);
            entry = null;
            renderList();
            globalThis.toastr?.success?.(wasNow ? '存好了，正在用的这条已经生效' : '存好了（没换上，要用就点它）', section.name);
        });
        if (isNew) draft.area.focus({ preventScroll: true });
    }

    // 手机返回键 / Esc：一层一层退
    modal.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (mode === 'entry') { if (leaveEntry()) renderList(); }
        else if (mode === 'list') renderHome();
        else close();
    });

    renderHome();
    show();
    return modal;
}
