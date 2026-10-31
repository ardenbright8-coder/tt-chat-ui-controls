// 报错小点（v1.18.39）：后台报错不再刷屏，攒进一页「报错清单」，一点就能整份交给 AI。
// 用户 2026-10-31：「报一次就行了吧……老是在报」「一个问题报一次就行了」「点开它有全篇……一复制一粘贴就过来了……复制完了就自动清空」
// 1. 同一种问题只弹第一次的红框，之后再出不弹，只在清单里加次数；清空以后再出，又弹一次（就知道修没修好）
// 2. MVU 额外模型那几条蓝框（变量更新中 / 正在重试 / 正在请求）不弹，正在更新时小点变淡黄
// 3. 输入框左边一个淡淡的小点：有问题是淡粉，正在更新变量是淡黄，都没有就不显示；点开是报错清单
// 4. 清单「复制给 AI」：整份复制，复制成功就清空，留一份「上一份」能再复制一次
// 盯的是 #toast-container 里新冒出来的框（跟 story-image.js 挡出图红框同一个办法），不改 toastr 本身。

import { tip } from './tip.js';
import { vlog } from './var-log.js';
import { noteToast } from './mvu-watch.js';

const EXTENSION_KEY = 'chat-text-color';
const STORE_KEY = 'tt-error-list';
const LAST_KEY = 'tt-error-list-last';
const DOT_ID = 'tt-error-dot';
const MAX_RAW = 1500;
const MVU_TOAST = /\[MVU|MVU额外模型|变量更新中/;
const SD_DOWN = /SD request failed|object_info/i;
const ctx = () => globalThis.SillyTavern?.getContext?.();

// 报错原文 → 白话原因 + 去哪修。从上往下认，认到第一条算
const KINDS = [
    { key: 'sd', test: SD_DOWN, name: '出图连不上电脑', fix: '电脑上的 ComfyUI 没开，或者手机跟电脑不在一个网里。不出图可以不管' },
    { key: 'auth', test: /unauthori[sz]ed|\b401\b|\b403\b|invalid.{0,30}(token|key|authorization)|api key not valid|permission_denied|incorrect api key/i, name: '密钥被拒', fix: '这把 API 密钥错了、过期了或者被停了。去对应的连接设置里换一把' },
    { key: 'quota', test: /\b429\b|rate.?limit|quota|resource_exhausted|insufficient|余额|额度/i, name: '额度用完或调用太勤', fix: '这家的额度用完了，或者一分钟内调得太多。等一会儿，或者充值 / 换一家' },
    { key: 'net', test: /timed? ?out|etimedout|failed to fetch|networkerror|econnrefused|econnreset|enotfound|socket hang up|network/i, name: '连不上', fix: '网断了，或者那个地址打不开。看看网络和代理' },
    { key: 'server', test: /\b50[0234]\b|internal server error|bad gateway|service unavailable|overloaded/i, name: '对方服务器出问题', fix: '不是你这边的事，那家服务器忙或者坏了。过一会儿再试' },
    { key: 'other', test: /./, name: '其他报错', fix: '看下面的原文，复制给 AI 看' },
];

let observer = null;
let bodyObserver = null;
let mountTimer = null;
let lastMvuAt = 0;
let busyTimer = 0;
let busy = false;

function settings() {
    const all = ctx()?.extensionSettings;
    return all?.[EXTENSION_KEY] || {};
}

function readList(key) {
    try {
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(list) ? list : [];
    } catch { return []; }
}

function writeList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* 存不下就算了，小点照样亮 */ }
}

