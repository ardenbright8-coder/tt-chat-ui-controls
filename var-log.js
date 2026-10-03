// 变量日志（v1.18.1）：查 MVU 变量为什么不动用的流水账。
// 用户 2026-10-04：「你能不能在这个拓展里边单独做个日志功能……我每发一条消息……日志搞出来，我发给你你就知道问题了」。
// 记什么：收到回复时原文里有没有变量标签、本扩展包没包；MVU 自己的事件（开始算、解析出几条命令、算完）；
// 弹出来的报错提示；控制台里跟变量有关的报错；5 秒后这条消息上有没有变量、原文末尾长啥样。
// ≡ 菜单「测试日志」打开，能存到手机、复制、清空。存在 localStorage，刷新不丢，最多留 400 条。

import { tip } from './tip.js';

const STORE_KEY = 'tt-varlog';
const MAX_ENTRIES = 400;
const MAX_ENTRY = 6000;
const MENU_ID = 'option_tt_test_log';
const MVU_EVENTS = ['mag_variable_initialized', 'mag_variable_update_started', 'mag_command_parsed', 'mag_variable_update_ended', 'mag_before_message_update'];
const RELEVANT = /mvu|变量|jsonpatch|updatevariable|stat_data|酒馆助手|tavernhelper|tavern_helper|magvar/i;
const ctx = () => globalThis.SillyTavern?.getContext?.();

let entries = null;
let mountTimer = null;
let saveTimer = null;
let snapshotProvider = null;
let wrapped = null; // 还原用：{ toastr: {...}, console: {...} }
let mvuListeners = [];
let onWindowError = null;

function load() {
    if (entries) return entries;
    try { entries = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { entries = []; }
    if (!Array.isArray(entries)) entries = [];
    return entries;
}

function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(load())); } catch {
            // 满了：砍掉一半再存
            entries = load().slice(-Math.floor(MAX_ENTRIES / 2));
            try { localStorage.setItem(STORE_KEY, JSON.stringify(entries)); } catch { /* 算了 */ }
        }
    }, 300);
}

function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function short(value, max = 600) {
    let s;
    try { s = typeof value === 'string' ? value : JSON.stringify(value); } catch { s = String(value); }
    s = String(s ?? '');
    return s.length > max ? `${s.slice(0, max)}…（共 ${s.length} 字）` : s;
}

// 记一条
export function vlog(kind, text) {
    const list = load();
    let body = String(text ?? '');
    if (body.length > MAX_ENTRY) body = `${body.slice(0, MAX_ENTRY)}…（截断，共 ${body.length} 字）`;
    list.push(`[${stamp()}] ${kind} | ${body}`);
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
    persist();
    refreshOpenPanel();
}

// mvu-fix.js 提供「现在的状态」怎么拍
export function setSnapshotProvider(fn) { snapshotProvider = fn; }

export function snapshot(reason) {
    try { vlog('状态', `${reason}\n${snapshotProvider ? snapshotProvider() : '（没有状态信息）'}`); } catch (error) { vlog('出错', `拍状态失败：${error?.message || error}`); }
}

// ---------------------------------------------------------------- 抓 MVU 事件、弹窗报错、控制台

function describeCommands(commands) {
    if (!Array.isArray(commands)) return short(commands, 300);
    if (!commands.length) return '0 条（MVU 在这条消息里一条更新命令都没认出来）';
    return `${commands.length} 条：\n` + commands.slice(0, 40).map((c) => `  ${c.type} ${short(c.args, 200)}`).join('\n');
}

function hookMvuEvents() {
    const events = ctx()?.eventSource;
    if (!events?.on || mvuListeners.length) return;
    for (const name of MVU_EVENTS) {
        const fn = (...args) => {
            try {
                if (name === 'mag_command_parsed') vlog('MVU', `解析出命令 ${describeCommands(args[1] ?? args[0])}`);
                else if (name === 'mag_variable_update_started') vlog('MVU', '开始算这条消息的变量');
                else if (name === 'mag_variable_update_ended') {
                    const after = args[0]?.stat_data;
                    const before = args[1]?.stat_data;
                    vlog('MVU', `算完了。${before ? '' : '（没拿到算之前的） '}算之后 stat_data：${short(stripInternal(after), 1500)}`);
                } else if (name === 'mag_variable_initialized') vlog('MVU', '新聊天初始化了变量');
                else if (name === 'mag_before_message_update') vlog('MVU', '准备把结果写回消息');
            } catch (error) { vlog('出错', `记 MVU 事件失败：${error?.message || error}`); }
        };
        events.on(name, fn);
        mvuListeners.push([name, fn]);
    }
}

