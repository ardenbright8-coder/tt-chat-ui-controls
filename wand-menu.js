// 魔法棒菜单（v1.15.5）：
// 1. 每项换成口语名字，下面带一句说明（以前名字看不出干啥用，用户一直没敢点）
// 2. 不常用的收进扩展页「不常用工具」那块（v1.18.2 起分「魔法棒」「≡ 菜单」两个气泡，原名「魔法棒菜单」），那里还能「用一下」，功能本身不删
// 3. 本扩展加的菜单项固定贴在最底下（离手指最近），别的扩展晚加载也挪回来
// 菜单项是别的扩展建的，这里只改名字、加说明、藏起来、调顺序，不碰它们的点击功能。

import { tip } from './tip.js';

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-wand-settings';
const HIDDEN_CLASS = 'tt-wand-hidden';
const ctx = () => globalThis.SillyTavern?.getContext?.();

// 本扩展自己加进菜单的项。排最前的在菜单最底下；以后新加的写在后面，就排在前面那些的上面。
const OWN_WAND = ['tt-autoimg-wand', 'tt-cast-wand', 'tt-autoimg-settings-wand', 'tt-taocan-wand', 'tt-autoimg-toggle-wand'];
// story-image.js 切了自动配图开关就发这个信号，这边重画一下名字
const REFRESH_EVENT = 'tt-wand-refresh';
const OWN_OPTIONS = ['option_tt_blank_opening', 'option_tt_summary_library', 'option_tt_story_summary', 'option_tt_test_log', 'option_tt_vars'];
// 别家的项用户指定的位置（2026-10-02）：这几项排最上面（从上往下）；这几项紧贴在本扩展那些上面（从上往下）。其余保持原样
const WAND_TOP = ['inspect', 'vars', 'logs'];
const WAND_ABOVE_OWN = ['sd', 'attach'];

// 认菜单项靠它原来的名字（中文界面和英文界面各一个）
const ITEMS = [
    { key: 'sync', match: ['同步面板', 'Sync Panel'], name: '手机电脑互传数据', desc: '同一个 WiFi 下，把手机和电脑上的酒馆数据互相传过去' },
    { key: 'databank', match: ['打开数据库', 'Open Data Bank'], name: '给模型放参考资料', desc: '放些资料文件，聊天时模型会去翻；按全局、角色、这个聊天分开放' },
    { key: 'attach', match: ['附加文件', 'Attach a File'], name: '发图片或文件', desc: '发消息时顺带一张图片或一个文件' },
    { key: 'sd', match: ['生成图片', 'Generate Image'], name: '生成图片', desc: '手动画一张图。自动配图也是靠它画的' },
    { key: 'autoimg', match: ['改配图提示词'], name: '改配图提示词', desc: '改自动配图时，模型把剧情写成画面用的那段说明' },
    { key: 'cast', match: ['看定妆照'], name: '看定妆照', desc: '这张角色卡里每个角色长什么样，能改长相、重出定妆照；新开聊天也是这一套' },
    { key: 'autoimgset', match: ['自动配图设置'], name: '自动配图设置', desc: '开关自动配图、选哪个模型写画图词、给最后一条补一张' },
    { key: 'taocan', match: ['出图套餐'], name: '出图套餐', desc: '看电脑上的出图套餐和版本，点一下换上，电脑跟着换；还能看最近出的图' },
    // 自动配图开关（v1.17.5）：一点就切，名字跟着变，看名字就知道现在开没开
    {
        key: 'autoimgtoggle', id: 'tt-autoimg-toggle-wand', match: ['自动配图开关'],
        name: '打开自动配图（现在关着）', desc: '点一下打开：之后每条正文写完自动配一张图',
        on: () => !!ctx()?.extensionSettings?.[EXTENSION_KEY]?.autoImageEnabled,
        onName: '关掉自动配图（现在开着）', onDesc: '点一下关掉：之后不再自动配图，排着队还没画的也不画了',
    },
    // 官方「提示词查看器」是个开关，开着时它自己把名字换成「停止检查」，这里跟着换，免得看不出开没开
    {
        key: 'inspect', id: 'inspectNextPromptButton', match: ['提示词查看器', 'Inspect Prompts', 'Stop Inspecting'],
        name: '监控世界书执行情况', desc: '点一下打开：之后每次发消息前，先把要发给模型的全部内容摆出来，哪几条世界书真的生效了一眼就知道',
        on: () => localStorage.getItem('promptInspectorEnabled') === 'true',
        onName: '停止监控世界书（现在开着）', onDesc: '现在每次发消息前都会先弹出要发的全部内容，点一下关掉',
    },
    { key: 'vars', match: ['变量管理器', 'Variable Manager'], name: '管理角色数值', desc: '看和改聊天里存的数值，角色卡状态栏（好感、状态这些）就靠它' },
    { key: 'logs', match: ['日志查看器', 'Log Viewer'], name: '查看运行记录', desc: '程序后台记的流水账，出毛病时翻它找原因' },
];
const DEFAULT_HIDDEN = ['sync', 'databank'];

