// 变量是谁算的（v1.18.45）：每一轮记下变量是 MVU 额外模型（比如 deepseek）算的，还是主模型自己写的、成没成。
// 用户 2026-10-31：「我得监控一下它到底用没用变量」「我不知道这个是现在到底还启动没启动」「集成到这个变量里边……换到这就行了」
// 显示在 ≡「更多工具」→「变量」那页最上面（chat-tools.js 的 openVarsPopup 调 watchHtml），卡片上那行灰字是 lastSummary。
// MVU 的设置只看不改；卡的世界书只在用户点「让额外模型接手这张卡」并确认后才改（v1.18.46，见下面那段）。
// 怎么认（照 MVU 4.x 自己的规矩，2026-10-31 读过它的 bundle）：
// 1. 世界书条目名里有 [mvu_update] 或 [mvu_plot] 的卡才走额外模型；一条都没有，MVU 直接读主模型回复里的 <UpdateVariable>
// 2. 走额外模型时冒蓝框「[MVU额外模型解析]变量更新中」（正在请求 / 正在重试（n / m））；失败冒红框「变量更新失败」等
// 3. MVU 事件 mag_command_parsed 带这轮认出的命令，mag_variable_update_ended 表示算完
// 蓝框被 error-dot.js 收走不弹，它收之前先交给这里的 noteToast。

import { vlog } from './var-log.js';

const STORE_KEY = 'tt-mvu-rounds';
const MAX_ROUNDS = 40;
const SHOW_ROUNDS = 10;
const TAG = /\[mvu_update\]|\[mvu_plot\]/i;
const EXTRA_TITLE = /MVU额外模型解析/;
const ctx = () => globalThis.SillyTavern?.getContext?.();

let rounds = null;
let listeners = [];
let pollTimer = null;
let supportCache = { key: '', value: null };
let refreshers = new Set();

function load() {
    if (rounds) return rounds;
    try { rounds = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { rounds = []; }
    if (!Array.isArray(rounds)) rounds = [];
    return rounds;
}

function persist() {
    const list = load();
    if (list.length > MAX_ROUNDS) list.splice(0, list.length - MAX_ROUNDS);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* 存不下就只留在内存里 */ }
    refreshers.forEach((fn) => { try { fn(); } catch { /* 弹窗关了 */ } });
}

const chatId = () => ctx()?.getCurrentChatId?.() || '';

function current() {
    const id = chatId();
    return load().filter((r) => r.chat === id).at(-1) || null;
}

function mvuSettings() {
    return ctx()?.extensionSettings?.mvu_settings || null;
}

function extraModelName() {
    const conf = mvuSettings()?.额外模型解析配置;
    if (!conf) return '';
    if (conf.模型来源 === '与插头相同') return '跟主模型同一个接口';
    return conf.模型名称 || conf.模型来源 || '';
}

// 这张卡能不能走额外模型：跟 MVU 一样看卡的主世界书里有没有带标签的条目
async function checkSupport() {
    const c = ctx();
    const ch = c?.characters?.[c?.characterId];
    const book = ch?.data?.extensions?.world || '';
    const key = `${chatId()}|${book}`;
    if (supportCache.key === key && supportCache.value) return supportCache.value;
    let value;
    if (!ch) value = { ok: false, why: '群聊或没选角色卡，MVU 不走额外模型' };
    else if (!book) value = { ok: false, why: '这张卡没挂世界书，变量由主模型自己写' };
    else {
        try {
            const data = await c.loadWorldInfo(book);
            const tagged = Object.values(data?.entries || {}).filter((e) => TAG.test(e.comment || ''));
            value = tagged.length
                ? { ok: true, why: `世界书里有 ${tagged.length} 条带标签` }
                : { ok: false, why: `这张卡有变量，但世界书「${book}」里没有一条的名字写着 [mvu_update]，MVU 就当它不支持额外模型：变量由主模型自己写，额外模型不会跑` };
        } catch {
            value = { ok: false, why: `读不到世界书「${book}」` };
        }
    }
    supportCache = { key, value };
    return value;
}

