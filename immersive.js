// 沉浸式聊天（v1.16.9，手机）：聊天时尽量只看正文和图。
// 1. 顶上工具栏平时藏起来，点顶上正中那条小横杠滑下来；点聊天里任何地方收回去。开着面板（世界书、角色卡这些）时不收。
// 2. 底下输入框平时一行（按钮和输入框挤一行），点进去才展开成整行宽；发完、空着点别处就缩回一行。
// 3. 酒馆的「全屏模式」只藏手机状态栏，状态栏那块地方还留着，顶上空一条；全屏时把它还给聊天。
// 用户 2026-10-02：「沉浸式聊天嘛……很占空间」。扩展页「沉浸式聊天」能关，关掉就是原来的样子。
// 样子全在 style.css 的 v1.16.9 那段，这里只管开关几个 body 上的 class。

import { tip } from './tip.js';

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-immersive-settings';
const HANDLE_ID = 'tt-top-handle';
const ON = 'tt-immersive';
const TOP_OPEN = 'tt-top-open';
const INPUT_OPEN = 'tt-input-open';
const SYS_FULL = 'tt-sys-fullscreen';
const ctx = () => globalThis.SillyTavern?.getContext?.();

let mountTimer = null;
let collapseTimer = null;
let bound = false;

function settings() {
    const all = ctx()?.extensionSettings;
    if (!all) return { immersiveChat: true };
    const s = all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    if (typeof s.immersiveChat !== 'boolean') s.immersiveChat = true;
    return s;
}

const body = () => document.body;
const input = () => document.getElementById('send_textarea');
const drawerOpen = () => !!document.querySelector('#top-settings-holder .drawer-content.openDrawer');

// 安卓上酒馆「全屏模式」开没开：问它自己的桥
function checkSystemFullscreen() {
    let full = false;
    try { full = !!globalThis.TauriTavernAndroidSystemUiBridge?.isImmersiveFullscreenEnabled?.(); } catch { /* 读不到当没开 */ }
    body()?.classList.toggle(SYS_FULL, full);
}

function setTop(open) {
    body()?.classList.toggle(TOP_OPEN, open);
}

// 输入框展开：正在打字，或者里面有字
function refreshInput() {
    const box = input();
    const open = !!box && (document.activeElement === box || box.value.trim() !== '');
    body()?.classList.toggle(INPUT_OPEN, open);
}

// 点按钮那一下输入框先失焦，马上缩回去会让按钮挪位、点空；等一下再看
function refreshInputLater() {
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(refreshInput, 350);
}

function onPointerDown(event) {
    if (!body()?.classList.contains(ON)) return;
    if (event.target.closest?.(`#${HANDLE_ID}`)) return;
    // 点聊天里任何地方：工具栏收回去（开着面板时不收）
    if (body().classList.contains(TOP_OPEN) && event.target.closest?.('#chat') && !drawerOpen()) setTop(false);
}

function onHandleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    setTop(!body().classList.contains(TOP_OPEN));
}

function onClick(event) {
    if (event.target.closest?.('#send_but, #mes_continue')) refreshInputLater();
    if (event.target.closest?.('#option_toggle_fullscreen')) setTimeout(checkSystemFullscreen, 400);
}

function apply() {
    const on = settings().immersiveChat;
    body()?.classList.toggle(ON, on);
    if (!on) {
        body()?.classList.remove(TOP_OPEN, INPUT_OPEN);
        return;
    }
    checkSystemFullscreen();
    refreshInput();
}

function mountHandle() {
    if (document.getElementById(HANDLE_ID)) return;
    const handle = document.createElement('div');
    handle.id = HANDLE_ID;
    handle.title = '点一下拉出工具栏';
    handle.innerHTML = '<span></span>';
    handle.addEventListener('click', onHandleClick);
    document.body.appendChild(handle);
}

function mountPanel() {
    if (document.getElementById(SETTINGS_ID)) return true;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', `
<div id="${SETTINGS_ID}">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>沉浸式聊天</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-immersive-on"> <span>沉浸式聊天（手机）</span></label>${tip('顶上工具栏平时藏起来，点顶上正中那条小横杠拉出来，点聊天收回去；底下输入框平时一行，点进去才展开。酒馆的全屏模式下，顶上不再空一条。关掉就是原来的样子。')}</div>
    </div>
  </div>
</div>`);
    const box = document.getElementById('tt-immersive-on');
    box.checked = settings().immersiveChat;
    box.addEventListener('change', () => {
        settings().immersiveChat = box.checked;
        ctx()?.saveSettingsDebounced?.();
        apply();
    });
    return true;
}

function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('focusin', refreshInput, true);
    document.addEventListener('focusout', refreshInputLater, true);
    document.addEventListener('input', refreshInput, true);
    window.addEventListener('resize', checkSystemFullscreen);
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    if (types?.MESSAGE_SENT) context.eventSource?.on?.(types.MESSAGE_SENT, refreshInputLater);
}

export function initImmersive() {
    clearInterval(mountTimer);
    bind();
    const ready = () => {
        if (!document.body || !input()) return false;
        mountHandle();
        apply();
        return mountPanel();
    };
    if (ready()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (ready() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupImmersive() {
    clearInterval(mountTimer);
    clearTimeout(collapseTimer);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('focusin', refreshInput, true);
    document.removeEventListener('focusout', refreshInputLater, true);
    document.removeEventListener('input', refreshInput, true);
    window.removeEventListener('resize', checkSystemFullscreen);
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    if (types?.MESSAGE_SENT) { try { context.eventSource?.removeListener?.(types.MESSAGE_SENT, refreshInputLater); } catch { /* ignore */ } }
    bound = false;
    body()?.classList.remove(ON, TOP_OPEN, INPUT_OPEN, SYS_FULL);
    document.getElementById(HANDLE_ID)?.remove();
    document.getElementById(SETTINGS_ID)?.remove();
}

// 给电脑上的自测脚本用
export const __test = { apply, refreshInput, checkSystemFullscreen, settings };