// ≡ 菜单（左下角三条杠）里酒馆自带的项（v1.18.2）。认 id，认不到再认名字（去掉空格比）
const OPTION_ITEMS = [
    { key: 'fullscreen', ids: ['option_toggle_fullscreen'], match: ['切换全屏', 'Toggle Fullscreen'], name: '切换全屏', desc: '手机顶上的状态栏藏起来或露出来' },
    { key: 'an', ids: ['option_toggle_AN'], match: ['作者注释', "Author's Note"], name: '作者注释', desc: '给模型的一段固定提醒；总结库的总结也是塞到这里' },
    { key: 'cfg', ids: ['option_toggle_CFG'], match: ['CFG缩放', 'CFG Scale'], name: 'CFG缩放', desc: '只对本地模型有用，用 API 用不上' },
    { key: 'logprobs', ids: ['option_toggle_logprobs'], match: ['词符概率', 'Token Probabilities'], name: '词符概率', desc: '看模型每个字还考虑过哪些字，只有部分模型支持' },
    { key: 'checkpoint', ids: ['option_new_bookmark'], match: ['保存检查点', 'Save Checkpoint'], name: '保存检查点', desc: '从这条起分出一个存档，以后能回到这里' },
    { key: 'group', ids: ['option_convert_to_group'], match: ['转换为群聊', 'Convert to group'], name: '转换为群聊', desc: '把这个聊天变成群聊，能拉别的角色卡进来一起聊' },
    { key: 'newchat', ids: ['option_start_new_chat'], match: ['开始新聊天', 'Start new chat'], name: '开始新聊天', desc: '跟这个角色重新开一个聊天，旧的还在' },
    { key: 'close', ids: ['option_close_chat'], match: ['关闭聊天', 'Close chat'], name: '关闭聊天', desc: '退出这个聊天，回到没选角色的样子' },
    { key: 'files', ids: ['option_select_chat'], match: ['管理聊天文件', 'Manage chat files'], name: '管理聊天文件', desc: '看这个角色的所有聊天存档，切换、改名、删除' },
    { key: 'delete', ids: ['option_delete_mes'], match: ['删除消息', 'Delete messages'], name: '删除消息', desc: '勾几条消息删掉' },
    { key: 'regen', ids: ['option_regenerate'], match: ['重新生成', 'Regenerate'], name: '重新生成', desc: '最后一条重写。聊天右下角的「>」也能重写' },
    { key: 'impersonate', ids: ['option_impersonate'], match: ['AI帮答', 'Impersonate'], name: 'AI 帮答', desc: '让 AI 替你写一条你要说的话' },
    { key: 'continue', ids: ['option_continue'], match: ['继续', 'Continue'], name: '继续', desc: '让 AI 接着上一条往下写。底下已经有继续按钮' },
];
// 用户 2026-10-04 定的：这几项默认收起来
const DEFAULT_OPTIONS_HIDDEN = ['cfg', 'logprobs', 'checkpoint', 'close', 'regen', 'impersonate', 'continue'];
let panelTab = 'wand';

let observer = null;
let mountTimer = null;

function settings() {
    const all = ctx()?.extensionSettings;
    if (!all) return { wandHidden: [...DEFAULT_HIDDEN], optionsHidden: [...DEFAULT_OPTIONS_HIDDEN] };
    all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    const s = all[EXTENSION_KEY];
    if (!Array.isArray(s.wandHidden)) s.wandHidden = [...DEFAULT_HIDDEN];
    if (!Array.isArray(s.optionsHidden)) s.optionsHidden = [...DEFAULT_OPTIONS_HIDDEN];
    return s;
}