function newRound(mes) {
    const c = ctx();
    const text = c?.chat?.[mes]?.mes || '';
    const list = load();
    const id = chatId();
    // 同一楼重新生成就盖掉旧的
    const old = list.findIndex((r) => r.chat === id && r.mes === mes);
    if (old >= 0) list.splice(old, 1);
    const round = { chat: id, mes, at: Date.now(), way: 'main', state: 'wait', tries: 0, cmds: null, mainTag: /<UpdateVariable>/i.test(text) };
    list.push(round);
    persist();
    startPoll();
    return round;
}

function markExtra(round) {
    if (round.way !== 'deepseek') {
        round.way = 'deepseek';
        round.exAt = Date.now();
    }
    if (round.state === 'wait') round.state = 'running';
}

// error-dot.js 每冒一个框都先交给这里
export function noteToast(kind, title, message) {
    const text = `${title} ${message}`;
    if (!EXTRA_TITLE.test(text) && !/变量更新中|变量更新失败/.test(text)) return;
    const round = current();
    if (!round || Date.now() - round.at > 10 * 60 * 1000) return;
    if (kind === 'error') {
        markExtra(round);
        round.state = 'fail';
        round.failText = String(title || message).replace(/\[MVU额外模型解析\]/, '').slice(0, 60);
        round.secs = Math.round((Date.now() - (round.exAt || round.at)) / 1000);
    } else {
        markExtra(round);
        const m = text.match(/重试（\s*(\d+)\s*\/\s*(\d+)\s*）/);
        if (m) round.tries = Math.max(round.tries, Number(m[1]));
    }
    persist();
}

function onCommands(...args) {
    const round = current();
    if (!round) return;
    const cmds = args[1] ?? args[0];
    if (Array.isArray(cmds)) round.cmds = cmds.length;
    persist();
}

function onEnded() {
    const round = current();
    if (!round) return;
    if (round.way === 'deepseek') {
        if (round.state === 'running' || round.state === 'wait') {
            round.state = 'ok';
            round.secs = Math.round((Date.now() - (round.exAt || round.at)) / 1000);
        } else if (round.state === 'fail' && round.cmds) round.state = 'fallback';
    } else round.state = 'ok';
    persist();
}

// MVU 的通知被用户关掉时冒不出蓝框，就靠这个看「正在额外模型解析」
function startPoll() {
    clearInterval(pollTimer);
    let n = 0;
    pollTimer = setInterval(() => {
        const round = current();
        if (!round || ++n > 600 || ['ok', 'fallback'].includes(round.state)) { clearInterval(pollTimer); return; }
        if (globalThis.Mvu?.isDuringExtraAnalysis?.()) { markExtra(round); persist(); }
    }, 1000);
}

function onReceived(mes) {
    const n = Number(mes);
    if (!Number.isFinite(n)) return;
    const msg = ctx()?.chat?.[n];
    if (!msg || msg.is_user) return;
    newRound(n);
}

