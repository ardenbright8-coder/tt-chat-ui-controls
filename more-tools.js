// ≡「更多工具」（v1.18.39）：不常用的本扩展项收进这一页卡片，≡ 菜单外面只留常用的。
// 用户 2026-10-31：「测试日志我不常用；变量基本也不常用……可以缩到二级目录里」「总结库是要的，但……没有什么常用的时候」
// 收进来的三项（测试日志、变量、总结库）原来的菜单项还在，只是 wand-menu.js 用 MORE_OPTIONS 把它们藏了；
// 卡片点了就先关这页，再替用户点原来那一项，功能一点没改。样子跟魔法棒「出图」那页一套（.tt-hub）。

import { openErrorList, errorSummary } from './error-dot.js';

const MENU_ID = 'option_tt_more';
const ctx = () => globalThis.SillyTavern?.getContext?.();

let mountTimer = null;
let menuObserver = null;

const CARDS = [
    { key: 'errors', icon: 'fa-triangle-exclamation', name: '报错清单', desc: '后台出过的问题，能整份复制给 AI', now: errorSummary, open: openErrorList },
    { key: 'log', icon: 'fa-clipboard-list', name: '测试日志', desc: '每条消息的变量处理记录，查问题用', target: 'option_tt_test_log' },
    { key: 'vars', icon: 'fa-sliders', name: '变量', desc: '重新处理变量、重新读取初始变量', target: 'option_tt_vars' },
    { key: 'library', icon: 'fa-box-archive', name: '总结库', desc: '存过的总结，换新聊天时接着用', target: 'option_tt_summary_library' },
];

function html() {
    const cards = CARDS.map((c) => {
        const now = c.now?.() || '';
        return `<div class="tt-hub-card menu_button" data-key="${c.key}"><i class="fa-solid ${c.icon}"></i><b>${c.name}</b><small>${c.desc}</small>${now ? `<span class="tt-hub-now">${now}</span>` : ''}</div>`;
    }).join('');
    return `<h3>更多工具</h3><div class="tt-hub-grid">${cards}</div>`;
}

async function openMore() {
    const context = ctx();
    if (!context?.callGenericPopup) return;
    const box = document.createElement('div');
    box.className = 'tt-autoimg tt-hub';
    box.innerHTML = html();
    box.addEventListener('click', (event) => {
        const card = event.target.closest?.('.tt-hub-card');
        const c = CARDS.find((x) => x.key === card?.dataset.key);
        if (!c) return;
        box.closest('dialog')?.querySelector('.popup-button-ok')?.click();
        setTimeout(() => {
            if (c.open) { c.open(); return; }
            const item = document.getElementById(c.target);
            if (item) item.click();
            else globalThis.toastr?.info?.('这一项还没加载出来，过一会儿再点', '更多工具');
        }, 300);
    });
    await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
}

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
    item.title = '报错清单、测试日志、变量、总结库';
    item.innerHTML = '<i class="fa-lg fa-solid fa-toolbox"></i><span>更多工具</span>';
    item.addEventListener('click', (event) => {
        event.preventDefault();
        closeOptionsMenu();
        openMore();
    });
    list.append(item);
    return true;
}

export function initMoreTools() {
    clearInterval(mountTimer);
    const ready = () => {
        if (!mountMenuItem()) return false;
        const host = document.getElementById('options');
        if (host && !menuObserver) {
            // 酒馆重建菜单时补回来（只补一次，不来回抢）
            menuObserver = new MutationObserver(() => { if (!document.getElementById(MENU_ID)) mountMenuItem(); });
            menuObserver.observe(host, { childList: true, subtree: true });
        }
        return true;
    };
    if (ready()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (ready() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupMoreTools() {
    clearInterval(mountTimer);
    menuObserver?.disconnect();
    menuObserver = null;
    document.getElementById(MENU_ID)?.remove();
}

export const __test = { CARDS, openMore };
