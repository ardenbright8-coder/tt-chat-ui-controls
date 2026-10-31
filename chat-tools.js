// 聊天按钮（v1.18.3）：底部那排改版。用户 2026-10-04 定的：
// 1. 「重新处理变量」「重新读取初始变量」不常用、还老被误触：输入框上面那排大按钮藏掉，
//    ≡ 菜单里放一个「变量」，点开一个小框，两个都在里面（点的还是卡里原来那两个按钮，功能不变）。
//    只给它们加 class 藏起来，不搬、不删（别家的按钮只标号不搬，见 AGENTS.md）。
// 2. 「深入」：输入框上面「快捷工具」那一排里的小按钮（v1.18.6 起；1.18.3 时是浮在发送按钮上面的小圆钮）。点了不用打字，给 AI 一次性加一段写法说明再出一条：
//    留在当前场景写深、按人物内核来、聪明人别降智、不写套路。说明在扩展页「聊天按钮」里能改。
//    以后要加别的小图标也往发送按钮上面叠。
// 3. 「到最底下」：≡ 菜单里一项（v1.18.4 起，用户：「也不是常用的，只是更新了以后它才会用」，原来是浮着的小圆钮）。

import { tip } from './tip.js';
import { vlog } from './var-log.js';
import { openPromptBook } from './text-editor.js';

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-chat-tools-settings';
const MENU_ID = 'option_tt_vars';
const DEEPEN_ID = 'tt-deepen-btn';
const BOTTOM_MENU_ID = 'option_tt_bottom';
const PROMPTS_MENU_ID = 'option_tt_prompts';
const PROMPT_KEY = 'tt_deepen';
const VAR_BUTTONS = ['重新处理变量', '重新读取初始变量'];
const HIDE_CLASS = 'tt-varbtn-hidden';
const EMPTY_BAR = 'tt-qrbar-empty';
const ctx = () => globalThis.SillyTavern?.getContext?.();

// v1.18.42 四段写法说明从头来（用户 2026-10-31）：人设、文风都写进预设了，这四段只说这一轮干什么，越短越好
// （「每次发太多的话，模型受不了」）。以前的活人版、V1～V5 全删（用户：「以前的能删掉就删掉……太长了，该写的都写到预设里边了」）。
// v1.18.43 自带三版，名字就叫「第一版」「第二版」「第三版」，别再往下编号；默认第三版（用户自己写的、他说「优化得很好」）。
// 第一版是用户第一次发的原文、第二版是 Claude 写的，这两版照他的两条改过：
// 🚨 ① 不写「我」、不写 {{user}}、不写任何身份，用「本轮」「本轮给出的内容」（用户：「不要带我或者身份，这样容易搞晕」）；
// 🚨 ② 不写「这一下」「停在这一刻 / 这一秒」：模型会以为什么都不能动，就原地重复（用户：「停留在这一秒……就重复写」）。
// 深入是「留在这段戏里往深写，时间照常走」，不是定格。四段归用户，改字要他发原文或点头。
const SEND_1 = `【写好这一轮】
把本轮给出的内容按原意写出来，写饱满；再顺着它往前带一步，让在场的人有回响，局面或气氛因此变一点。`;
const PUSH_1 = `【往下走】
本轮留空。顺着上文直接往下推一步，让新的事情发生；局面、关系或气氛要有实质变化，不原地打转。`;
const DEEPEN_1 = `【深入这场戏】
本轮留空。留在当前这段戏里往深里写，把还没写透的心思、情绪和细节写足。不推新剧情，不换场景，不大幅跳时间，不加新人。`;
const DEEPEN_TEXT_1 = `【深入这场戏】
让本轮给出的内容发生，然后留在这段戏里，顺着它激起的反应、心思和情绪往深里写。不往下推，不换场景，不大幅跳时间，不加新人。`;

const SEND_2 = `【写好这一轮】
本轮给出的是要发生的事，可能是台词、动作、旁白，也可能是对剧情的指示。按原意写出来，写饱满；再顺着它往前带一点，让在场的人有回响，局面或气氛因此变一点。`;
const PUSH_2 = `【往下走】
本轮留空。顺着上下文往下推一步，让新的事情发生，局面、关系或气氛跟上一轮比要有变化，不原地打转。走多远看戏需要，但要接得上前面。`;
const DEEPEN_2 = `【深入这场戏】
本轮留空。不往下一段推，留在当前这段戏里接着写，时间照常往前走，把还没写到的心思、情绪和人物之间的互动写透。不换场景，不加新人。`;
const DEEPEN_TEXT_2 = `【深入这场戏】
让本轮给出的内容发生，然后留在这段戏里接着写：在场的人怎么接、心思怎么变、气氛怎么走，都写透。不往下一段推，不换场景，不加新人。`;