function rowText(r) {
    const cmds = r.cmds == null ? '' : r.cmds ? `改了 ${r.cmds} 处变量` : '没有要改的变量';
    const tries = r.tries ? `（重试 ${r.tries} 次）` : '';
    const secs = r.secs != null ? `${r.secs} 秒` : '';
    if (r.way === 'deepseek') {
        if (r.state === 'running' || r.state === 'wait') return { cls: 'run', text: `额外模型正在算${r.tries ? `（第 ${r.tries + 1} 次）` : ''}…` };
        if (r.state === 'ok') return { cls: 'ok', text: ['额外模型算的', '成功', secs, cmds].filter(Boolean).join(' · ') };
        if (r.state === 'fallback') return { cls: 'fail', text: [`额外模型失败${tries}`, '改用主模型写的那段', cmds].filter(Boolean).join(' · ') };
        return { cls: 'fail', text: [`额外模型失败${tries}`, r.failText, '这轮变量没更新'].filter(Boolean).join(' · ') };
    }
    if (r.state === 'wait') return { cls: 'main', text: '等 MVU 算变量…' };
    return { cls: 'main', text: ['主模型自己写的', cmds || (r.mainTag ? '' : '回复里没有变量段')].filter(Boolean).join(' · ') };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const hhmm = (at) => { const d = new Date(at); const p = (x) => String(x).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };

// 「更多工具」变量卡上那行灰字
export function lastSummary() {
    const r = current();
    if (!r) return '';
    const { text } = rowText(r);
    return `上一轮：${text.split(' · ').slice(0, 2).join(' · ')}`;
}

// 「变量」那页最上面一块
export async function watchHtml() {
    const s = mvuSettings();
    const support = await checkSupport();
    const way = s?.更新方式 || '';
    let head;
    if (!s) head = { cls: 'main', text: '没装 MVU，或者这张卡没带 MVU' };
    else if (way !== '额外模型解析') head = { cls: 'main', text: `MVU 变量更新方式是「${way || '随AI输出'}」，额外模型没在用，变量由主模型自己写` };
    else if (!support.ok) head = { cls: 'fail', text: support.why };
    else head = { cls: 'ok', text: `这张卡用额外模型算变量：${extraModelName() || '（没填模型）'}` };
    const id = chatId();
    const list = load().filter((r) => r.chat === id).slice(-SHOW_ROUNDS).reverse();
    const rows = list.map((r) => {
        const { cls, text } = rowText(r);
        return `<div class="tt-mw-row tt-mw-${cls}"><b>第 ${r.mes} 楼</b><span>${esc(text)}</span><small>${hhmm(r.at)}</small></div>`;
    }).join('');
    const book = cardBook();
    const acts = [];
    if (s && book && !support.ok) acts.push('<div class="menu_button tt-mw-act" data-act="adopt"><i class="fa-solid fa-wand-magic-sparkles"></i> 让额外模型接手这张卡</div>');
    if (book && undoRecord(book)) acts.push('<div class="menu_button tt-mw-act" data-act="undo"><i class="fa-solid fa-rotate-left"></i> 撤销接手（世界书改回原样）</div>');
    return `<div class="tt-mw">
  <div class="tt-mw-head tt-mw-${head.cls}">${esc(head.text)}</div>
  ${acts.join('')}
  ${rows ? `<div class="tt-mw-list">${rows}</div>` : '<small class="tt-mw-empty">这个聊天还没记到哪一轮。发一条消息，回完这里就有了</small>'}
</div>`;
}

// ---------------------------------------------------------------- 让额外模型接手这张卡（v1.18.46）
// 用户 2026-10-31：「不要每次都让我手动加」「识别这块它自己识别，我就给它授权……识别错了，它是个目录……我来自己选，选中一个再点确认」
// 「开局不要弹了」——只在「变量」页点按钮才认、才弹。
// 认法照 MVU 官方「迁移旧 MVU 卡」：变量更新规则 / 变量输出格式 → [mvu_update]（只给额外模型）；
// 正文格式这类「格式指定」→ [mvu_plot]（只给主模型）；变量列表、状态说明、[initvar] → 不加（两边都看）。
// 最稳的退路也是官方给的：只加一条空的 [mvu_update] 条目，原来的条目一条不动。
// 改之前把要动的条目原样（名字、内容）记进扩展设置 mvuAdoptUndo[书名]，「撤销」照这个改回去；存完调酒馆的 reloadWorldInfoEditor，
// 世界书页开着也会刷新成新的（10-31 中午用户在开着的旧编辑页里点了一下，把加好的标签整本盖了回去）。

const UV_CMD = /<UpdateVariable>|JSONPatch|_\.(?:set|insert|assign|remove|unset|delete|add)\s*\(/i;
const NAME_UPDATE = /变量.{0,8}(?:更新|输出|规则|处理|指令)|更新规则|UpdateVariable/i;
// 正文格式模板：要有正文占位（${正文}、<content> 这种），光出现「正文」两个字不算
const STORY_BODY = /\$\{\s*(?:正文|内容|剧情|故事)|<content>|<maintext>|<正文>/i;
const EJS = /<%[_=-]?/;
const INITVAR = /initvar/i;
const EMPTY_TAG_NAME = '[mvu_update]酒馆拓展加的空标签（别删，删了额外模型就不跑了）';
const CHOICES = [
    { key: 'update', tag: '[mvu_update]', label: '交给额外模型' },
    { key: 'plot', tag: '[mvu_plot]', label: '只给主模型' },
    { key: 'both', tag: '', label: '两边都看（不动）' },
];

const extSettings = () => {
    const all = ctx()?.extensionSettings;
    if (!all) return {};
    all['chat-text-color'] ||= {};
    return all['chat-text-color'];
};

function cardBook() {
    const c = ctx();
    return c?.characters?.[c?.characterId]?.data?.extensions?.world || '';
}

// 一条条目该给谁看：返回 { pick, why, strip, locked }
// 拿不准一律「两边都看」：两边都看只是少省点时间；挪错了主模型或额外模型会少看一条（10-31 拿电脑上 8 本世界书对过）
export function classifyEntry(e) {
    const name = String(e.comment || '');
    const text = String(e.content || '');
    if (TAG.test(name)) return { pick: 'keep', why: '已经有标签' };
    if (INITVAR.test(name)) return { pick: 'both', why: '初始变量，不动', locked: true };
    if (NAME_UPDATE.test(name) && !/格式要求|正文格式/.test(name)) return { pick: 'update', why: '名字是变量更新 / 输出那类' };
    if (UV_CMD.test(text)) {
        if (STORY_BODY.test(text)) return { pick: 'plot', why: '正文格式里夹着变量输出', strip: hasUvPlaceholder(text) };
        if (EJS.test(text)) return { pick: 'both', why: '带脚本的剧情条目，顺带提到变量，拿不准就不动' };
        return { pick: 'update', why: '内容在教 AI 写变量更新' };
    }
    return { pick: 'both', why: '' };
}

// 格式模板里那段「<UpdateVariable> ... </UpdateVariable>」占位：只删里面没有真命令的短块
const UV_BLOCK = /[ \t]*<UpdateVariable>([\s\S]{0,160}?)<\/UpdateVariable>[ \t]*\r?\n?/g;
const isPlaceholder = (inner) => !/_\.\w+\s*\(|JSONPatch|"op"\s*:/.test(inner);
export function hasUvPlaceholder(text) {
    return [...String(text).matchAll(UV_BLOCK)].some((m) => isPlaceholder(m[1]));
}
export function stripUvPlaceholder(text) {
    return String(text).replace(UV_BLOCK, (all, inner) => (isPlaceholder(inner) ? '' : all));
}

function undoRecord(book) {
    return extSettings().mvuAdoptUndo?.[book] || null;
}

async function saveBook(book, data) {
    const c = ctx();
    await c.saveWorldInfo(book, data, true);
    try { await c.reloadWorldInfoEditor?.(book); } catch { /* 世界书页没开 */ }
    supportCache = { key: '', value: null };
}

export async function applyAdopt(book, picks, strip, emptyOnly) {
    const c = ctx();
    const data = await c.loadWorldInfo(book);
    if (!data?.entries) throw new Error(`读不到世界书「${book}」`);
    const record = { at: Date.now(), entries: {}, added: [] };
    const done = [];
    if (emptyOnly) {
        const uids = Object.keys(data.entries).map(Number).filter(Number.isFinite);
        const uid = (uids.length ? Math.max(...uids) : -1) + 1;
        const tpl = Object.values(data.entries)[0] || {};
        data.entries[uid] = { ...tpl, uid, displayIndex: uid, comment: EMPTY_TAG_NAME, content: '', key: [], keysecondary: [], disable: true, constant: false };
        record.added.push(uid);
        done.push('加了一条空的 [mvu_update]（关着，不发给任何模型）');
    } else {
        for (const [uid, pick] of Object.entries(picks)) {
            const e = data.entries[uid];
            const choice = CHOICES.find((x) => x.key === pick);
            if (!e || !choice?.tag) continue;
            record.entries[uid] = { comment: e.comment, content: e.content };
            e.comment = `${e.comment || ''}${choice.tag}`;
            if (pick === 'plot' && strip && hasUvPlaceholder(e.content)) {
                e.content = stripUvPlaceholder(e.content);
                done.push(`${e.comment}（去掉了叫主模型写变量的那几行）`);
            } else done.push(e.comment);
        }
        if (!done.length) throw new Error('一条都没选，没改');
    }
    const s = extSettings();
    s.mvuAdoptUndo ||= {};
    s.mvuAdoptUndo[book] = record;
    c.saveSettingsDebounced?.();
    await saveBook(book, data);
    return done;
}

export async function undoAdopt(book) {
    const c = ctx();
    const record = undoRecord(book);
    if (!record) return false;
    const data = await c.loadWorldInfo(book);
    for (const [uid, old] of Object.entries(record.entries || {})) {
        if (!data.entries[uid]) continue;
        data.entries[uid].comment = old.comment;
        data.entries[uid].content = old.content;
    }
    for (const uid of record.added || []) delete data.entries[uid];
    await saveBook(book, data);
    delete extSettings().mvuAdoptUndo[book];
    c.saveSettingsDebounced?.();
    return true;
}

function adoptRow(uid, e, cls) {
    const off = e.disable ? '<em>关着</em>' : '';
    const name = esc(e.comment || `（没名字 #${uid}）`);
    if (cls.locked) return `<div class="tt-ad-row"><span>${name}${off}<small>${esc(cls.why)}</small></span><b class="tt-ad-locked">不动</b></div>`;
    const opts = CHOICES.map((x) => `<option value="${x.key}"${x.key === cls.pick ? ' selected' : ''}>${x.label}</option>`).join('');
    return `<div class="tt-ad-row"><span>${name}${off}${cls.why ? `<small>${esc(cls.why)}</small>` : ''}</span><select data-uid="${uid}">${opts}</select></div>`;
}

export function adoptHtml(book, entries) {
    const all = Object.entries(entries || {}).map(([uid, e]) => ({ uid, e, cls: classifyEntry(e) }));
    const moved = all.filter((x) => ['update', 'plot'].includes(x.cls.pick));
    const rest = all.filter((x) => !['update', 'plot', 'keep'].includes(x.cls.pick));
    const canStrip = moved.some((x) => x.cls.strip);
    return `<h3>让额外模型接手这张卡</h3>
<small class="tt-ad-note">世界书「${esc(book)}」。扩展先认好了每条该给谁看：「交给额外模型」的主模型就看不到了，「只给主模型」的额外模型看不到。认错了就改右边的选项，再点「确认」。改之前会记下原样，「变量」页能撤销。</small>
<div class="tt-ad-group"><b>认出来要挪的（${moved.length} 条）</b>${moved.map((x) => adoptRow(x.uid, x.e, x.cls)).join('') || '<small>一条都没认出来，到下面「其余条目」里自己挑，或者点「只加一条空标签」</small>'}</div>
${canStrip ? '<label class="checkbox_label tt-ad-strip"><input type="checkbox" checked> <span>顺手去掉正文格式里叫主模型写 &lt;UpdateVariable&gt; 的那几行（不去掉，主模型还会接着写变量，白费时间）</span></label>' : ''}
<details class="tt-ad-group"><summary>其余条目（${rest.length} 条，默认两边都看，不动）</summary>${rest.map((x) => adoptRow(x.uid, x.e, x.cls)).join('')}</details>
<div class="menu_button tt-ad-empty"><i class="fa-solid fa-shield"></i> 只加一条空标签（最稳：原来的条目一条不动，额外模型照样接手，但主模型还会接着写变量）</div>`;
}

async function openAdopt() {
    const c = ctx();
    const book = cardBook();
    if (!book) { globalThis.toastr?.info?.('这张卡没挂世界书', '变量'); return; }
    const data = await c.loadWorldInfo(book);
    const box = document.createElement('div');
    box.className = 'tt-adopt';
    box.innerHTML = adoptHtml(book, data?.entries);
    let emptyOnly = false;
    let popup = null;
    const opts = { okButton: '确认', cancelButton: '取消', wide: true, large: true, allowVerticalScrolling: true };
    box.querySelector('.tt-ad-empty').addEventListener('click', () => {
        emptyOnly = true;
        if (popup?.completeAffirmative) popup.completeAffirmative();
        else box.closest('dialog')?.querySelector('.popup-button-ok')?.click();
    });
    let ok;
    if (c.Popup && c.POPUP_TYPE) { popup = new c.Popup(box, c.POPUP_TYPE.CONFIRM, '', opts); ok = await popup.show(); } else ok = await c.callGenericPopup(box, c.POPUP_TYPE.CONFIRM, '', opts);
    if (!ok) return;
    const picks = {};
    box.querySelectorAll('select[data-uid]').forEach((sel) => { if (sel.value !== 'both') picks[sel.dataset.uid] = sel.value; });
    const strip = !!box.querySelector('.tt-ad-strip input')?.checked;
    try {
        const done = await applyAdopt(book, picks, strip, emptyOnly);
        vlog('变量', `世界书「${book}」让额外模型接手：\n  ${done.join('\n  ')}`);
        globalThis.toastr?.success?.(`改了 ${done.length} 条，下一轮起额外模型接手`, '变量');
    } catch (error) {
        globalThis.toastr?.warning?.(String(error?.message || error), '变量');
    }
    persist();
}


// 「变量」页里那排按钮（chat-tools.js 的弹窗把点击交给 watchAction）
export async function watchAction(act) {
    const book = cardBook();
    if (act === 'adopt') await openAdopt();
    else if (act === 'undo') {
        const c = ctx();
        const ok = await c.callGenericPopup(`把世界书「${book}」改回接手之前的样子？`, c.POPUP_TYPE.CONFIRM, '', { okButton: '改回去', cancelButton: '算了' });
        if (!ok) return;
        if (await undoAdopt(book)) {
            vlog('变量', `世界书「${book}」撤销接手，改回原样`);
            globalThis.toastr?.success?.('改回去了', '变量');
        }
        persist();
    }
}

// 弹窗开着时有新进展就重画
export function onWatchChange(fn) {
    refreshers.add(fn);
    return () => refreshers.delete(fn);
}

export function initMvuWatch() {
    const c = ctx();
    const events = c?.eventSource;
    if (!events?.on || listeners.length) return;
    const types = c.eventTypes || c.event_types || {};
    const add = (name, fn) => { if (!name) return; events.on(name, fn); listeners.push([name, fn]); };
    add(types.MESSAGE_RECEIVED || 'message_received', onReceived);
    add('mag_command_parsed', onCommands);
    add('mag_variable_update_ended', onEnded);
    add(types.CHAT_CHANGED || 'chat_id_changed', () => { supportCache = { key: '', value: null }; });
    add(types.WORLDINFO_UPDATED || 'worldinfo_updated', () => { supportCache = { key: '', value: null }; });
}

export function cleanupMvuWatch() {
    const events = ctx()?.eventSource;
    for (const [name, fn] of listeners) events?.removeListener?.(name, fn);
    listeners = [];
    clearInterval(pollTimer);
    refreshers.clear();
}

export const __test = { classifyEntry, stripUvPlaceholder, hasUvPlaceholder, adoptHtml, applyAdopt, undoAdopt, rowText, load, noteToast, onCommands, onEnded, newRound, checkSupport, reset: () => { rounds = []; supportCache = { key: '', value: null }; } };