function stripInternal(stat) {
    if (!stat || typeof stat !== 'object') return stat;
    const { $internal, ...rest } = stat;
    return rest;
}

function hookToastAndConsole() {
    if (wrapped) return;
    wrapped = { toastr: {}, console: {} };
    const t = globalThis.toastr;
    if (t) {
        for (const kind of ['error', 'warning', 'info', 'success']) {
            const orig = t[kind];
            if (typeof orig !== 'function') continue;
            wrapped.toastr[kind] = orig;
            t[kind] = function (message, title, ...rest) {
                try { vlog('弹窗', `${kind}${title ? ` 「${short(title, 80)}」` : ''}：${short(String(message ?? '').replace(/<[^>]+>/g, ' '), 400)}`); } catch { /* 不影响弹窗 */ }
                return orig.call(this, message, title, ...rest);
            };
        }
    }
    for (const kind of ['error', 'warn']) {
        const orig = console[kind];
        wrapped.console[kind] = orig;
        console[kind] = function (...args) {
            try {
                const text = args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack || ''}` : short(a, 800))).join(' ');
                if (RELEVANT.test(text)) vlog(kind === 'error' ? '控制台报错' : '控制台警告', short(text, 1500));
            } catch { /* ignore */ }
            return orig.apply(this, args);
        };
    }
    onWindowError = (event) => {
        const text = `${event.message || event.reason?.message || event.reason || ''} ${event.filename || ''}:${event.lineno || ''}`;
        vlog('页面报错', short(text, 800));
    };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onWindowError);
}

function unhook() {
    const events = ctx()?.eventSource;
    for (const [name, fn] of mvuListeners) { try { events?.removeListener?.(name, fn); } catch { /* ignore */ } }
    mvuListeners = [];
    if (wrapped) {
        for (const [kind, fn] of Object.entries(wrapped.toastr)) if (globalThis.toastr) globalThis.toastr[kind] = fn;
        for (const [kind, fn] of Object.entries(wrapped.console)) console[kind] = fn;
        wrapped = null;
    }
    if (onWindowError) {
        window.removeEventListener('error', onWindowError);
        window.removeEventListener('unhandledrejection', onWindowError);
        onWindowError = null;
    }
}

// ---------------------------------------------------------------- 看日志的弹窗

let panel = null;

function logText() {
    const head = `酒馆拓展测试日志 · 导出于 ${stamp()} · ${navigator.userAgent}`;
    return [head, ...load()].join('\n\n');
}

function refreshOpenPanel() {
    if (!panel?.isConnected) return;
    const box = panel.querySelector('.tt-varlog-text');
    const count = panel.querySelector('.tt-varlog-count');
    if (count) count.textContent = `共 ${load().length} 条`;
    if (box) {
        const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
        box.textContent = load().join('\n\n') || '（还没有记录。发一条消息试试）';
        if (atBottom) box.scrollTop = box.scrollHeight;
    }
}

async function saveToPhone() {
    const blob = new Blob([logText()], { type: 'text/plain;charset=utf-8' });
    const name = `酒馆测试日志-${Date.now()}.txt`;
    try {
        const { download } = await import('../../../utils.js');
        await download(blob, name, 'text/plain', { throwOnFailure: true });
        return;
    } catch (error) {
        console.info('[酒馆拓展] 酒馆自带的导出用不了，改用浏览器下载', error);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    globalThis.toastr?.success?.('日志已保存', '变量日志');
}

async function copyAll(button) {
    const text = logText();
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.append(area);
        area.select();
        try { document.execCommand('copy'); } catch { /* ignore */ }
        area.remove();
    }
    button.textContent = '复制好了';
    setTimeout(() => { button.textContent = '复制'; }, 1500);
}

async function confirmPopup(text) {
    const context = ctx();
    if (context?.callGenericPopup && context?.POPUP_TYPE) {
        return !!(await context.callGenericPopup(text, context.POPUP_TYPE.CONFIRM, '', { okButton: '清空', cancelButton: '算了' }));
    }
    return globalThis.confirm?.(text) ?? false;
}

function getPanel() {
    panel = document.createElement('div');
    panel.className = 'tt-varlog';
    panel.innerHTML = `
<h3 class="tt-tip-row">测试日志 ${tip('每发一条消息自动记：AI 原文里有没有变量标签、本扩展包没包、MVU 解析出几条命令、算完变量是多少、有没有报错。出问题时点「存到手机」把文件发给帮你改代码的 AI。「记一下现在」把这会儿的变量状态记一笔。')}</h3>
<div class="tt-varlog-bar">
  <button type="button" class="menu_button tt-varlog-save">存到手机</button>
  <button type="button" class="menu_button tt-varlog-copy">复制</button>
  <button type="button" class="menu_button tt-varlog-snap">记一下现在</button>
  <button type="button" class="menu_button tt-varlog-clear">清空</button>
</div>
<div class="tt-varlog-count"></div>
<pre class="tt-varlog-text"></pre>`;
    panel.querySelector('.tt-varlog-save').addEventListener('click', () => saveToPhone());
    panel.querySelector('.tt-varlog-copy').addEventListener('click', (e) => copyAll(e.currentTarget));
    panel.querySelector('.tt-varlog-snap').addEventListener('click', () => snapshot('手动记一下'));
    panel.querySelector('.tt-varlog-clear').addEventListener('click', async () => {
        if (!await confirmPopup('清空测试日志？')) return;
        entries = [];
        persist();
        refreshOpenPanel();
    });
    return panel;
}

async function openPanel() {
    const context = ctx();
    if (!context?.callGenericPopup) { globalThis.toastr?.info?.('弹不出窗口'); return; }
    const box = getPanel();
    setTimeout(() => {
        refreshOpenPanel();
        const text = box.querySelector('.tt-varlog-text');
        if (text) text.scrollTop = text.scrollHeight;
    }, 0);
    await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
    panel = null;
}

// ≡ 菜单里「测试日志」（用户 2026-10-04 指定放 ≡ 里）。贴底顺序在 wand-menu.js 的 OWN_OPTIONS 里管
function closeOptionsMenu() {
    const menu = document.getElementById('options');
    if (menu && getComputedStyle(menu).display !== 'none') document.getElementById('options_button')?.click();
}

function mountMenuItem() {
    const list = document.querySelector('#options .options-content');
    if (!list) return false;
    if (document.getElementById(MENU_ID)) return true;
    const item = document.createElement('a');
    item.id = MENU_ID;
    item.title = '看每条消息的变量处理记录，能存到手机发给帮你改代码的 AI';
    item.innerHTML = '<i class="fa-lg fa-solid fa-clipboard-list"></i><span>测试日志</span>';
    item.addEventListener('click', (event) => {
        event.preventDefault();
        closeOptionsMenu();
        openPanel();
    });
    list.append(item);
    return true;
}

let menuObserver = null;
function watchMenu() {
    if (menuObserver) return;
    const host = document.getElementById('options');
    if (!host) return;
    // 酒馆重建菜单时补回来（只补一次，不来回抢）
    menuObserver = new MutationObserver(() => { if (!document.getElementById(MENU_ID)) mountMenuItem(); });
    menuObserver.observe(host, { childList: true, subtree: true });
}

export function initVarLog() {
    load();
    hookToastAndConsole();
    clearInterval(mountTimer);
    const ready = () => {
        hookMvuEvents();
        const ok = mountMenuItem();
        if (ok) watchMenu();
        return ok && mvuListeners.length > 0;
    };
    if (ready()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (ready() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupVarLog() {
    clearInterval(mountTimer);
    unhook();
    menuObserver?.disconnect();
    menuObserver = null;
    document.getElementById(MENU_ID)?.remove();
}

export const __test = { load, logText, openPanel };