const SEND_3 = `【写好这一轮】
按本轮给出的内容原意写饱满，再顺着这段戏的势头往前延展一小步。让在场人物顺着各自的性子自然应对、有来有往，使眼下的局面或气氛随之发生一点变化。`;
const PUSH_3 = `【往下走】
本轮留空。顺着上下文把戏往下一个阶段推一步，让新的事情发生。自行把握推进的节奏和跨度，让局面、关系或气氛比上一轮有实质变化，不原地打转。`;
const DEEPEN_3 = `【深入这场戏】
本轮留空。留在当前这段戏的范围里往深处展开，不跨向下一阶段。时间正常流动，把这段局面里还没写透的心思、情绪和人物之间微妙的互动写厚实。不开新情节，不换场景，不大幅跳时间，不加新人。`;
const DEEPEN_TEXT_3 = `【深入这场戏】
按本轮给出的内容让事情发生，然后留在它所处的这段局面里往深处展开。顺着它带来的变化，把在场人物的反应、心思浮动和周围的气氛写透，不急着往下推新剧情，不换场景，不大幅跳时间，不加新人。`;

// 换上默认版的标记：手机上 liveSwitched 不是它，就换一次（见 settings()）
const LIVE_LATEST = 'short3';

// ≡「写法说明」里能改的四段；def 是默认用的那版，builtins 是列表里自带的几条（按这个顺序排）
const three = (a, b, c) => () => [{ bid: 'short1', name: '第一版', text: a }, { bid: 'short2', name: '第二版', text: b }, { bid: 'short3', name: '第三版', text: c }];
const PROMPTS = [
    { key: 'deepenPrompt', name: '深入', desc: '点「深入」时用：留在这段戏里往深写，另起一条', def: () => DEEPEN_3,
        builtins: three(DEEPEN_1, DEEPEN_2, DEEPEN_3) },
    { key: 'deepenTextPrompt', name: '深入（写了字）', desc: '输入框有字再点「深入」时用：照你写的发生，再往深写', def: () => DEEPEN_TEXT_3,
        builtins: three(DEEPEN_TEXT_1, DEEPEN_TEXT_2, DEEPEN_TEXT_3) },
    { key: 'sendPrompt', name: '写了字发送', desc: '输入框有字点发送时用：照你写的走，写出戏来', def: () => SEND_3,
        builtins: three(SEND_1, SEND_2, SEND_3) },
    { key: 'pushPrompt', name: '空着发送', desc: '输入框空着点发送时用：另起一条，往下走一步', def: () => PUSH_3,
        builtins: three(PUSH_1, PUSH_2, PUSH_3) },
];

let mountTimer = null;
let observer = null;
let resizeObs = null;
let barTimer = null;
let barRuns = [];
let barPausedUntil = 0;
let posFrame = null;
let deepenArmed = false;
let deepenTimer = null;
let genListeners = [];
let bound = false;

function settings() {
    const all = ctx()?.extensionSettings;
    if (!all) return { varsInMenu: true, deepenButton: true, sendTakeover: true, deepenPrompt: DEEPEN_3, deepenTextPrompt: DEEPEN_TEXT_3, sendPrompt: SEND_3, pushPrompt: PUSH_3 };
    const s = all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    if (typeof s.varsInMenu !== 'boolean') s.varsInMenu = true;
    if (typeof s.deepenButton !== 'boolean') s.deepenButton = true;
    if (typeof s.hideAgentButton !== 'boolean') s.hideAgentButton = true;
    if (typeof s.sendTakeover !== 'boolean') s.sendTakeover = true;
    if (!s.promptArchive || typeof s.promptArchive !== 'object') s.promptArchive = {};
    if (!s.promptArchiveSeeded || typeof s.promptArchiveSeeded !== 'object') s.promptArchiveSeeded = {};
    // 换上默认版，每版只换一次。从 1.18.41 及以前升上来：四段旧存档整个清掉（用户：「以前的能删掉就删掉」）；
    // 从 1.18.42 升上来：只换掉自带的那几条，他这几分钟自己存的留着。列表里自带的是第一、二、三版
    if (s.liveSwitched !== LIVE_LATEST) {
        for (const p of PROMPTS) {
            s[p.key] = p.def();
            const list = Array.isArray(s.promptArchive[p.key]) ? s.promptArchive[p.key] : [];
            s.promptArchive[p.key] = s.liveSwitched === 'short1' ? list.filter((x) => !x.builtin && !x.auto) : [];
            delete s.promptArchiveSeeded[p.key];
        }
        s.deepenPromptOwn = true;
        s.liveSwitched = LIVE_LATEST;
    }
    for (const p of PROMPTS) if (typeof s[p.key] !== 'string' || !s[p.key].trim()) s[p.key] = p.def();
    delete s.bottomButton;
    return s;
}
const save = () => ctx()?.saveSettingsDebounced?.();

