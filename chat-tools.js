// 聊天按钮（v1.18.3）：底部那排改版。用户 2026-10-04 定的：
// 1. 「重新处理变量」「重新读取初始变量」不常用、还老被误触：输入框上面那排大按钮藏掉，
//    ≡ 菜单里放一个「变量」，点开一个小框，两个都在里面（点的还是卡里原来那两个按钮，功能不变）。
//    只给它们加 class 藏起来，不搬、不删（别家的按钮只标号不搬，见 AGENTS.md）。
// 2. 「深入」：发送按钮正上方一个小圆图标。点了不用打字，给 AI 一次性加一段写法说明再出一条：
//    留在当前场景写深、按人物内核来、聪明人别降智、不写套路。说明在扩展页「聊天按钮」里能改。
//    以后要加别的小图标也往发送按钮上面叠。
// 3. 「到最底下」：≡ 菜单里一项（v1.18.4 起，用户：「也不是常用的，只是更新了以后它才会用」，原来是浮着的小圆钮）。

import { tip } from './tip.js';
import { vlog } from './var-log.js';

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-chat-tools-settings';
const MENU_ID = 'option_tt_vars';
const DEEPEN_ID = 'tt-deepen-btn';
const BOTTOM_MENU_ID = 'option_tt_bottom';
const PROMPT_KEY = 'tt_deepen';
const VAR_BUTTONS = ['重新处理变量', '重新读取初始变量'];
const HIDE_CLASS = 'tt-varbtn-hidden';
const EMPTY_BAR = 'tt-qrbar-empty';
const ctx = () => globalThis.SillyTavern?.getContext?.();

// v1.18.3 的第一版，用户手机上存的要是这版原样，就换成新版
const DEEPEN_V1 = `【本轮写法：原地深入】
接着上一条往下写，这一条只做一件事：把眼下这场戏写深、写活。

一、锁住场景
- 留在同一个地点、同一段时间里。不跳时间，不换地方，不引出新事件、新人物，不急着收尾或推进到下一段剧情。

二、先想人，再下笔（心里想，不要写出来）
- 对每个在场角色想清楚：此刻最想要什么、最怕什么、藏着什么没说的心思、对在场其他人的真实判断。
- 回去对照角色设定和世界书里这个人的性格内核、身份、过往和说话方式，行为从这些出发，而不是从一个标签出发。

三、聪明人要真聪明
- 精明、多疑、有城府的角色，会试探、会看穿、会留后手、会算计得失，不会被一句话糊弄，也不会为了让{{user}}好过而突然犯傻或配合。
- 每个人都在为自己的目的行事，立场之间要有真实的拉扯。

四、把性格的复杂写出来
- 写言行不一、表面和内心的反差、同时存在的矛盾冲动。
- 用动作、台词、语气、潜台词、细小的习惯动作把性格演出来，不要用旁白直接下结论（不要写「他很精明」，要写出他精明的那一下）。

五、不写套路
- 不写客套的礼尚往来和千篇一律的反应。每个在场角色至少给出一个只有他才会有的反应或台词。
- 加入一个出人意料、但完全合乎人设的细节。

六、写深
- 放慢节奏：动作的细节、对话一来一回的交锋、各自心里的翻涌、身体感受和环境里的声音气味光线。

七、收尾
- 停在一个留给{{user}}接话或行动的地方，不替{{user}}说话、做决定。
- 本来要写的格式（状态、变量更新这些）照常写。`;

// v1.18.4：用户 2026-10-04 改的方向——不禁新人物新事件，只要服务眼下这场戏；对话是表现人物的主力
export const DEFAULT_DEEPEN = `【本轮写法：深入这场戏】
接着上一条写，把眼下这段剧情写深、写活。

一、围着眼下这件事写
- 剧情还没聊完，就别急着收尾、跳时间或换到别处。
- 可以加新东西：路过的配角、突发的小事、一个有意思的物件或意外。但加的东西要服务这场戏——让此刻更有意思、更有张力，或者逼出人物更多的一面，不能把剧情带去另一条线。

二、对话是主角（重点）
- 人物性格主要靠说话演出来。多写台词，让对话一来一回地交锋。
- 每个人说话要有自己的味道：用词、句子长短、说话直不直接、口头禅、刻意回避的话题，盖住名字也能认出是谁在说。
- 话里有话：每个人这次开口都带着自己的目的；有些心思不会直说，要从措辞、试探、岔开话题、欲言又止里露出来。
- 动作、神态、语气、环境给对话加力：一个眼神、一个停顿、一个和嘴上说的不一样的小动作，让台词更有分量。

三、按人设的内核来
- 下笔前（心里想，不写出来）回看角色设定和世界书：这个人的身份、过往、性格内核、说话方式；此刻最想要什么、最怕什么、对在场的人真实怎么看。
- 行为从这些出发，不要只贴标签。精明的人要真精明：会察言观色、试探、留后手，不会为了配合{{user}}突然变笨或变软。
- 把性格的复杂写出来：嘴上和心里不一样，同时有矛盾的念头。不要用旁白下结论（不写「她很精明」，写出她精明的那句话）。

四、不写套路
- 不写客套的礼尚往来和谁都能说的场面话。每个在场角色至少有一句只有他才会说的话。
- 给一个出人意料、但完全合乎人设的反应或细节。

五、收尾
- 停在留给{{user}}接话或行动的地方，不替{{user}}说话、做决定。
- 本来要写的格式（状态栏、变量更新这些）照常写。`;

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
    if (!all) return { varsInMenu: true, deepenButton: true, deepenPrompt: DEFAULT_DEEPEN };
    const s = all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    if (typeof s.varsInMenu !== 'boolean') s.varsInMenu = true;
    if (typeof s.deepenButton !== 'boolean') s.deepenButton = true;
    if (typeof s.deepenPrompt !== 'string' || !s.deepenPrompt.trim() || s.deepenPrompt === DEEPEN_V1) s.deepenPrompt = DEFAULT_DEEPEN;
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

