// 角色变量（v1.18.0）：MVU 变量卡的两个补丁。
// 1. 自动修好格式：MVU 只认 <JSONPatch> 标签里的更新（见 MagVarUpdate 的 extractCommands）。
//    预设盖掉卡里的格式要求时，AI 会吐一个光秃秃的 ```json [ {"op":"replace",...} ] ``` 代码块，
//    MVU 当普通正文不理，面板永远停在初始值，代码块还露在聊天里。
//    收到回复时（在 MVU 之前）给它包上 <UpdateVariable><JSONPatch>，MVU 就照常算、卡的正则照常藏。
//    过一会儿再看算没算上，没算上就替用户按一下卡里的「重新处理变量」。
// 2. 变化气泡：每条回复底下一行行写「林婉茹 · 忠诚度 20 → 43」，没生效的标出来，最新一条能一键修好重算。
// 用户 2026-10-04：「我现在看不到我变量」「前端这块是坏掉的」。扩展页「角色变量」两个开关都能关。
// 只读消息上的变量，不改别家的东西；改的只有消息原文里那段光秃秃的 JSON（包上标签）。

import { tip } from './tip.js';
import { vlog, short, snapshot, setSnapshotProvider } from './var-log.js';

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-mvu-settings';
const CARD = 'tt-mvu-card';
const ctx = () => globalThis.SillyTavern?.getContext?.();

let mountTimer = null;
let observer = null;
let throttleTimer = null;
let lastRun = 0;
let runs = [];
let pausedUntil = 0;
let receivedListener = null;
let refreshListener = null;
let chatListener = null;
const checked = new Set(); // 已经替它按过「重新处理变量」的消息（按原文记），免得来回按
const openCards = new Set(); // 点开过的变量小框（按楼层），重画时保持展开

function settings() {
    const all = ctx()?.extensionSettings;
    if (!all) return { mvuAutoFix: true, mvuBubble: true };
    const s = all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    if (typeof s.mvuAutoFix !== 'boolean') s.mvuAutoFix = true;
    if (typeof s.mvuBubble !== 'boolean') s.mvuBubble = true;
    return s;
}

// ---------------------------------------------------------------- 找光秃秃的 JSONPatch

const HAS_TAG = /<json_?patch>/i;

function looseParse(text) {
    const t = String(text ?? '').trim();
    if (!t.startsWith('[')) return null;
    for (const s of [t, t.replace(/,(\s*[\]}])/g, '$1')]) {
        try { return JSON.parse(s); } catch { /* 下一种 */ }
    }
    return null;
}

function isPatch(value) {
    return Array.isArray(value) && value.length > 0 && value.every((op) =>
        op && typeof op === 'object' && typeof op.op === 'string' && (typeof op.path === 'string' || typeof op.from === 'string'));
}

// 从 start 的 [ 开始找配对的 ]，跳过字符串里的括号
function matchBracket(text, start) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            if (c === '\\') i++;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') {
            depth--;
            if (depth === 0) return c === ']' ? i : -1;
        }
    }
    return -1;
}