// ---------------------------------------------------------------- 变量按钮：藏掉那排，≡ 里点开用

function varButtons() {
    return [...document.querySelectorAll('#send_form .qr--button')].filter((el) => VAR_BUTTONS.includes((el.textContent || '').trim()));
}

function applyBar() {
    const on = settings().varsInMenu;
    document.querySelectorAll(`.${HIDE_CLASS}`).forEach((el) => { if (!on) el.classList.remove(HIDE_CLASS); });
    if (on) {
        for (const button of varButtons()) {
            const group = button.closest('.qr--buttons');
            // 一组里只有这两个就整组藏（连间距一起），混着别的按钮就只藏这两个
            const onlyVars = group && [...group.querySelectorAll('.qr--button')].every((b) => VAR_BUTTONS.includes((b.textContent || '').trim()));
            const target = onlyVars ? group : button;
            if (!target.classList.contains(HIDE_CLASS)) target.classList.add(HIDE_CLASS);
        }
    }
    // 整排都藏光了就把这排也收起来，不留一条空白
    for (const bar of document.querySelectorAll('#send_form #qr--bar')) {
        const visible = [...bar.querySelectorAll('.qr--button')].some((b) => !b.closest(`.${HIDE_CLASS}`));
        const empty = on && !visible;
        if (bar.classList.contains(EMPTY_BAR) !== empty) bar.classList.toggle(EMPTY_BAR, empty);
    }
    schedulePosition();
}

// 刹车：攒 80 毫秒做一次；3 秒里做了 30 次以上就歇 10 秒（只改 class，正常不会来回抢）
function scheduleBar() {
    if (barTimer) return;
    const wait = Math.max(80, barPausedUntil - Date.now());
    barTimer = setTimeout(() => {
        barTimer = null;
        const now = Date.now();
        barRuns = barRuns.filter((at) => now - at < 3000);
        barRuns.push(now);
        if (barRuns.length > 30) { barPausedUntil = now + 10000; barRuns = []; return; }
        applyBar();
    }, wait);
}

function closeOptionsMenu() {
    const menu = document.getElementById('options');
    if (menu && getComputedStyle(menu).display !== 'none') document.getElementById('options_button')?.click();
}

async function openVarsPopup() {
    const context = ctx();
    const box = document.createElement('div');
    box.className = 'tt-vars-pop';
    const found = varButtons();
    box.innerHTML = `<h3 class="tt-tip-row">变量 ${tip('这两个按钮是角色卡自带的（MVU 变量）。重新处理变量：把最后一条回复的变量重新算一遍，数值没变时点。重新读取初始变量：角色卡改了初始数值、或者开局变量坏了才用。')}</h3>`
        + (found.length
            ? VAR_BUTTONS.map((name) => `<button type="button" class="menu_button tt-vars-act" data-name="${name}">${name}</button>`).join('')
            : '<small>这张角色卡没有变量按钮。</small>');
    let popup = null;
    box.addEventListener('click', (event) => {
        const act = event.target.closest('.tt-vars-act');
        if (!act) return;
        const target = varButtons().find((b) => (b.textContent || '').trim() === act.dataset.name);
        if (!target) { globalThis.toastr?.info?.('找不到这个按钮了', '变量'); return; }
        vlog('变量按钮', `从 ≡ 菜单点了「${act.dataset.name}」`);
        target.click();
        popup?.completeAffirmative?.() ?? document.querySelector('.popup:last-of-type .popup-button-ok')?.click();
    });
    if (!context?.callGenericPopup) return;
    if (context.Popup && context.POPUP_TYPE) {
        popup = new context.Popup(box, context.POPUP_TYPE.TEXT, '', { okButton: '关闭' });
        await popup.show();
    } else {
        await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { okButton: '关闭' });
    }
}

