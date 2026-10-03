// 更新完自动刷新（v1.16.6）：manifest 里那个 update 钩子在用户手机上没被叫到（原因看不到手机日志查不出），
// 所以扩展自己盯：用户在扩展列表里点更新按钮后，每秒看一次磁盘上自己的 manifest.json，最多看 1 分钟；
// 版本号变了＝新版下载好了，弹一句、2 秒后刷新。没变就什么也不做。平时不点更新时不跑。
// 用户 2026-10-02：「更新完扩展……直接给我就是做个后台重启」。

const EXTENSION_KEY = 'chat-text-color';
const MANIFEST_URL = new URL('./manifest.json', import.meta.url).href;
const WATCH_MS = 60000;
const STEP_MS = 1000;

let runningVersion = '';
let watchTimer = 0;
let reloading = false;
let reloadPage = () => location.reload();

async function diskVersion() {
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return '';
    return String((await response.json())?.version || '');
}

// 两条路（钩子、自己盯）谁先发现谁刷新，只刷一次
export function reloadSoon() {
    if (reloading) return;
    reloading = true;
    clearInterval(watchTimer);
    globalThis.toastr?.info?.('酒馆拓展更新好了，2 秒后自动刷新', '酒馆拓展');
    setTimeout(() => reloadPage(), 2000);
}

function startWatch() {
    if (!runningVersion || reloading) return;
    clearInterval(watchTimer);
    const until = Date.now() + WATCH_MS;
    let busy = false;
    watchTimer = setInterval(async () => {
        if (Date.now() > until) { clearInterval(watchTimer); return; }
        if (busy) return;
        busy = true;
        try {
            const now = await diskVersion();
            if (now && now !== runningVersion) reloadSoon();
        } catch { /* 这一秒读不到，下一秒再看 */ } finally {
            busy = false;
        }
    }, STEP_MS);
}

// 扩展列表里单个扩展的更新按钮，和顶上那排「更新全部」之类的按钮
function onClickCapture(event) {
    if (event.target.closest?.('.extensions_info .btn_update, .extensions_toolbar button, .extensions_toolbar .menu_button')) startWatch();
}

// 刷新后告诉用户装上的是哪一版（v1.16.8）：「全部更新」时酒馆不弹「已更新」、更新完马上自己刷新，
// 用户一直看不到任何确认。打开时跟上次记下的版本比，变了就弹一次。
// 没记过也弹：1.16.7 以前没记版本，不这样的话从 1.16.7 升上来的这一次看不到提示。
// 用户 2026-10-02：「主要有个提示嘛，我得确定我自己那啥」。
function announceNewVersion(version) {
    const context = globalThis.SillyTavern?.getContext?.();
    const all = context?.extensionSettings;
    if (!all || !version) return;
    const s = all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    if (s.lastSeenVersion === version) return;
    globalThis.toastr?.success?.(`酒馆拓展已更新到 ${version}`, '酒馆拓展', { timeOut: 6000 });
    s.lastSeenVersion = version;
    context.saveSettingsDebounced?.();
}

export function initUpdateWatch() {
    document.removeEventListener('click', onClickCapture, true);
    document.addEventListener('click', onClickCapture, true);
    if (!runningVersion) {
        diskVersion().then((v) => {
            runningVersion = runningVersion || v;
            announceNewVersion(runningVersion);
        }).catch(() => {});
    }
}

export function cleanupUpdateWatch() {
    document.removeEventListener('click', onClickCapture, true);
    clearInterval(watchTimer);
}

// 给电脑上的自测脚本用
export const __test = { startWatch, setReload(fn) { reloadPage = fn; }, get runningVersion() { return runningVersion; } };
