// 挨个点「出图」卡片页里的卡，看弹没弹出对应窗口、关掉后卡片页还在
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const popups = () => [...document.querySelectorAll('dialog.popup[open], .popup[open]')];
const out = [];
for (const key of ['taocan', 'cast', 'prompt', 'settings']) {
    const card = document.querySelector(`.tt-hub .tt-hub-card[data-key="${key}"]`);
    if (!card) { out.push(`${key}: 找不到卡`); continue; }
    const before = popups().length;
    card.click();
    await sleep(2500);
    const list = popups();
    const top = list.at(-1);
    const title = (top?.querySelector('h3')?.innerText || top?.innerText || '').trim().split('\n')[0].slice(0, 30);
    out.push(`${key}: 弹窗 ${before}→${list.length}，最上面「${title}」`);
    const ok = [...(top?.querySelectorAll('.popup-button-ok, .popup-button-cancel') || [])].find((b) => b.offsetParent);
    ok?.click();
    await sleep(1500);
    out.push(`   关掉后弹窗 ${popups().length}，卡片页还在：${!!document.querySelector('.tt-hub')}`);
}
const toasts = [...document.querySelectorAll('#toast-container .toast')].map((t) => t.innerText.replace(/\s+/g, ' '));
return out.join('\n') + '\n提示：' + JSON.stringify(toasts);
