// ≡「更多工具」（v1.18.39，v1.18.40 加「额外模型解析」）：不常用的本扩展项收进这一页卡片，≡ 菜单外面只留常用的。
// 用户 2026-10-31：「测试日志我不常用；变量基本也不常用……可以缩到二级目录里」「总结库是要的，但……没有什么常用的时候」
// 收进来的三项（测试日志、变量、总结库）原来的菜单项还在，只是 wand-menu.js 用 MORE_OPTIONS 把它们藏了；
// 卡片点了就先关这页，再替用户点原来那一项，功能一点没改。样子跟魔法棒「出图」那页一套（.tt-hub）。

import { openErrorList, errorSummary } from './error-dot.js';

const MENU_ID = 'option_tt_more';
const ctx = () => globalThis.SillyTavern?.getContext?.();

let mountTimer = null;
let menuObserver = null;

// MVU（别家扩展，角色卡脚本带进来的）的设置面板：扩展页里标题「MVU 变量框架」那个抽屉。
// v1.18.40 用户 10-31：「额外模型解析……我自己以后也能方便改，现在不知道在哪，这个可能常用」，
// 要「两个包、三层」：更多工具 → 额外模型解析 → 改接口 / 改预设。用户挑的是稳的那种：
// 第三层只是指路——跳到 MVU 自己的设置、停在那一块、框亮一下，改的永远是 MVU 自己的开关；不搬、不替它改。
const mvuDrawer = () => [...document.querySelectorAll('#extensions_settings2 .inline-drawer, #extensions_settings .inline-drawer')]
    .find((d) => /MVU 变量框架/.test(d.querySelector('.inline-drawer-header')?.textContent || ''));
const mvuSection = (drawer) => [...drawer.querySelectorAll('.mvu-section')]
    .find((sec) => sec.querySelector('.mvu-section__title')?.textContent.trim() === '变量更新方式');
const mvuSourceBox = (section) => [...section.querySelectorAll('details')]
    .find((d) => d.querySelector('summary')?.textContent.trim().startsWith('模型来源'));
const picked = (select) => select?.options[select.selectedIndex]?.text?.trim() || '';
const fieldText = (f) => f.querySelector('label, span, b')?.textContent?.trim() || f.textContent.trim();

// 「模型来源」框里：上半截是预设那几项（.mvu-field），下拉「与插头相同 / 自定义 / 更多」以及它下面跟着出来的地址、钥匙、模型是接口
function mvuParts() {
    const drawer = mvuDrawer();
    const section = drawer && mvuSection(drawer);
    const box = section && mvuSourceBox(section);
    if (!box) return { drawer, section };
    const content = box.querySelector('.mvu-details__content') || box;
    const kids = [...content.children];
    const sourceSelect = kids.find((el) => el.tagName === 'SELECT' && [...el.options].some((o) => o.text.trim() === '自定义'));
    const at = sourceSelect ? kids.indexOf(sourceSelect) : kids.length;
    return { drawer, section, box, preset: kids.slice(0, at).filter((el) => el.classList.contains('mvu-field')), api: kids.slice(at), sourceSelect };
}

function mvuWay() {
    const { section } = mvuParts();
    return section ? picked(section.querySelector('select')) : '';
}

function apiSummary() {
    const { box, api, sourceSelect } = mvuParts();
    if (!box) return '';
    const model = api.find((f) => /模型/.test(fieldText(f)))?.querySelector('input')?.value?.trim();
    return [picked(sourceSelect), model].filter(Boolean).join(' · ');
}

function presetSummary() {
    const { box, preset } = mvuParts();
    if (!box) return '';
    const value = (name) => picked(preset.find((f) => fieldText(f).startsWith(name))?.querySelector('select'));
    const plan = value('破限方案');
    return plan === '使用其他预设' ? [plan, value('目标预设')].filter(Boolean).join(' · ') : plan;
}

function mvuSummary() {
    if (!mvuParts().section) return '这张卡没有 MVU';
    const way = mvuWay();
    return way === '额外模型解析' ? apiSummary() || way : `现在是：${way}`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function jumpToMvu(part) {
    if (!document.getElementById('rm_extensions_block')?.classList.contains('openDrawer')) {
        document.querySelector('#extensions-settings-button .drawer-toggle')?.click();
        await wait(400);
    }
    let parts = mvuParts();
    if (!parts.drawer) {
        globalThis.toastr?.info?.('这张角色卡没有 MVU，或者还没加载好', '额外模型解析');
        return;
    }
    const content = parts.drawer.querySelector('.inline-drawer-content');
    if (content && getComputedStyle(content).display === 'none') {
        parts.drawer.querySelector('.inline-drawer-toggle')?.click();
        await wait(300);
    }
    if (parts.box && !parts.box.open) {
        parts.box.open = true;
        await wait(100);
        parts = mvuParts();
    }
    const targets = (part === 'api' ? parts.api : parts.preset) || [];
    const first = targets[0] || parts.section || parts.drawer;
    first.scrollIntoView({ block: 'start', behavior: 'smooth' });
    targets.forEach((el) => el.classList.add('tt-mvu-flash'));
    setTimeout(() => targets.forEach((el) => el.classList.remove('tt-mvu-flash')), 2500);
}

// 第二层：额外模型解析这一页，两张卡
const MVU_CARDS = [
    { key: 'api', icon: 'fa-plug', name: '改接口', desc: '与插头相同 / 自定义 / 更多；自定义填地址、钥匙、模型', now: apiSummary },
    { key: 'preset', icon: 'fa-sliders', name: '改预设', desc: '破限方案、目标预设、应答格式', now: presetSummary },
];

async function openMvuPage() {
    const context = ctx();
    if (!context?.callGenericPopup) return;
    const way = mvuWay();
    const hasMvu = !!mvuParts().section;
    const note = !hasMvu ? '这张角色卡没有 MVU，进一张带变量的卡再来'
        : way !== '额外模型解析' ? `变量更新方式现在是「${way}」，额外模型没在用。要用的话在设置里把它改成「额外模型解析」` : '';
    const box = document.createElement('div');
    box.className = 'tt-autoimg tt-hub';
    box.innerHTML = `<h3>额外模型解析</h3>${note ? `<small class="tt-hub-note">${note}</small>` : ''}<div class="tt-hub-grid">${MVU_CARDS.map((c) => {
        const now = hasMvu ? c.now() : '';
        return `<div class="tt-hub-card menu_button" data-key="${c.key}"><i class="fa-solid ${c.icon}"></i><b>${c.name}</b><small>${c.desc}</small>${now ? `<span class="tt-hub-now">${now}</span>` : ''}</div>`;
    }).join('')}</div>`;
    box.addEventListener('click', (event) => {
        const key = event.target.closest?.('.tt-hub-card')?.dataset.key;
        if (!key) return;
        box.closest('dialog')?.querySelector('.popup-button-ok')?.click();
        setTimeout(() => jumpToMvu(key), 300);
    });
    await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
}

const CARDS = [
    { key: 'mvu', icon: 'fa-microchip', name: '额外模型解析', desc: '变量用哪个模型、哪套预设来算；改接口、改预设', now: mvuSummary, open: openMvuPage },
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