function mountMenuItem() {
    const list = document.querySelector('#options .options-content');
    if (!list) return false;
    if (!document.getElementById(BOTTOM_MENU_ID)) {
        const down = document.createElement('a');
        down.id = BOTTOM_MENU_ID;
        down.title = '跳到聊天最底下';
        down.innerHTML = '<i class="fa-lg fa-solid fa-angles-down"></i><span>到最底下</span>';
        down.addEventListener('click', (event) => {
            event.preventDefault();
            closeOptionsMenu();
            jumpBottom();
        });
        list.append(down);
    }
    if (!document.getElementById(PROMPTS_MENU_ID)) {
        const item = document.createElement('a');
        item.id = PROMPTS_MENU_ID;
        item.title = '改深入、写了字发送、空着发送时临时加给 AI 的说明';
        item.innerHTML = '<i class="fa-lg fa-solid fa-feather-pointed"></i><span>写法说明</span>';
        item.addEventListener('click', (event) => {
            event.preventDefault();
            closeOptionsMenu();
            openPromptPicker();
        });
        list.append(item);
    }
    const existing = document.getElementById(MENU_ID);
    if (!settings().varsInMenu) { existing?.remove(); return true; }
    if (existing) return true;
    const item = document.createElement('a');
    item.id = MENU_ID;
    item.title = '重新处理变量、重新读取初始变量';
    item.innerHTML = '<i class="fa-lg fa-solid fa-sliders"></i><span>变量</span>';
    item.addEventListener('click', (event) => {
        event.preventDefault();
        closeOptionsMenu();
        openVarsPopup();
    });
    list.append(item);
    return true;
}

// ---------------------------------------------------------------- 发送按钮上面的小圆图标：深入、到底

function chat() { return document.getElementById('chat'); }
function generating() {
    const stop = document.getElementById('mes_stop');
    return !!stop && getComputedStyle(stop).display !== 'none';
}

// 快捷工具这一排（v1.18.6）：输入框上面单独一排，跟发送按钮一个颜色的小按钮，现在只有「深入」，
// 以后加的快捷工具都往这排放（写进 QUICK_TOOLS）。用户 2026-10-04：「第二排就是以后咱们加的快捷工具」。
// 这排是本扩展自己的元素，放在输入框那块（#nonQRFormItems）前面；不带 qr 的 class，酒馆助手不会管它。
const ROW_ID = 'tt-quick-tools';
const QUICK_TOOLS = [
    { id: DEEPEN_ID, label: '深入', icon: '', title: '深入：围着这场戏写深一条', on: () => settings().deepenButton, click: (e) => onDeepen(e) },
];

function ensureButtons() {
    const form = document.getElementById('send_form');
    if (!form) return;
    let row = document.getElementById(ROW_ID);
    if (!row) {
        row = document.createElement('div');
        row.id = ROW_ID;
        for (const tool of QUICK_TOOLS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.id = tool.id;
            b.className = 'tt-quick-btn';
            b.title = tool.title;
            b.innerHTML = `${tool.icon ? `<i class="fa-solid ${tool.icon}"></i>` : ''}<span>${tool.label}</span>`;
            b.addEventListener('click', tool.click);
            row.append(b);
        }
    }
    // v1.18.16：放进输入框那一行右边那组按钮的最前面（发送 / Agent 左边），用户在截图里圈的位置
    const right = document.getElementById('rightSendForm');
    if (right) {
        if (right.firstElementChild !== row) right.insertBefore(row, right.firstElementChild);
    } else {
        const anchor = form.querySelector(':scope > #nonQRFormItems');
        if (anchor) { if (row.nextElementSibling !== anchor) form.insertBefore(row, anchor); }
        else if (row.parentElement !== form) form.append(row);
    }
}