const save = () => ctx()?.saveSettingsDebounced?.();
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const menu = () => document.getElementById('extensionsMenu');

// 菜单里一行一项：装在 .extension_container 里的，或者直接挂在菜单下的
function menuItems() {
    const box = menu();
    if (!box) return [];
    return [...box.children].flatMap((el) => (el.classList.contains('extension_container') ? [...el.children] : [el]));
}

// 这一项的原名：认过的记在 data 上，改了名也认得回来
function itemKey(item) {
    if (item.dataset.ttWandKey) return item.dataset.ttWandKey;
    const text = item.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const known = ITEMS.find((i) => (i.id && item.id === i.id) || i.match.includes(text));
    const key = known ? known.key : 'text:' + text;
    item.dataset.ttWandKey = key;
    item.dataset.ttWandOriginal = text;
    return key;
}

// ≡ 菜单里酒馆自带的项（本扩展自己加的不算）
const optionsBox = () => document.querySelector('#options .options-content');
function optionItems() {
    const box = optionsBox();
    if (!box) return [];
    return [...box.children].filter((el) => el.tagName === 'A' && !OWN_OPTIONS.includes(el.id) && el.textContent.trim());
}

function optionKey(item) {
    if (item.dataset.ttOptKey) return item.dataset.ttOptKey;
    const text = item.textContent.replace(/\s+/g, '');
    const known = OPTION_ITEMS.find((i) => i.ids.includes(item.id) || i.match.some((m) => m.replace(/\s+/g, '') === text));
    const key = known ? known.key : (item.id ? `id:${item.id}` : `text:${text}`);
    item.dataset.ttOptKey = key;
    item.dataset.ttOptOriginal = item.textContent.replace(/\s+/g, ' ').trim();
    return key;
}

// 名字所在的那个元素：没有子元素、写着字的最后一个
function labelOf(item) {
    const own = item.querySelector(':scope > .tt-wand-text');
    if (own) return own;
    const spans = [...item.querySelectorAll('span')].filter((el) => !el.children.length && el.textContent.trim());
    return spans.at(-1) || null;
}

function shownText(info) {
    let on = false;
    try { on = !!info.on?.(); } catch { /* 读不到开关状态就当关着 */ }
    return on ? { name: info.onName, desc: info.onDesc } : { name: info.name, desc: info.desc };
}

function rename(item, info) {
    const label = labelOf(item);
    if (!label) return;
    const { name, desc } = shownText(info);
    if (label.classList.contains('tt-wand-text') && label.firstChild?.nodeValue === name && label.querySelector('small')?.textContent === desc) return;
    label.classList.add('tt-wand-text');
    label.replaceChildren(document.createTextNode(name), Object.assign(document.createElement('small'), { textContent: desc }));
}

// 本扩展的项按 order 排在容器最后：order[0] 最底下，后面的往上叠
function pinToBottom(box, order) {
    if (!box) return;
    const present = order.map((id) => document.getElementById(id)).filter((el) => el?.parentElement === box);
    if (!present.length) return;
    const tail = [...box.children].slice(-present.length);
    const want = [...present].reverse();
    if (tail.every((el, i) => el === want[i])) return;
    want.forEach((el) => box.appendChild(el));
}

