// 变量是谁算的（v1.18.45）：每一轮记下变量是 MVU 额外模型（比如 deepseek）算的，还是主模型自己写的、成没成。
// 用户 2026-10-31：「我得监控一下它到底用没用变量」「我不知道这个是现在到底还启动没启动」「集成到这个变量里边……换到这就行了」
// 显示在 ≡「更多工具」→「变量」那页最上面（chat-tools.js 的 openVarsPopup 调 watchHtml），卡片上那行灰字是 lastSummary。
// 只读：MVU 的设置、卡的世界书只看不改。
// 怎么认（照 MVU 4.x 自己的规矩，2026-10-31 读过它的 bundle）：
// 1. 世界书条目名里有 [mvu_update] 或 [mvu_plot] 的卡才走额外模型；一条都没有，MVU 直接读主模型回复里的 <UpdateVariable>
// 2. 走额外模型时冒蓝框「[MVU额外模型解析]变量更新中」（正在请求 / 正在重试（n / m））；失败冒红框「变量更新失败」等
// 3. MVU 事件 mag_command_parsed 带这轮认出的命令，mag_variable_update_ended 表示算完
// 蓝框被 error-dot.js 收走不弹，它收之前先交给这里的 noteToast。

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
    return `<div class="tt-mw">
  <div class="tt-mw-head tt-mw-${head.cls}">${esc(head.text)}</div>
  ${rows ? `<div class="tt-mw-list">${rows}</div>` : '<small class="tt-mw-empty">这个聊天还没记到哪一轮。发一条消息，回完这里就有了</small>'}
</div>`;
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

export const __test = { rowText, load, noteToast, onCommands, onEnded, newRound, checkSupport, reset: () => { rounds = []; supportCache = { key: '', value: null }; } };