// 藏 TauriTavern 的 Agent 按钮（发送左边那个原子图标）：用户「我一般不会用那个东西」。
// 只加 body class 用 CSS 藏；Agent 模式开着时（按钮有 active / running）不藏，免得关不掉
function applyAgentHide() {
    document.body?.classList.toggle('tt-hide-agent', !!settings().hideAgentButton);
}

function position() {
    posFrame = null;
    applyAgentHide();
    ensureButtons();
    const row = document.getElementById(ROW_ID);
    if (!row) return;
    let any = false;
    for (const tool of QUICK_TOOLS) {
        const b = document.getElementById(tool.id);
        const show = !!tool.on();
        if (b) b.hidden = !show;
        any ||= show;
    }
    row.hidden = !any;
    const busy = generating();
    row.classList.toggle('tt-quick-busy', busy);
}

function schedulePosition() {
    if (posFrame !== null) return;
    posFrame = setTimeout(position, 60);
}

function jumpBottom() {
    const c = chat();
    if (!c) return;
    c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    // 图片、状态栏晚到会把底部再往下推，过一会儿再补一下
    setTimeout(() => { c.scrollTop = c.scrollHeight; schedulePosition(); }, 700);
}

// ---------------------------------------------------------------- 深入：一次性加写法说明，出一条

function setDeepenPrompt(text) {
    const context = ctx();
    if (typeof context?.setExtensionPrompt !== 'function') return false;
    // 位置：聊天里、深度 0（紧挨最新消息），角色 system；用完就清
    context.setExtensionPrompt(PROMPT_KEY, text, 1, 0, false, 0);
    return true;
}

function disarmDeepen(reason) {
    if (!deepenArmed) return;
    deepenArmed = false;
    clearTimeout(deepenTimer);
    setDeepenPrompt('');
    vlog('深入', `写法说明撤掉了（${reason}）`);
    schedulePosition();
}

// v1.18.15 用户 2026-10-04：
// 1. 深入另起一条新回复，不接在上一条后面续写（「万一深入不好或者改偏，我还可以删掉……一长串的深入，有一条不行就得删一堆」）。
//    他的酒馆空着发送 = 接着上一条续写，所以不点发送按钮，直接叫酒馆生成一条新的（generate('normal')）。
// 2. 输入框里有字：当成这一轮深入的「临时补充」加在说明后面一起给 AI，不作为他的消息发出去，输入框清空
//    （「我给婉茹送了一个玉簪……把我这段话也给带上……做个临时补充」）。出错就把字放回去。
// v1.18.20：输入框有字时，字照常作为你的消息发出去（留在聊天里，写得不好能改了重发），
// 再带上深入说明另起一条回复。用户：「正文别被吃掉呀，我可以修改正文，然后再重新发一遍」。
// （v1.18.15～19 是把字当临时补充塞进说明、清空输入框不发，聊天里看不到）
let deepenSending = false;

async function onDeepen(event) {
    event.preventDefault();
    if (generating()) return;
    const context = ctx();
    const box = document.getElementById('send_textarea');
    const typed = (box?.value ?? '').trim();
    // v1.18.30 写了字用「深入（写了字）」那段，没写字用「深入」那段
    const st = settings();
    if (!setDeepenPrompt(typed ? (st.deepenTextPrompt || DEEPEN_TEXT_3) : (st.deepenPrompt || DEEPEN_3))) {
        globalThis.toastr?.warning?.('这个版本的酒馆不支持临时加说明', '深入');
        return;
    }
    deepenArmed = true;
    clearTimeout(deepenTimer);
    deepenTimer = setTimeout(() => disarmDeepen('5 分钟没出完'), 5 * 60 * 1000);
    vlog('深入', typed ? `点了深入，你写的字照常发出去：${typed.slice(0, 200)}` : '点了深入，另起一条新回复');
    try {
        if (typed) {
            // 点酒馆自己的发送：有字时它发你的消息 + 出新回复；接管发送这次让开，不换成「写好这一轮」
            const send = document.getElementById('send_but');
            if (!send) throw new Error('找不到发送按钮');
            deepenSending = true;
            try { send.click(); } finally { deepenSending = false; }
        } else if (typeof context?.generate === 'function') {
            await context.generate('normal');
        } else {
            // 老版本没有 generate：退回点发送（这时可能接着上一条续写）
            const send = document.getElementById('send_but');
            if (!send) throw new Error('找不到发送按钮');
            send.click();
        }
    } catch (error) {
        disarmDeepen('出错了');
        vlog('出错', `深入生成失败：${error?.message || error}`);
        globalThis.toastr?.error?.(String(error?.message || error), '深入');
    }
}

