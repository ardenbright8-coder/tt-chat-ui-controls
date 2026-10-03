// 出图套餐（v1.17.0）：手机上看电脑「个人娱乐 → 酒馆 → 生图模型」那块的套餐和版本，点一下换上（电脑跟着换），看最近出的图。
// 细调参数、换样图封面还在电脑上做，手机只看和选。界面照电脑那块（套餐卡点开下面一排版本卡），手机上排紧凑：见 render 上面那段。
// 叫法照 C:\A-AI-gongju\geren-yule\00_叫什么（咱俩说话的统一叫法）.md：套餐 / 大卡 / 版本 / 正在用 / 换上 / 样图 / 封面。
//
// 🚨 怎么连电脑：安卓正式版酒馆不让页面直接连 http 地址（usesCleartextTraffic=false），
// 所以借酒馆后台「自定义 OpenAI 兼容聊天」那条路转发：custom_url = 图像生成里填的 ComfyUI 地址 + /jiuguan/v1，
// 命令 JSON 放在 user 消息里，电脑把结果 JSON 放在 choices[0].message.content 里回来。
// 电脑那头（ComfyUI 插件 jiuguan_mianban）归另一个窗口管，格式要改先跟它商量。

import { tip } from './tip.js';

const WAND_ID = 'tt-taocan-wand';
const ctx = () => globalThis.SillyTavern?.getContext?.();
const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, '出图套餐');
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CHINESE_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const setTitle = (id) => `套餐${CHINESE_NUM[Number(id)] ?? id}`;

let mountTimer = null;
let panel = null;
let state = null; // { current, sets, open, recent, busy }

function comfyBase() {
    const url = String(ctx()?.extensionSettings?.sd?.comfy_url || '').trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(url) ? url : '';
}

// 发一条命令给电脑，拿回结果对象；电脑说 ok:false 或者连不上就抛中文错
async function viaTavern(command) {
    const base = comfyBase();
    if (!base) throw new Error('先在「图像生成」里把 ComfyUI 地址填上（就是手机出图用的那个电脑地址）');
    const context = ctx();
    const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_completion_source: 'custom',
            custom_url: `${base}/jiuguan/v1`,
            model: 'jiuguan',
            stream: false,
            type: 'quiet', // 不弹「生成完成」、不走进度条
            messages: [{ role: 'user', content: JSON.stringify(command) }],
        }),
    });
    let data = null;
    try { data = await response.json(); } catch { /* 下面按连不上处理 */ }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        const why = data?.error?.message || data?.message || `HTTP ${response.status}`;
        throw new Error(`连不上电脑：${why}。看看电脑开着没有、出图那边连得上吗`);
    }
    return JSON.parse(content);
}

let transport = viaTavern;

async function call(command) {
    const result = await transport(command);
    if (!result?.ok) throw new Error(result?.error || '电脑那边没办成');
    return result;
}

// ---------------------------------------------------------------- 画面

// 小图角上的字：测试图标「测试」，「动作参考」先画的草稿（caogao_ 开头）标「草稿」，再跟出图那会儿的版本号
function badge(img) {
    const kind = img.test ? '测试' : /^caogao_/i.test(String(img.file || '')) ? '草稿' : '';
    return [kind, img.version || ''].filter(Boolean).join(' · ');
}

// 一页排完（v1.17.2，用户 10-03 挑的方案 A）：上面一行小套餐卡（一行四个）、下面一排版本卡（左右划），再往下全是最近出的图。
// 用户：「面板每次要划半天……整体稍微紧凑点」「还是这个吧，这个挺好的」
function setsPage() {
    if (state.error) return `<div class="tt-tc-empty">${esc(state.error)}</div>`;
    if (!state.sets) return '<div class="tt-tc-empty">正在问电脑……</div>';
    const chips = state.sets.map((s) => {
        const using = s.versions.some((v) => v.id === state.current);
        const pic = s.cover ? `<img src="${esc(s.cover)}" alt="">` : '<div class="tt-tc-nopic">还没封面</div>';
        return `
<div class="tt-tc-set${using ? ' using' : ''}${state.open === s.id ? ' open' : ''}" data-set="${esc(s.id)}" title="${esc(s.name || '')}">
  ${pic}
  <div class="tt-tc-set-title">${esc(setTitle(s.id))}</div>
  <div class="tt-tc-set-count">${s.versions.length} 个版本</div>
</div>`;
    }).join('');
    const open = state.sets.find((s) => s.id === state.open);
    const vers = open ? `
<div class="tt-tc-vers">
  <div class="tt-tc-box-head"><b>${esc(setTitle(open.id))}</b>　${esc(open.name || '')}</div>
  <div class="tt-tc-row">${open.versions.map((v) => {
        const using = v.id === state.current;
        const pic = v.sample ? `<img src="${esc(v.sample)}" alt="">` : '<div class="tt-tc-nopic">还没样图</div>';
        return `
    <div class="tt-tc-ver${using ? ' using' : ''}${state.busy === v.id ? ' busy' : ''}" data-ver="${esc(v.id)}">
      ${pic}
      <div class="tt-tc-ver-id">${esc(v.id)}${using ? ' · 正在用' : ''}${v.unsaved ? ' <span class="tt-tc-unsaved">● 没保存</span>' : ''}</div>
      <div class="tt-tc-ver-name">${esc(v.name || '')}</div>
    </div>`;
    }).join('')}</div>
</div>` : '';
    return `<div class="tt-tc-sets">${chips}</div>${vers}`;
}