function ensureButtons() {
    if (!document.getElementById(DEEPEN_ID)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = DEEPEN_ID;
        b.className = 'tt-float-btn';
        b.setAttribute('aria-label', '深入');
        b.title = '深入：围着这场戏写深';
        b.innerHTML = '<i class="fa-solid fa-magnifying-glass-plus"></i>';
        b.addEventListener('click', onDeepen);
        document.body.append(b);
    }
}

// 对准发送按钮：横着跟它居中，竖着摆在输入框那块上面
function position() {
    posFrame = null;
    const form = document.getElementById('send_form');
    const send = document.getElementById('send_but');
    const deepen = document.getElementById(DEEPEN_ID);
    if (!form || !deepen) return;
    const s = settings();
    const formRect = form.getBoundingClientRect();
    const visibleForm = formRect.height > 0 && getComputedStyle(form).display !== 'none';
    const sendRect = send && send.offsetParent ? send.getBoundingClientRect() : null;
    const size = 40;
    const centerX = sendRect && sendRect.width ? sendRect.left + sendRect.width / 2 : formRect.right - 30;
    const left = Math.round(Math.min(window.innerWidth - size - 6, Math.max(6, centerX - size / 2)));
    const baseBottom = Math.round(window.innerHeight - formRect.top + 8);

    const showDeepen = s.deepenButton && visibleForm && !generating();
    deepen.classList.toggle('tt-float-on', showDeepen);
    deepen.style.left = `${left}px`;
    deepen.style.bottom = `${baseBottom}px`;
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

function onDeepen(event) {
    event.preventDefault();
    if (generating()) return;
    const text = settings().deepenPrompt || DEFAULT_DEEPEN;
    if (!setDeepenPrompt(text)) {
        globalThis.toastr?.warning?.('这个版本的酒馆不支持临时加说明', '深入');
        return;
    }
    deepenArmed = true;
    clearTimeout(deepenTimer);
    deepenTimer = setTimeout(() => disarmDeepen('5 分钟没出完'), 5 * 60 * 1000);
    const box = document.getElementById('send_textarea');
    vlog('深入', `点了深入${box?.value.trim() ? '（输入框里有字，一起发）' : ''}`);
    const send = document.getElementById('send_but');
    if (send) send.click();
    else disarmDeepen('找不到发送按钮');
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

function promptStatus(dirty) {
    const mark = document.getElementById('tt-deepen-dirty');
    if (mark) mark.style.visibility = dirty ? 'visible' : 'hidden';
}

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
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-ct-deepen"> <span>深入按钮</span></label>${tip('发送按钮上面一个放大镜小圆钮。点了不用打字，AI 围着眼下这场戏接着写深一条，多用对话把人物演出来。')}</div>
      <div class="tt-tip-row"><b>深入时给 AI 的说明</b>${tip('点「深入」时，这段话会临时加给 AI，只管这一条，出完就撤掉。改完点「保存」才算数。')}<span id="tt-deepen-dirty" class="tt-dirty">● 没保存</span></div>
      <textarea id="tt-ct-prompt" class="text_pole" rows="10"></textarea>
      <div class="tt-ct-actions">
        <div class="menu_button" id="tt-ct-save">保存</div>
        <div class="menu_button" id="tt-ct-cancel">取消</div>
        <div class="menu_button" id="tt-ct-reset">恢复原版</div>
      </div>
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
    const area = document.getElementById('tt-ct-prompt');
    area.value = s.deepenPrompt;
    promptStatus(false);
    area.addEventListener('input', () => promptStatus(area.value !== settings().deepenPrompt));
    document.getElementById('tt-ct-save').addEventListener('click', () => {
        settings().deepenPrompt = area.value.trim() ? area.value : DEFAULT_DEEPEN;
        area.value = settings().deepenPrompt;
        save();
        promptStatus(false);
        globalThis.toastr?.success?.('存好了', '深入说明');
    });
    document.getElementById('tt-ct-cancel').addEventListener('click', () => {
        area.value = settings().deepenPrompt;
        promptStatus(false);
    });
    document.getElementById('tt-ct-reset').addEventListener('click', async () => {
        const context = ctx();
        const ok = context?.callGenericPopup
            ? await context.callGenericPopup('把深入说明恢复成原版？你改过的会没了。', context.POPUP_TYPE.CONFIRM, '', { okButton: '恢复', cancelButton: '算了' })
            : globalThis.confirm?.('把深入说明恢复成原版？');
        if (!ok) return;
        area.value = DEFAULT_DEEPEN;
        settings().deepenPrompt = DEFAULT_DEEPEN;
        save();
        promptStatus(false);
    });
    return true;
}

// ---------------------------------------------------------------- 挂上 / 卸下

function bindDom() {
    if (bound) return;
    bound = true;
    window.addEventListener('resize', schedulePosition);
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
        document.removeEventListener('focusin', schedulePosition, true);
        document.removeEventListener('focusout', schedulePosition, true);
        chat()?.removeEventListener('scroll', schedulePosition);
        bound = false;
    }
    document.querySelectorAll(`.${HIDE_CLASS}`).forEach((el) => el.classList.remove(HIDE_CLASS));
    document.querySelectorAll(`.${EMPTY_BAR}`).forEach((el) => el.classList.remove(EMPTY_BAR));
    for (const id of [MENU_ID, BOTTOM_MENU_ID, DEEPEN_ID, SETTINGS_ID]) document.getElementById(id)?.remove();
}

export const __test = { applyBar, position, onDeepen, settings, varButtons };