// ---------------------------------------------------------------- ≡「写法说明」：选一段 → 存档列表 → 改一条

// 按内容给存档起个名字（v1.18.24）：跟哪套自带的一样就叫那个名；在原版上改的叫「改：新加的那句开头」；
// 只删了几条叫「原版少 N 条」；全新写的取第一句开头。一句话截到第一个标点、最多 16 个字。
const cleanLine = (l) => l.trim().replace(/^[-·•*\d.、\s]+/, '').trim();
const isHeading = (l) => /^【[^】]*】$/.test(l);
function shortLine(line) {
    const m = line.match(/^(.{4,}?)[，。；：,;:！？!?（(]/);
    let t = m ? m[1] : line;
    if (t.length > 16) t = `${t.slice(0, 15)}…`;
    return t;
}
export function summarize(text, base, builtins = []) {
    const lines = String(text || '').split('\n').map(cleanLine).filter((l) => l && !isHeading(l));
    if (!lines.length) return '（空的）';
    const same = builtins.find((b) => b.text.trim() === String(text).trim());
    if (same) return same.name;
    const baseLines = String(base || '').split('\n').map(cleanLine).filter((l) => l && !isHeading(l));
    const baseSet = new Set(baseLines);
    const added = lines.filter((l) => !baseSet.has(l));
    if (!added.length) return `原版少 ${Math.max(1, baseLines.length - lines.length)} 条`;
    if (added.length < lines.length) return `改：${shortLine(added[0])}`;
    return shortLine(lines[0]);
}

// 写法说明的存档（v1.18.23）：settings().promptArchive[key] = [{ id, name, text, at, auto }]，旧的在前、新的在后
function archiveFor(p) {
    const st = settings();
    const all = st.promptArchive;
    const seeded = st.promptArchiveSeeded = st.promptArchiveSeeded && typeof st.promptArchiveSeeded === 'object' ? st.promptArchiveSeeded : {};
    const items = () => (all[p.key] = Array.isArray(all[p.key]) ? all[p.key] : []);
    const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // 自带的几条（第一、二、三版）按 PROMPTS 里 builtins 的顺序排
    const builtins = p.builtins();
    let dirty = false;
    // v1.18.23 存的条目名字是「存档 3」「换下来的 · 时间」这种，当成没起名，按内容概括
    for (const x of items()) if (typeof x.named !== 'boolean') { x.named = !/^(存档 \d+|存档 · .*|换下来的 · .*|新的一条)$/.test(x.name || ''); dirty = true; }
    // v1.18.24 自带的也放进同一列、能删：每套自带的只放进来一次（记在 promptArchiveSeeded），删了就不再回来；
    // 以后扩展新加的自带版本，下次打开排到最底下。
    const done = seeded[p.key] = Array.isArray(seeded[p.key]) ? seeded[p.key] : [];
    const fresh = builtins.filter((b) => !done.includes(b.bid));
    if (fresh.length) {
        const list = items();
        const firstTime = !done.length;
        const add = fresh.filter((b) => !list.some((x) => x.text.trim() === b.text.trim()))
            .map((b) => ({ id: newId(), name: b.name, named: true, builtin: true, text: b.text, at: Date.now() }));
        if (firstTime) list.unshift(...add); else list.push(...add);
        done.push(...fresh.map((b) => b.bid));
        dirty = true;
    }
    if (dirty) save();
    return {
        summarize: (text) => summarize(text, p.def(), builtins),
        // 在原版上改的：预览只给改动的那几句，一眼看出跟原版差在哪
        changed(text) {
            const base = new Set(String(p.def()).split('\n').map(cleanLine).filter(Boolean));
            const lines = String(text || '').split('\n').map(cleanLine).filter((l) => l && !isHeading(l));
            const added = lines.filter((l) => !base.has(l));
            return added.length && added.length < lines.length ? added : null;
        },
        list: () => items(),
        add({ text, auto = false }) {
            const item = { id: newId(), name: '', named: false, text, at: Date.now(), ...(auto ? { auto: true } : {}) };
            items().push(item);
            save();
            return item;
        },
        update(id, patch) {
            const item = items().find((x) => x.id === id);
            if (!item) return;
            Object.assign(item, patch, { at: Date.now() });
            delete item.auto;
            save();
        },
        remove(id) {
            const list = items();
            const i = list.findIndex((x) => x.id === id);
            if (i >= 0) { list.splice(i, 1); save(); }
        },
    };
}

// v1.18.29 改成三层翻页（text-editor.js 的 openPromptBook）：选哪段 → 存档列表 → 改一条。
// 列表里点一条就直接换上；正在用的永远在列表里（不在就补一条「自动存的」），所以不用再「保存时把换下来的旧版存一份」。
function useText(p, text) {
    const s = settings();
    s[p.key] = text.trim() ? text : p.def();
    if (p.key === 'deepenPrompt') s.deepenPromptOwn = true;
    save();
    vlog('写法说明', `「${p.name}」换上了另一条`);
}

function openPromptPicker() {
    openPromptBook({
        title: '写法说明',
        homeTip: '这四段是点按钮时临时加给 AI 的说明，只管那一条回复，出完就撤掉。点一段进去：看存过的几条、换着用、改字。',
        listTip: '绿框「✓ 正在用」就是现在用的。点一条直接换上；点「改」进去改字，改的是正在用的那条，保存就生效。名字按内容自动概括，想自己起就在「改」里填。什么都不会自动删，多了自己点「删」（正在用的那条不能删）。',
        sections: PROMPTS.map((p) => ({
            name: p.name,
            desc: p.desc,
            archive: archiveFor(p),
            current: () => settings()[p.key] || p.def(),
            use: (text) => useText(p, text),
        })),
    });
}

// ---------------------------------------------------------------- 接管发送（v1.18.18）
// 写了字：加「写好这一轮」再让酒馆照常发；空着：加「往下走」，自己另起一条新回复（不走酒馆的「按发送键以继续」）。

function armPrompt(text, label) {
    if (!setDeepenPrompt(text)) return false;
    deepenArmed = true;
    clearTimeout(deepenTimer);
    deepenTimer = setTimeout(() => disarmDeepen('5 分钟没出完'), 5 * 60 * 1000);
    vlog('写法说明', `这一条带上「${label}」`);
    return true;
}

async function onSendClick(event) {
    if (!event.target?.closest?.('#send_but')) return;
    if (deepenSending) return; // 深入替你点的发送：说明已经是深入的了
    if (!settings().sendTakeover || generating()) return;
    const box = document.getElementById('send_textarea');
    const typed = (box?.value ?? '').trim();
    if (typed) {
        armPrompt(settings().sendPrompt || SEND_3, '写了字发送');
        return; // 让酒馆照常发
    }
    const context = ctx();
    if (typeof context?.generate !== 'function') { armPrompt(settings().pushPrompt || PUSH_3, '空着发送'); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!armPrompt(settings().pushPrompt || PUSH_3, '空着发送')) return;
    try {
        await context.generate('normal');
    } catch (error) {
        disarmDeepen('出错了');
        vlog('出错', `空着发送生成失败：${error?.message || error}`);
        globalThis.toastr?.error?.(String(error?.message || error), '发送');
    }
}

function bindGeneration() {
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    const events = context?.eventSource;
    if (!events?.on || !types || genListeners.length) return;
    const on = (name, fn) => { if (types[name]) { events.on(types[name], fn); genListeners.push([types[name], fn]); } };
    on('GENERATION_ENDED', () => { disarmDeepen('出完了'); schedulePosition(); });
    on('GENERATION_STOPPED', () => { disarmDeepen('停了'); schedulePosition(); });
    on('GENERATION_STARTED', schedulePosition);
    on('CHAT_CHANGED', () => { disarmDeepen('换了聊天'); setTimeout(() => { applyBar(); schedulePosition(); }, 500); });
    on('MESSAGE_RECEIVED', schedulePosition);
}

// ---------------------------------------------------------------- 扩展页「聊天按钮」


function mountPanel() {
    if (document.getElementById(SETTINGS_ID)) return true;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', `
<div id="${SETTINGS_ID}">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>聊天按钮</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-vars"> <span>变量按钮收进 ≡ 菜单</span></label>${tip('输入框上面「重新处理变量」「重新读取初始变量」那排大按钮藏起来，改从 ≡ 菜单的「变量」点开用。')}</div>
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-deepen"> <span>深入按钮</span></label>${tip('输入框上面快捷工具那一排的「深入」。点了另起一条新回复，AI 围着眼下这场戏写深一条，把人物立起来。输入框里先写几句（比如「我送了她一支玉簪」），点深入就当成这一轮的补充一起带上，不会作为你的消息发出去。')}</div>
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-agent"> <span>藏掉 Agent 按钮</span></label>${tip('发送按钮左边那个原子图标（TauriTavern 的 Agent 模式）。Agent 模式开着时按钮照常显示，方便关掉。')}</div>
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-send"> <span>接管发送</span></label>${tip('写了字点发送：带上「写好这一轮」，照你写的走、写得好看。空着点发送：另起一条新回复，带上「往下走」，不再接着上一条续写。关掉就是酒馆原来的发送。')}</div>
      <div class="menu_button" id="tt-ct-prompts">改写法说明（深入 / 写了字发送 / 空着发送）</div>
    </div>
  </div>
</div>`);
    const s = settings();
    const bind = (id, key, after) => {
        const box = document.getElementById(id);
        box.checked = !!s[key];
        box.addEventListener('change', () => { settings()[key] = box.checked; save(); after(); });
    };
    bind('tt-ct-vars', 'varsInMenu', () => { applyBar(); mountMenuItem(); });
    bind('tt-ct-deepen', 'deepenButton', schedulePosition);
    bind('tt-ct-agent', 'hideAgentButton', applyAgentHide);
    bind('tt-ct-send', 'sendTakeover', () => {});
    document.getElementById('tt-ct-prompts').addEventListener('click', () => openPromptPicker());
    return true;
}

// ---------------------------------------------------------------- 挂上 / 卸下

function bindDom() {
    if (bound) return;
    bound = true;
    window.addEventListener('resize', schedulePosition);
    document.addEventListener('click', onSendClick, true);
    document.addEventListener('focusin', schedulePosition, true);
    document.addEventListener('focusout', schedulePosition, true);
    chat()?.addEventListener('scroll', schedulePosition, { passive: true });
}

function watch() {
    const form = document.getElementById('send_form');
    if (!form) return false;
    if (!observer) {
        observer = new MutationObserver(() => { scheduleBar(); schedulePosition(); });
        observer.observe(form, { childList: true, subtree: true });
    }
    if (!resizeObs && typeof ResizeObserver === 'function') {
        resizeObs = new ResizeObserver(schedulePosition);
        resizeObs.observe(form);
        const c = chat();
        if (c) resizeObs.observe(c);
    }
    return true;
}

export function initChatTools() {
    clearInterval(mountTimer);
    const ready = () => {
        bindGeneration();
        const a = watch();
        if (a) { bindDom(); ensureButtons(); applyBar(); schedulePosition(); }
        const b = mountMenuItem();
        const c = mountPanel();
        return a && b && c && genListeners.length > 0;
    };
    if (ready()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (ready() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupChatTools() {
    clearInterval(mountTimer);
    clearTimeout(barTimer);
    barTimer = null;
    clearTimeout(posFrame);
    posFrame = null;
    disarmDeepen('扩展关了');
    observer?.disconnect();
    observer = null;
    resizeObs?.disconnect();
    resizeObs = null;
    const context = ctx();
    for (const [type, fn] of genListeners) { try { context?.eventSource?.removeListener?.(type, fn); } catch { /* ignore */ } }
    genListeners = [];
    if (bound) {
        window.removeEventListener('resize', schedulePosition);
        document.removeEventListener('click', onSendClick, true);
        document.removeEventListener('focusin', schedulePosition, true);
        document.removeEventListener('focusout', schedulePosition, true);
        chat()?.removeEventListener('scroll', schedulePosition);
        bound = false;
    }
    document.querySelectorAll(`.${HIDE_CLASS}`).forEach((el) => el.classList.remove(HIDE_CLASS));
    document.querySelectorAll(`.${EMPTY_BAR}`).forEach((el) => el.classList.remove(EMPTY_BAR));
    for (const id of [MENU_ID, BOTTOM_MENU_ID, PROMPTS_MENU_ID, ROW_ID, SETTINGS_ID]) document.getElementById(id)?.remove();
    document.body?.classList.remove('tt-hide-agent');
}

export const __test = { applyBar, position, onDeepen, onSendClick, openPromptPicker, PROMPTS, settings, varButtons };
