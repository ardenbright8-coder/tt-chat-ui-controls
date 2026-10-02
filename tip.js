// 说明小圆圈 ⓘ（v1.16.5）：面板上的说明文字不再整段摆着占地方，收进 ⓘ，点一下在那一行下面弹个小气泡，
// 再点一下或者点别处就收起来。用户 2026-10-02：「如果都放一个面板里边，那面板都炸了」。
// 🚨 ⓘ 别放进 <label class="checkbox_label"> 里：点它会连带勾选框，手机上还会被防手滑拦掉。放在 label 后面同一行。

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const tip = (text, id = '') =>
    `<span${id ? ` id="${id}"` : ''} class="tt-tip fa-solid fa-circle-info" role="button" tabindex="0" title="点一下看说明" data-tip="${esc(text)}"></span>`;

let bound = false;

function onClick(event) {
    const icon = event.target.closest?.('.tt-tip');
    const open = document.querySelector('.tt-tip-bubble');
    if (icon) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (open) {
        const same = open.ttFor === icon;
        open.remove();
        if (same || !icon) return;
    }
    if (!icon) return;
    const bubble = document.createElement('div');
    bubble.className = 'tt-tip-bubble';
    bubble.textContent = icon.dataset.tip || '';
    bubble.ttFor = icon;
    (icon.closest('.tt-tip-row') || icon.parentElement).after(bubble);
}

export function initTips() {
    if (bound) return;
    document.addEventListener('click', onClick, true);
    bound = true;
}

export function cleanupTips() {
    document.removeEventListener('click', onClick, true);
    document.querySelectorAll('.tt-tip-bubble').forEach((el) => el.remove());
    bound = false;
}