// 魔法棒整体顺序：WAND_TOP → 其余原样 → WAND_ABOVE_OWN → 本扩展的项（OWN_WAND[0] 最底下）。
// 🚨 只给每块标 CSS order（菜单本身是竖排 flex），不搬 DOM：v1.15.9 真搬过，「酒馆助手」的按钮会被它自己摆回原位，
// 两边来回抢，手机卡到几秒才动一下（2026-10-02）。标号是改 style 属性，不会触发别人的「子节点变了」监听。
const ORDER_KEY = 'ttWandOrder';
function arrangeWand(box) {
    const blockOf = (key) => {
        const item = menuItems().find((el) => itemKey(el) === key);
        if (!item) return null;
        return item.parentElement !== box && item.parentElement?.classList.contains('extension_container') ? item.parentElement : item;
    };
    const want = new Map();
    WAND_TOP.forEach((key, i) => { const el = blockOf(key); if (el) want.set(el, -100 + i); });
    WAND_ABOVE_OWN.forEach((key, i) => { const el = blockOf(key); if (el) want.set(el, 100 + i); });
    [...OWN_WAND].reverse().forEach((id, i) => { const el = document.getElementById(id); if (el?.parentElement === box) want.set(el, 200 + i); });
    for (const el of box.querySelectorAll(`[data-tt-wand-order]`)) {
        if (!want.has(el)) { el.style.order = ''; delete el.dataset[ORDER_KEY]; }
    }
    for (const [el, order] of want) {
        if (el.dataset[ORDER_KEY] === String(order) && el.style.order === String(order)) continue;
        el.style.order = String(order);
        el.dataset[ORDER_KEY] = String(order);
    }
}

function apply() {
    const box = menu();
    if (!box) return false;
    observer?.disconnect();
    const hidden = new Set(settings().wandHidden);
    for (const item of menuItems()) {
        const key = itemKey(item);
        if (!key) continue;
        const info = ITEMS.find((i) => i.key === key);
        if (info) rename(item, info);
        const hide = hidden.has(key);
        if (item.classList.contains(HIDDEN_CLASS) !== hide) item.classList.toggle(HIDDEN_CLASS, hide);
    }
    arrangeWand(box);
    const optHidden = new Set(settings().optionsHidden);
    for (const item of optionItems()) {
        const hide = optHidden.has(optionKey(item));
        if (item.classList.contains(HIDDEN_CLASS) !== hide) item.classList.toggle(HIDDEN_CLASS, hide);
    }
    pinToBottom(document.querySelector('#options .options-content'), OWN_OPTIONS);
    observe();
    return true;
}

// 刹车：菜单变一次不马上跟，攒 60 毫秒做一次；3 秒里跟了 30 次以上，说明在跟别的扩展来回较劲，
// 停手 10 秒再看。宁可名字、顺序暂时不对，也不让手机卡死
let pending = 0;
let runs = [];
let pausedUntil = 0;
let pauseTimer = 0;
function schedule() {
    if (pending) return;
    pending = setTimeout(() => {
        pending = 0;
        const now = Date.now();
        if (now < pausedUntil) return;
        runs = runs.filter((at) => now - at < 3000);
        runs.push(now);
        if (runs.length > 30) {
            pausedUntil = now + 10000;
            runs = [];
            observer?.disconnect();
            console.warn('[酒馆拓展] 魔法棒菜单被反复改动，先停 10 秒');
            pauseTimer = setTimeout(() => { pauseTimer = 0; apply(); renderPanel(); }, 10000);
            return;
        }
        apply();
        renderPanel();
    }, 60);
}

function observe() {
    if (!observer) observer = new MutationObserver(schedule);
    const box = menu();
    if (box) observer.observe(box, { childList: true, subtree: true });
    const options = document.querySelector('#options .options-content');
    if (options) observer.observe(options, { childList: true });
}

// 扩展页里的「不常用工具」：顶上两个气泡切「魔法棒」「≡ 菜单」，每项一行，勾上就从那个菜单里收起来，收起来的点「用一下」照样能用
function rowHtml(menuKey, key, name, desc, hidden) {
    return `
<div class="tt-wand-row" data-menu="${menuKey}" data-key="${esc(key)}">
  <label class="checkbox_label tt-hold-check"><input type="checkbox" class="tt-wand-hide" ${hidden ? 'checked' : ''}> <span>收起来</span></label>
  <div class="tt-wand-row-text"><b>${esc(name)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}</div>
  <div class="menu_button tt-wand-use">用一下</div>
</div>`;
}

