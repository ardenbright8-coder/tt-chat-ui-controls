// 每张卡点开再关掉，等 5 秒，看卡片页是不是还在（查「关掉里面那层，外面那层也跟着没了」）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pops = () => [...document.querySelectorAll('dialog.popup[open]')];
const out = [];
for (const key of (globalThis.__keys || ['taocan', 'cast', 'prompt', 'settings'])) {
    if (!document.querySelector('.tt-hub')) {
        document.getElementById('extensionsMenuButton').click(); await sleep(600);
        document.getElementById('tt-image-hub-wand').click(); await sleep(1500);
    }
    document.querySelector(`.tt-hub .tt-hub-card[data-key="${key}"]`).click();
    await sleep(2500);
    const top = pops().at(-1);
    const btn = top?.querySelector(globalThis.__how === 'x' ? '.popup-button-close' : '.popup-button-ok');
    btn?.click();
    await sleep(5000);
    out.push(`${key}: 关掉里面那层 5 秒后，弹窗 ${pops().length} 个，卡片页${document.querySelector('.tt-hub') ? '还在' : '没了'}`);
}
return out.join('\n');