function recentPage() {
    if (state.recentError) return `<div class="tt-tc-empty">${esc(state.recentError)}</div>`;
    if (!state.recent) return '<div class="tt-tc-empty">正在拿最近的图……</div>';
    if (!state.recent.length) return '<div class="tt-tc-empty">还没有出过图</div>';
    return `<div class="tt-tc-recent">${state.recent.map((img) => `
<div class="tt-tc-pic" data-file="${esc(img.file)}"${img.note ? ` title="${esc(img.note)}"` : ''}>
  <img src="${esc(img.small)}" alt="" loading="lazy">
  ${badge(img) ? `<span class="tt-tc-badge">${esc(badge(img))}</span>` : ''}
</div>`).join('')}</div>`;
}

function render() {
    if (!panel || !state) return;
    const row = panel.querySelector('.tt-tc-row');
    const scrolled = row ? row.scrollLeft : null;
    panel.querySelector('.tt-tc-page').innerHTML = `${setsPage()}<h4>最近出的图</h4>${recentPage()}`;
    // 版本一排左右划：刷新后停在原处；头一次画就把正在用的那张挪进眼前
    const newRow = panel.querySelector('.tt-tc-row');
    if (!newRow) return;
    if (scrolled !== null) newRow.scrollLeft = scrolled;
    else panel.querySelector('.tt-tc-ver.using')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
}

async function loadSets() {
    try {
        const result = await call({ do: 'list' });
        state.current = result.current;
        state.sets = Array.isArray(result.sets) ? result.sets : [];
        state.error = '';
        // 默认展开正在用的那个套餐
        state.open = state.sets.find((s) => s.versions.some((v) => v.id === state.current))?.id || state.sets[0]?.id || '';
    } catch (error) {
        state.error = error.message;
    }
    render();
}

async function loadRecent() {
    try {
        state.recent = (await call({ do: 'recent', limit: 60 })).images || [];
        state.recentError = '';
    } catch (error) {
        state.recentError = error.message;
    }
    render();
}

async function switchTo(id) {
    if (!state || state.busy || id === state.current) return;
    state.busy = id;
    render();
    try {
        const result = await call({ do: 'switch', id });
        state.current = result.current || id;
        toast('success', `已换成 ${state.current}，从下一张图起按它出`);
    } catch (error) {
        toast('error', `没换成：${error.message}`);
    } finally {
        state.busy = '';
        render();
    }
}

async function showBig(file) {
    const context = ctx();
    const item = state?.recent?.find((img) => img.file === file);
    toast('info', '正在拿大图……');
    try {
        const result = await call({ do: 'big', file });
        const box = document.createElement('div');
        box.className = 'tt-tc-big';
        box.innerHTML = `<img src="${esc(result.image)}" alt="">${item?.note ? `<div class="tt-tc-note">${esc(item.note)}</div>` : ''}`;
        await context?.callGenericPopup?.(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
    } catch (error) {
        toast('error', `大图没拿到：${error.message}`);
    }
}

function onPanelClick(event) {
    const ver = event.target.closest('.tt-tc-ver');
    if (ver) { switchTo(ver.dataset.ver); return; }
    const set = event.target.closest('.tt-tc-set');
    if (set) {
        state.open = state.open === set.dataset.set ? '' : set.dataset.set;
        render();
        return;
    }
    const pic = event.target.closest('.tt-tc-pic');
    if (pic) showBig(pic.dataset.file);
}

function getPanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'tt-taocan';
    panel.innerHTML = `
<h3 class="tt-tip-row">出图套餐 ${tip('点大卡看这个套餐有哪些版本，点版本就换上，电脑那边跟着换，从下一张图起按它出。标「● 没保存」的版本是电脑上改了还没点保存的，手机换上用的是保存过的那份。细调参数、换封面和样图在电脑上做。')}</h3>
<div class="tt-tc-page"></div>`;
    panel.addEventListener('click', onPanelClick);
    return panel;
}

async function openPopup() {
    const context = ctx();
    if (!context?.callGenericPopup) { toast('info', '弹不出窗口'); return; }
    state = { current: '', sets: null, open: '', recent: null, busy: '', error: '', recentError: '' };
    const box = getPanel();
    render();
    loadSets();
    loadRecent();
    await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
}

function mountWandItem() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (document.getElementById(WAND_ID)) return true;
    const item = document.createElement('div');
    item.id = WAND_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-layer-group extensionsMenuExtensionButton"></div><span>出图套餐</span>';
    item.addEventListener('click', () => openPopup());
    menu.appendChild(item);
    return true;
}

export function initTaocan() {
    clearInterval(mountTimer);
    if (mountWandItem()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (mountWandItem() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupTaocan() {
    clearInterval(mountTimer);
    document.getElementById(WAND_ID)?.remove();
    panel = null;
    state = null;
}

// 给电脑上的自测脚本用：换掉「怎么连电脑」，用假数据测界面
export const __test = { setTransport(fn) { transport = fn; }, viaTavern, openPopup, get state() { return state; } };