function renderPanel() {
    const root = document.getElementById(SETTINGS_ID);
    const list = root?.querySelector('.tt-wand-list');
    if (!list) return;
    root.querySelectorAll('.tt-tool-tab').forEach((tab) => tab.classList.toggle('tt-tool-tab-on', tab.dataset.tab === panelTab));
    let rows;
    if (panelTab === 'options') {
        const hidden = new Set(settings().optionsHidden);
        rows = optionItems().map((item) => {
            const key = optionKey(item);
            const info = OPTION_ITEMS.find((i) => i.key === key);
            return rowHtml('options', key, info?.name || item.dataset.ttOptOriginal || key, info?.desc, hidden.has(key));
        }).join('');
    } else {
        const hidden = new Set(settings().wandHidden);
        rows = menuItems().map((item) => {
            const key = itemKey(item);
            if (!key || OWN_WAND.includes(item.id)) return '';
            const info = ITEMS.find((i) => i.key === key);
            return rowHtml('wand', key, info?.name || item.dataset.ttWandOriginal || key, info?.desc, hidden.has(key));
        }).join('');
    }
    const sig = panelTab + rows;
    if (list.dataset.sig === sig) return;
    list.dataset.sig = sig;
    list.innerHTML = rows || '<small>这个菜单还没加载出来，过一会儿再打开这里。</small>';
}

function onPanelChange(event) {
    const box = event.target.closest('.tt-wand-hide');
    if (!box) return;
    const row = box.closest('.tt-wand-row');
    const key = row?.dataset.key;
    const field = row?.dataset.menu === 'options' ? 'optionsHidden' : 'wandHidden';
    const s = settings();
    s[field] = s[field].filter((k) => k !== key);
    if (box.checked) s[field].push(key);
    save();
    apply();
}

function onPanelClick(event) {
    const tab = event.target.closest('.tt-tool-tab');
    if (tab) {
        panelTab = tab.dataset.tab;
        renderPanel();
        return;
    }
    const use = event.target.closest('.tt-wand-use');
    if (!use) return;
    const row = use.closest('.tt-wand-row');
    const key = row?.dataset.key;
    const item = row?.dataset.menu === 'options'
        ? optionItems().find((el) => optionKey(el) === key)
        : menuItems().find((el) => itemKey(el) === key);
    if (item) item.click();
    else globalThis.toastr?.info?.('这一项现在不在菜单里（它的扩展可能关了）', '不常用工具');
}

function mountPanel() {
    if (document.getElementById(SETTINGS_ID)) return true;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', `
<div id="${SETTINGS_ID}" class="tt-wand-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>不常用工具</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="tt-tip-row"><div class="tt-tool-tabs"><div class="tt-tool-tab" data-tab="wand">魔法棒</div><div class="tt-tool-tab" data-tab="options">≡ 菜单</div></div>${tip('点上面的气泡切换：左下角魔法棒、左下角三条杠菜单。勾「收起来」就从那个菜单里藏掉，功能还在，要用时在这里点「用一下」。手机上勾选框要按住半秒才会变，防手滑。')}</div>
      <div class="tt-wand-list"></div>
    </div>
  </div>
</div>`);
    const root = document.getElementById(SETTINGS_ID);
    root.addEventListener('change', onPanelChange);
    root.addEventListener('click', onPanelClick);
    root.querySelector('.inline-drawer-toggle')?.addEventListener('click', renderPanel);
    renderPanel();
    return true;
}

export function initWandMenu() {
    clearInterval(mountTimer);
    document.removeEventListener(REFRESH_EVENT, schedule);
    document.addEventListener(REFRESH_EVENT, schedule);
    const ready = () => apply() & mountPanel();
    if (ready()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (ready() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupWandMenu() {
    clearInterval(mountTimer);
    document.removeEventListener(REFRESH_EVENT, schedule);
    observer?.disconnect();
    observer = null;
    clearTimeout(pending);
    pending = 0;
    clearTimeout(pauseTimer); // 刹车停手那 10 秒里关了扩展，到点也别再回来改菜单
    pauseTimer = 0;
    document.querySelectorAll('[data-tt-wand-order]').forEach((el) => { el.style.order = ''; delete el.dataset[ORDER_KEY]; });
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => el.classList.remove(HIDDEN_CLASS));
    document.querySelectorAll('.tt-wand-text').forEach((label) => {
        const item = label.closest('[data-tt-wand-original]');
        label.classList.remove('tt-wand-text');
        if (item) label.textContent = item.dataset.ttWandOriginal;
    });
    document.getElementById(SETTINGS_ID)?.remove();
}

// 给电脑上的自测脚本用
export const __test = { ITEMS, OWN_WAND, OWN_OPTIONS, apply, settings };