// 某些标签块的范围（<think> 里的不动；<UpdateVariable> 里的只补 <JSONPatch>）
function tagRanges(text, names) {
    const out = [];
    const re = new RegExp(`<(${names})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
    for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length]);
    return out;
}
const inside = (ranges, a, b) => ranges.some(([s, e]) => a >= s && b <= e);

// 找出所有没包标签的 JSONPatch：[{start, end, json}]（start/end 含外面的 ``` 围栏）
export function findBarePatches(text) {
    const src = String(text ?? '');
    const found = [];
    const fences = [];
    for (const m of src.matchAll(/```[\w-]*[ \t]*\r?\n?([\s\S]*?)```/g)) {
        const start = m.index;
        const end = start + m[0].length;
        fences.push([start, end]);
        const patch = looseParse(m[1]);
        if (isPatch(patch)) found.push({ start, end, json: m[1].trim(), patch });
    }
    // 围栏外面的光数组
    const re = /\[\s*\{\s*"op"\s*:/g;
    let m;
    while ((m = re.exec(src))) {
        const start = m.index;
        if (fences.some(([s, e]) => start >= s && start < e)) continue;
        const end = matchBracket(src, start);
        if (end < 0) continue;
        const json = src.slice(start, end + 1);
        const patch = looseParse(json);
        if (isPatch(patch)) {
            found.push({ start, end: end + 1, json, patch });
            re.lastIndex = end + 1;
        }
    }
    const think = tagRanges(src, 'think|thinking');
    return found.filter((f) => !inside(think, f.start, f.end)).sort((a, b) => a.start - b.start);
}

// 给光秃秃的 JSONPatch 包上标签；没有要包的返回 null
export function wrapBarePatches(text) {
    const src = String(text ?? '');
    if (HAS_TAG.test(src)) return null;
    const bare = findBarePatches(src);
    if (!bare.length) return null;
    const update = tagRanges(src, 'UpdateVariable');
    let out = src;
    for (const f of [...bare].reverse()) {
        const inner = `<JSONPatch>\n${f.json}\n</JSONPatch>`;
        const block = inside(update, f.start, f.end) ? inner : `<UpdateVariable>\n${inner}\n</UpdateVariable>`;
        out = out.slice(0, f.start) + block + out.slice(f.end);
    }
    return out;
}

// ---------------------------------------------------------------- 读这条消息改了啥

// 消息里所有更新：[{path:[...], kind:'set'|'add'|'remove'|'insert', value}]
export function readChanges(text) {
    const src = String(text ?? '');
    const out = [];
    const pushPatch = (patch) => {
        for (const op of patch) {
            const path = String(op.path ?? op.to ?? '').split('/').filter(Boolean)
                .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
            const kind = op.op === 'replace' ? 'set' : op.op === 'delta' ? 'add' : op.op === 'remove' ? 'remove'
                : (op.op === 'insert' || op.op === 'add') ? 'insert' : op.op;
            out.push({ path, kind, value: op.value });
        }
    };
    for (const m of src.matchAll(/<(json_?patch)>(?:\s*```.*)?((?:(?!<json_?patch>)[\s\S])*?)(?:```\s*)?<\/\1>/gim)) {
        const patch = looseParse(m[2]);
        if (isPatch(patch)) pushPatch(patch);
    }
    // 老写法 _.set('路径', 旧值, 新值); / _.add('路径', 数);
    for (const m of src.matchAll(/_\.(set|add)\(\s*(['"])(.+?)\2\s*,([^;\n]*?)\)\s*;/g)) {
        const args = splitArgs(m[4]);
        const raw = args[args.length - 1];
        if (raw == null) continue;
        out.push({ path: m[3].split('.').filter(Boolean), kind: m[1] === 'add' ? 'add' : 'set', value: parseArg(raw) });
    }
    return out;
}

function splitArgs(s) {
    const out = [];
    let cur = '';
    let q = '';
    for (const c of s) {
        if (q) { cur += c; if (c === q) q = ''; continue; }
        if (c === '"' || c === "'") { q = c; cur += c; continue; }
        if (c === ',') { out.push(cur.trim()); cur = ''; continue; }
        cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

function parseArg(raw) {
    const t = raw.trim();
    if (/^(['"]).*\1$/.test(t)) return t.slice(1, -1);
    const n = Number(t);
    if (t !== '' && !Number.isNaN(n)) return n;
    try { return JSON.parse(t); } catch { return t; }
}

// 一条消息上的 stat_data（酒馆助手存在 message.variables[swipe_id]，很老的版本是直接一个对象）
function statAt(chat, id) {
    const message = chat?.[id];
    const v = message?.variables;
    if (!v || typeof v !== 'object') return null;
    const vars = Array.isArray(v) ? v[message.swipe_id ?? 0] : v;
    return vars?.stat_data ?? null;
}

function statBefore(chat, id) {
    for (let k = id - 1; k >= 0; k--) {
        const s = statAt(chat, k);
        if (s) return s;
    }
    return null;
}

// MVU 老卡的值是 [值, "说明"]，只看值
function plain(v) {
    if (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && (v[0] === null || typeof v[0] !== 'object')) return v[0];
    return v;
}

function getPath(obj, path) {
    let cur = obj;
    for (const k of path) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[k];
    }
    return plain(cur);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 每项：旧值、该变成啥、实际是啥、算上没
export function compare(changes, before, after) {
    return changes.map((c) => {
        const old = before ? getPath(before, c.path) : undefined;
        const now = after ? getPath(after, c.path) : undefined;
        let want;
        if (c.kind === 'set') want = plain(c.value);
        else if (c.kind === 'add' && typeof old === 'number' && typeof c.value === 'number') want = old + c.value;
        let ok = null;
        if (!after) ok = false;
        else if (want !== undefined) ok = same(now, want);
        else if (c.kind === 'remove') ok = now === undefined;
        else ok = !same(now, old);
        return { ...c, old, now, want, ok };
    });
}

// ---------------------------------------------------------------- 给测试日志用

const VERSION = '1.18.1';

function flags(text) {
    const t = String(text ?? '');
    const f = [];
    if (/<UpdateVariable>/i.test(t)) f.push('有<UpdateVariable>');
    if (HAS_TAG.test(t)) f.push('有<JSONPatch>');
    if (/_\.(set|add|insert|remove|assign)\(/.test(t)) f.push('有_.set类命令');
    if (/<StatusPlaceHolderImpl\s*\/>/.test(t)) f.push('有<StatusPlaceHolderImpl/>（MVU处理过的记号）');
    const bare = HAS_TAG.test(t) ? 0 : findBarePatches(t).length;
    if (bare) f.push(`光秃秃的JSONPatch ${bare} 段`);
    if (/```/.test(t)) f.push('有```代码块');
    return f.length ? f.join('、') : '什么变量标记都没有';
}

function varsInfo(message) {
    const v = message?.variables;
    if (!v) return '没有 variables';
    const kind = Array.isArray(v) ? `数组长${v.length}` : '对象';
    const vars = Array.isArray(v) ? v[message.swipe_id ?? 0] : v;
    const keys = vars && typeof vars === 'object' ? Object.keys(vars).join(',') : '空';
    return `variables ${kind}，swipe_id=${message.swipe_id ?? 0}，当前这份的键：${keys || '空'}`;
}

function ranges(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i++) {
        let j = i;
        while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++;
        out.push(i === j ? `${ids[i]}` : `${ids[i]}-${ids[j]}`);
        i = j;
    }
    return out.join(',') || '无';
}

function listenerInfo() {
    const context = ctx();
    const type = (context?.eventTypes ?? context?.event_types)?.MESSAGE_RECEIVED;
    const list = context?.eventSource?.events?.[type];
    if (!Array.isArray(list)) return '看不到监听列表';
    return `MESSAGE_RECEIVED 共 ${list.length} 个监听，本扩展排第 ${list.indexOf(receivedListener) + 1}`;
}

function takeSnapshot() {
    const context = ctx();
    const chat = context?.chat ?? [];
    const mvu = globalThis.Mvu;
    const lines = [];
    lines.push(`扩展 ${VERSION}；设置 自动修=${settings().mvuAutoFix} 气泡=${settings().mvuBubble}`);
    lines.push(`Mvu 全局：${mvu ? `有（${Object.keys(mvu).join(',')}）` : '没有（MVU 脚本没跑起来？）'}`);
    lines.push(`酒馆助手：${globalThis.TavernHelper ? '有' : '没看到 TavernHelper'}；「重新处理变量」按钮：${findReprocessButton() ? '找到了' : '没找到'}`);
    lines.push(listenerInfo());
    lines.push(`角色：${context?.name2 ?? '?'}；聊天 ${context?.getCurrentChatId?.() ?? '?'}，共 ${chat.length} 条`);
    const withStat = chat.map((_, i) => (statAt(chat, i) ? i : -1)).filter((i) => i >= 0);
    lines.push(`有 stat_data 的楼层：${ranges(withStat)}`);
    lines.push(`聊天级变量 stat_data：${context?.chatMetadata?.variables?.stat_data ? '有' : '没有'}`);
    for (let i = Math.max(0, chat.length - 4); i < chat.length; i++) {
        const m = chat[i];
        const el = document.querySelector(`#chat .mes[mesid="${i}"]`);
        lines.push(`  #${i} ${m.is_user ? '用户' : m.is_system ? '系统' : 'AI'} ${short(m.name, 20)}｜${varsInfo(m)}｜${flags(m.mes)}｜页面上${el ? '有' : '没有'}这条，气泡${el?.querySelector(`.${CARD}`) ? '有' : '没有'}`);
    }
    const last = withStat.at(-1);
    if (last !== undefined) lines.push(`最新有变量的 #${last} stat_data：${short(statAt(chat, last), 1500)}`);
    return lines.join('\n');
}

// 收到回复 5 秒后：这条消息最后成了啥样
function laterReport(id) {
    const chat = ctx()?.chat;
    const message = chat?.[id];
    if (!message) { vlog('5秒后', `#${id} 没了`); return; }
    const changes = readChanges(message.mes);
    const rows = compare(changes, statBefore(chat, id), statAt(chat, id));
    const rowText = rows.length
        ? rows.map((r) => `  ${r.path.join('/')}：之前 ${short(r.old, 60)}，该是 ${short(r.want ?? r.value, 60)}，现在 ${short(r.now, 60)}，${r.ok ? '对上了' : '没对上'}`).join('\n')
        : '  （原文里读不出更新命令）';
    vlog('5秒后', `#${id}｜${varsInfo(message)}｜${flags(message.mes)}\n${rowText}\n原文末尾 1500 字：\n${String(message.mes ?? '').slice(-1500)}`);
}

// ---------------------------------------------------------------- 重新算

function findReprocessButton() {
    for (const el of document.querySelectorAll('button, .qr--button, .menu_button, [class*="button"]')) {
        if (el.closest('#chat')) continue;
        if ((el.textContent || '').trim() === '重新处理变量') return el;
    }
    return null;
}

async function reprocess(id) {
    const chat = ctx()?.chat;
    if (!chat || id !== chat.length - 1) { vlog('重新算', `#${id} 不是最后一条，不算`); return false; }
    // 优先按卡自己的按钮：跟用户手点一样
    const button = findReprocessButton();
    if (button) { vlog('重新算', `#${id} 点了卡里的「重新处理变量」`); button.click(); return true; }
    const mvu = globalThis.Mvu;
    if (!mvu?.parseMessage || !mvu?.replaceMvuData || !mvu?.getMvuData) { vlog('重新算', `#${id} 没按钮也没 Mvu 全局，算不了`); return false; }
    let base = null;
    for (let k = id - 1; k >= 0 && !base; k--) {
        const data = mvu.getMvuData({ type: 'message', message_id: k });
        if (data?.stat_data) base = data;
    }
    if (!base) { vlog('重新算', `#${id} 往前找不到有变量的楼层，算不了`); return false; }
    const next = await mvu.parseMessage(chat[id].mes, base);
    if (next) await mvu.replaceMvuData(next, { type: 'message', message_id: id });
    vlog('重新算', `#${id} 用 Mvu.parseMessage 算了，${next ? '写回了' : '没有结果'}`);
    return true;
}

function setMessageText(id, text) {
    const context = ctx();
    const message = context?.chat?.[id];
    if (!message) return false;
    message.mes = text;
    if (Array.isArray(message.swipes) && message.swipes.length) message.swipes[message.swipe_id ?? 0] = text;
    return true;
}

async function fixAndRecalc(id, quiet = false) {
    const context = ctx();
    const message = context?.chat?.[id];
    if (!message) return;
    const fixed = wrapBarePatches(message.mes);
    if (fixed) {
        setMessageText(id, fixed);
        try { context.updateMessageBlock?.(id, message); } catch (error) { console.warn('[酒馆拓展] 刷新消息失败', error); }
        await context.saveChat?.();
    }
    const done = await reprocess(id);
    if (!quiet) {
        if (done) globalThis.toastr?.success?.('格式修好了，变量重新算了一遍', '角色变量');
        else globalThis.toastr?.warning?.('格式修好了，但找不到「重新处理变量」，请手动点一下', '角色变量');
    }
    setTimeout(schedule, 1200);
}

// ---------------------------------------------------------------- 收到回复：先修格式，过会儿看算没算上

function onReceived(rawId) {
    const id = Number(rawId);
    const context = ctx();
    const message = context?.chat?.[id];
    if (!message) { vlog('收到回复', `#${rawId} 找不到这条`); return; }
    if (message.is_user || message.is_system) return;
    vlog('收到回复', `#${id} ${short(message.name, 20)}，${String(message.mes ?? '').length} 字｜${flags(message.mes)}｜${listenerInfo()}`);
    setTimeout(() => laterReport(id), 5000);
    if (!settings().mvuAutoFix) return;
    // 同步改原文：MVU 的监听排在本扩展后面（卡脚本加载得晚），它读到的就是修好的
    const fixed = wrapBarePatches(message.mes);
    if (!fixed) return;
    setMessageText(id, fixed);
    vlog('包标签', `#${id} 给光秃秃的 JSONPatch 包上了 <UpdateVariable><JSONPatch>`);
    setTimeout(() => verify(id), 2000);
}

async function verify(id) {
    const context = ctx();
    const chat = context?.chat;
    const message = chat?.[id];
    if (!message) return;
    // 屏幕上还露着光秃秃的 JSON：重画这一条
    const el = document.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);
    if (el && /"op"\s*:/.test(el.textContent || '')) {
        try { context.updateMessageBlock?.(id, message); } catch { /* 下次重画时就好了 */ }
    }
    const changes = readChanges(message.mes);
    if (!changes.length) return;
    const rows = compare(changes, statBefore(chat, id), statAt(chat, id));
    const key = `${id}:${message.mes}`;
    if (rows.some((r) => r.ok === false) && !checked.has(key)) {
        checked.add(key);
        await reprocess(id);
    }
    await context.saveChat?.();
    schedule();
}

// ---------------------------------------------------------------- 气泡

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function show(v) {
    if (v === undefined) return '（空）';
    if (v === null) return '无';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

function rowHtml(r) {
    const label = r.path.join(' · ') || '（根）';
    const oldText = show(r.old);
    const newText = show(r.ok === false ? (r.want ?? r.value) : r.now);
    const long = oldText.length > 16 || newText.length > 16;
    const arrow = r.kind === 'remove' ? '删掉' : r.ok === false ? '→ 该是' : '→';
    const mark = r.ok === false ? '<span class="tt-mvu-bad">没算上</span>' : '';
    let change = '';
    if (typeof r.old === 'number' && typeof r.now === 'number' && r.ok !== false && r.now !== r.old) {
        const d = r.now - r.old;
        change = `<span class="${d > 0 ? 'tt-mvu-up' : 'tt-mvu-down'}">${d > 0 ? '+' : ''}${d}</span>`;
    }
    return `<div class="tt-mvu-row${long ? ' tt-mvu-long' : ''}${r.ok === false ? ' tt-mvu-row-bad' : ''}">`
        + `<span class="tt-mvu-name">${esc(label)}</span>`
        + `<span class="tt-mvu-val"><span class="tt-mvu-old">${esc(oldText)}</span> ${arrow} <b>${esc(newText)}</b> ${change}${mark}</span>`
        + '</div>';
}

// 正在出字：停止按钮露着
function generating() {
    const stop = document.getElementById('mes_stop');
    return !!stop && getComputedStyle(stop).display !== 'none';
}

function decorateMessage(el, chat) {
    const id = Number(el.getAttribute('mesid'));
    const message = Number.isInteger(id) ? chat?.[id] : null;
    const existing = el.querySelector(`:scope .${CARD}`);
    // 最后一条还在出字，变量还没算，别先标红
    if (message && id === chat.length - 1 && generating()) { existing?.remove(); return; }
    const usesMvu = !!message && !message.is_user && !message.is_system && (!!statAt(chat, id) || !!statBefore(chat, id));
    if (!usesMvu || !settings().mvuBubble) { existing?.remove(); return; }

    const bare = HAS_TAG.test(message.mes) ? [] : findBarePatches(message.mes);
    const changes = readChanges(message.mes);
    const after = statAt(chat, id);
    const rows = compare(changes, statBefore(chat, id), after);
    // v1.18.13 压缩（用户：「基本上没发现有什么用，它只是一个状态栏而已，要不你给它压缩一下」）：
    // 没改的不显示；正常的只留一行「变量 · 林婉茹忠诚度 +3」，点一下才展开；只有没算上（坏了）才整个摊开标红。
    if (!changes.length && !bare.length) { existing?.remove(); return; }
    const isLast = id === chat.length - 1;
    const broken = bare.length > 0 || rows.some((r) => r.ok === false);
    const open = broken || openCards.has(id);
    const sig = JSON.stringify([message.mes.length, message.mes.slice(-200), rows.map((r) => [r.old, r.now, r.ok]), bare.length, isLast, open]);
    if (existing && existing.dataset.sig === sig) return;
    existing?.remove();

    const card = document.createElement('div');
    card.className = `${CARD}${broken ? ' tt-mvu-broken' : ''}${open ? '' : ' tt-mvu-collapsed'}`;
    card.dataset.sig = sig;
    // 一行摘要：数字变了的写「林婉茹忠诚度 +3」，没有数字变化就写改了几项
    const numeric = rows.filter((r) => typeof r.old === 'number' && typeof r.now === 'number' && r.now !== r.old && r.ok !== false)
        .map((r) => `${r.path.slice(-2).join('')} ${r.now - r.old > 0 ? '+' : ''}${r.now - r.old}`);
    let head;
    if (bare.length && !changes.length) head = '变量 · AI 的格式不对，MVU 没认';
    else if (!after) head = `变量 · ${changes.length} 项，还没算`;
    else if (broken) head = `变量 · ${changes.length} 项，有没算上的`;
    else head = `变量 · ${numeric.length ? numeric.slice(0, 3).join('　') + (numeric.length > 3 ? ' …' : '') : `改了 ${changes.length} 项`}`;
    let html = `<div class="tt-mvu-head">${esc(head)}${broken ? '' : `<span class="tt-mvu-arrow">${open ? '收起' : '展开'}</span>`}</div>`;
    html += rows.map(rowHtml).join('');
    if (bare.length && !changes.length) {
        html += compare(readChanges(wrapBarePatches(message.mes) || ''), statBefore(chat, id), null).map(rowHtml).join('');
    }
    if (broken) {
        html += isLast
            ? '<button type="button" class="menu_button tt-mvu-fix">修好并重新算</button>'
            : '<div class="tt-mvu-note">只有最新一条能重新算</div>';
    }
    card.innerHTML = html;
    card.querySelector('.tt-mvu-fix')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        fixAndRecalc(id);
    });
    card.addEventListener('click', (event) => {
        if (!broken && event.target.closest?.('.tt-mvu-head')) {
            if (openCards.has(id)) openCards.delete(id); else openCards.add(id);
            schedule();
            return;
        }
        const row = event.target.closest?.('.tt-mvu-long');
        if (row) row.classList.toggle('tt-mvu-open');
    });
    const text = el.querySelector('.mes_text');
    if (text) text.after(card);
    else (el.querySelector('.mes_block') ?? el).append(card);
}

function decorateChat() {
    const chat = ctx()?.chat;
    if (!chat) return;
    document.querySelectorAll('#chat .mes[mesid]').forEach((el) => {
        try { decorateMessage(el, chat); } catch (error) { vlog('出错', `变量气泡 #${el.getAttribute('mesid')}：${error?.message || error}`); }
    });
}

// 最多每 0.4 秒画一次；10 秒里画了 40 次以上（有别的东西在不停改聊天）就歇 10 秒
function schedule() {
    if (throttleTimer) return;
    const wait = Math.max(0, 400 - (Date.now() - lastRun), pausedUntil - Date.now());
    throttleTimer = setTimeout(() => {
        throttleTimer = null;
        const now = Date.now();
        lastRun = now;
        runs = runs.filter((at) => now - at < 10000);
        runs.push(now);
        if (runs.length > 40) { pausedUntil = now + 10000; runs = []; }
        decorateChat();
    }, wait);
}

function watchChat() {
    if (observer) return true;
    const chat = document.getElementById('chat');
    if (!chat) return false;
    observer = new MutationObserver((list) => {
        // 只是我们自己的气泡变了就不管
        if (list.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.classList?.contains?.(CARD)))) return;
        schedule();
    });
    observer.observe(chat, { childList: true, subtree: true });
    schedule();
    return true;
}

// ---------------------------------------------------------------- 设置

function mountPanel() {
    if (document.getElementById(SETTINGS_ID)) return true;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', `
<div id="${SETTINGS_ID}">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>角色变量</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-mvu-autofix"> <span>自动修好变量格式</span></label>${tip('AI 把变量更新写成光秃秃的 JSON 代码块时（没包 <JSONPatch> 标签），MVU 不认、面板不动。打开后收到回复就自动包好标签，没算上还会替你点一下「重新处理变量」。')}</div>
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-mvu-bubble"> <span>显示变量变化</span></label>${tip('用变量的角色卡，每条回复底下一个小框，写这条改了哪些变量、从多少变成多少。没算上的标红，最新一条能一键修好重新算。长的点一下展开。')}</div>
    </div>
  </div>
</div>`);
    const fix = document.getElementById('tt-mvu-autofix');
    const bubble = document.getElementById('tt-mvu-bubble');
    fix.checked = settings().mvuAutoFix;
    bubble.checked = settings().mvuBubble;
    fix.addEventListener('change', () => { settings().mvuAutoFix = fix.checked; ctx()?.saveSettingsDebounced?.(); schedule(); });
    bubble.addEventListener('change', () => { settings().mvuBubble = bubble.checked; ctx()?.saveSettingsDebounced?.(); schedule(); });
    return true;
}

function bindEvents() {
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    const events = context?.eventSource;
    if (!events?.on || !types) return false;
    if (!receivedListener && types.MESSAGE_RECEIVED) {
        receivedListener = (id) => { try { onReceived(id); } catch (error) { console.warn('[酒馆拓展] 修变量格式失败', error); } };
        // 排到最前面：要在 MVU 读原文之前改好
        if (typeof events.makeFirst === 'function') events.makeFirst(types.MESSAGE_RECEIVED, receivedListener);
        else events.on(types.MESSAGE_RECEIVED, receivedListener);
    }
    if (!chatListener && types.CHAT_CHANGED) {
        chatListener = () => setTimeout(() => snapshot('打开了聊天'), 1500);
        events.on(types.CHAT_CHANGED, chatListener);
    }
    if (!refreshListener) {
        refreshListener = () => setTimeout(schedule, 300);
        for (const t of ['MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'CHAT_CHANGED', 'MESSAGE_DELETED']) {
            if (types[t]) events.on(types[t], refreshListener);
        }
    }
    return true;
}

function unbindEvents() {
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    const events = context?.eventSource;
    try {
        if (receivedListener) events?.removeListener?.(types?.MESSAGE_RECEIVED, receivedListener);
        if (refreshListener) {
            for (const t of ['MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'CHAT_CHANGED', 'MESSAGE_DELETED']) {
                if (types?.[t]) events?.removeListener?.(types[t], refreshListener);
            }
        }
        if (chatListener) events?.removeListener?.(types?.CHAT_CHANGED, chatListener);
    } catch { /* host gone */ }
    chatListener = null;
    receivedListener = null;
    refreshListener = null;
}

export function initMvuFix() {
    clearInterval(mountTimer);
    setSnapshotProvider(takeSnapshot);
    const ready = () => {
        bindEvents();
        const a = watchChat();
        const b = mountPanel();
        return a && b && !!receivedListener;
    };
    if (ready()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (ready() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupMvuFix() {
    clearInterval(mountTimer);
    clearTimeout(throttleTimer);
    throttleTimer = null;
    observer?.disconnect();
    observer = null;
    unbindEvents();
    checked.clear();
    document.querySelectorAll(`#chat .${CARD}`).forEach((el) => el.remove());
    document.getElementById(SETTINGS_ID)?.remove();
}

// 给电脑上的自测脚本用
export const __test = { takeSnapshot, findBarePatches, wrapBarePatches, readChanges, compare, decorateChat, onReceived, settings };