const problems = () => readList(STORE_KEY);
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
function timeText(at) {
    const d = new Date(at);
    return `${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// 一段时间：同一天后半截只写几点几分
function spanText(from, to) {
    const a = timeText(from);
    const b = timeText(to);
    if (a === b) return a;
    return a.split(' ')[0] === b.split(' ')[0] ? `${a} ～ ${b.split(' ')[1]}` : `${a} ～ ${b}`;
}

function toastText(el) {
    const title = el.querySelector('.toast-title')?.textContent?.trim() || '';
    const message = (el.querySelector('.toast-message')?.textContent || el.textContent || '').replace(/\s+/g, ' ').trim();
    return { title, message };
}

// 谁报的：框里写明是 MVU 的才算它的；只是前后一分钟内 MVU 在更新变量，就标「分不清」——
// 主聊天跟变量更新常常挨着发，「后端错误」框本身不写是谁调的（v1.18.44：主聊天 AI Studio 的 403 被记成了 MVU）
function sourceOf(text) {
    if (SD_DOWN.test(text)) return '出图（图像生成）';
    if (MVU_TOAST.test(text)) return '变量更新（MVU 额外模型）';
    if (Date.now() - lastMvuAt < 60000) return '主聊天或变量更新（两个挨着发，分不清）';
    return '酒馆';
}

// 同一种问题的认法：来源 + 原因 + 原文去掉数字（时间、次数、编号每次不一样）
function record(title, message) {
    const text = `${title} ${message}`;
    const kind = KINDS.find((k) => k.test.test(text));
    const source = sourceOf(text);
    const sig = `${source}|${kind.key}|${text.replace(/\d+/g, '#').slice(0, 160)}`;
    const list = problems();
    const now = Date.now();
    const old = list.find((p) => p.sig === sig);
    if (old) {
        old.count += 1;
        old.last = now;
    } else {
        list.push({ sig, source, kind: kind.key, name: kind.name, fix: kind.fix, title, raw: message.slice(0, MAX_RAW), count: 1, first: now, last: now });
    }
    writeList(STORE_KEY, list);
    paintDot();
    return !old; // 第一次见到才放行红框
}

function onToast(el) {
    if (!(el instanceof HTMLElement) || !el.classList.contains('toast') || el.dataset.ttErrSeen) return;
    el.dataset.ttErrSeen = '1';
    const { title, message } = toastText(el);
    const text = `${title} ${message}`;
    noteToast(el.classList.contains('toast-error') ? 'error' : 'info', title, message); // 变量是谁算的（mvu-watch.js）
    if (el.classList.contains('toast-info') && MVU_TOAST.test(text)) {
        lastMvuAt = Date.now();
        setBusy();
        el.remove();
        return;
    }
    if (!el.classList.contains('toast-error')) return;
    // 出图关着时 story-image.js 已经把这种红框挡了，这里也不记（用户关了出图就是不想听它）
    if (SD_DOWN.test(text) && !settings().autoImageEnabled) return;
    const first = record(title, message);
    if (!first) {
        el.remove();
        vlog('报错清单', `同一个问题又出了一次，没弹：${title} ${message}`.slice(0, 300));
    }
}

// 正在更新变量：MVU 蓝框 20 秒内没再冒就当更新完了
function setBusy() {
    busy = true;
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { busy = false; paintDot(); }, 20000);
    paintDot();
}

function watchToasts() {
    const hook = () => {
        const box = document.getElementById('toast-container');
        if (!box || observer?.box === box) return;
        observer?.disconnect();
        observer = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(onToast)));
        observer.box = box;
        observer.observe(box, { childList: true });
        box.querySelectorAll(':scope > .toast').forEach(onToast);
    };
    hook();
    if (!bodyObserver && document.body) {
        bodyObserver = new MutationObserver(hook);
        bodyObserver.observe(document.body, { childList: true });
    }
}

// 输入框左边那个小点
function paintDot() {
    const dot = document.getElementById(DOT_ID);
    if (!dot) return;
    const count = problems().length;
    dot.classList.toggle('tt-dot-bad', count > 0);
    dot.classList.toggle('tt-dot-busy', busy && count === 0);
    dot.hidden = !count && !busy;
    dot.title = count ? `有 ${count} 个问题，点开看` : '正在更新变量';
}

function mountDot() {
    const left = document.getElementById('leftSendForm');
    if (!left) return false;
    if (document.getElementById(DOT_ID)) return true;
    const dot = document.createElement('div');
    dot.id = DOT_ID;
    dot.hidden = true;
    dot.innerHTML = '<span></span>';
    dot.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openList(); });
    left.append(dot);
    paintDot();
    return true;
}

// 复制给 AI 的那一份：写清哪个版本、用的哪家，再一个问题一段
function packText(list) {
    const c = ctx();
    const cc = c?.chatCompletionSettings || {};
    const version = c?.extensionSettings?.[EXTENSION_KEY]?.lastSeenVersion || '';
    const head = [
        `酒馆拓展报错清单 · 导出于 ${timeText(Date.now())}`,
        `扩展版本：${version}　主模型：${cc.chat_completion_source || c?.mainApi || '?'} / ${cc.custom_model || cc.model || ''}`,
        `共 ${list.length} 个问题`,
    ].join('\n');
    const body = list.map((p, i) => [
        `【${i + 1}】${p.source} · ${p.name} · ${p.count} 次 · ${spanText(p.first, p.last)}`,
        `怎么办：${p.fix}`,
        `原文：${p.title ? `${p.title}：` : ''}${p.raw}`,
    ].join('\n'));
    return [head, ...body].join('\n\n');
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch { /* 手机上可能没权限，走老办法 */ }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
}

async function saveToPhone(text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const name = `酒馆报错清单-${Date.now()}.txt`;
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
}

function listHtml() {
    const list = problems();
    const last = readList(LAST_KEY);
    const rows = list.map((p, i) => `
<div class="tt-err-item">
  <div class="tt-err-head"><b>${i + 1}. ${esc(p.name)}</b><span class="tt-err-count">${p.count} 次</span></div>
  <small class="tt-err-meta">${esc(p.source)} · ${spanText(p.first, p.last)}</small>
  <div class="tt-err-fix">${esc(p.fix)}</div>
  <details class="tt-err-raw"><summary>原文</summary><pre>${esc(p.title ? `${p.title}：${p.raw}` : p.raw)}</pre></details>
</div>`).join('');
    return `<h3 class="tt-tip-row">报错清单 ${tip('后台出的问题都攒在这里，同一个问题只弹第一次，之后只加次数。点「复制给 AI」整份复制，粘贴给帮你修的 AI；复制成功就清空，小点跟着消失。复制完还能点「再复制上一份」。手机上复制不了就点「存到手机」。')}</h3>
${rows || '<div class="tt-err-empty">现在没有问题</div>'}
<div class="tt-err-bar">
  ${list.length ? '<div class="menu_button tt-err-act" data-act="copy"><i class="fa-solid fa-copy"></i> 复制给 AI（复制完清空）</div>' : ''}
  ${!list.length && last.length ? `<div class="menu_button tt-err-act" data-act="copylast"><i class="fa-solid fa-clock-rotate-left"></i> 再复制上一份（${last.length} 个问题）</div>` : ''}
  ${list.length ? '<div class="menu_button tt-err-act" data-act="save"><i class="fa-solid fa-download"></i> 存到手机</div>' : ''}
  ${list.length ? '<div class="menu_button tt-err-act" data-act="clear"><i class="fa-solid fa-trash-can"></i> 清空</div>' : ''}
</div>`;
}

async function openList() {
    const context = ctx();
    if (!context?.callGenericPopup) return;
    const box = document.createElement('div');
    box.className = 'tt-err-list';
    const paint = () => { box.innerHTML = listHtml(); };
    paint();
    box.addEventListener('click', async (event) => {
        const act = event.target.closest?.('.tt-err-act')?.dataset.act;
        if (!act) return;
        const list = problems();
        if (act === 'copy' || act === 'copylast') {
            const src = act === 'copy' ? list : readList(LAST_KEY);
            if (!await copyText(packText(src))) {
                globalThis.toastr?.warning?.('这台手机上复制不了，点「存到手机」', '报错清单');
                return;
            }
            if (act === 'copy') {
                writeList(LAST_KEY, list);
                writeList(STORE_KEY, []);
                vlog('报错清单', `复制给 AI 并清空，${list.length} 个问题`);
            }
            globalThis.toastr?.success?.('复制好了，去粘贴给 AI', '报错清单');
        } else if (act === 'save') {
            await saveToPhone(packText(list));
        } else if (act === 'clear') {
            const ok = await context.callGenericPopup('清空报错清单？', context.POPUP_TYPE.CONFIRM, '', { okButton: '清空', cancelButton: '算了' });
            if (!ok) return;
            writeList(LAST_KEY, list);
            writeList(STORE_KEY, []);
        }
        paint();
        paintDot();
    });
    await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
}

// 「更多工具」那页的卡片要用
export function errorSummary() {
    const n = problems().length;
    return n ? `${n} 个问题` : '没有问题';
}
export { openList as openErrorList };

export function initErrorDot() {
    watchToasts();
    clearInterval(mountTimer);
    if (mountDot()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (mountDot() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupErrorDot() {
    clearInterval(mountTimer);
    clearTimeout(busyTimer);
    observer?.disconnect();
    observer = null;
    bodyObserver?.disconnect();
    bodyObserver = null;
    busy = false;
    document.getElementById(DOT_ID)?.remove();
}

// 给电脑上的自测脚本用
export const __test = { record, onToast, packText, problems, KINDS, paintDot };
