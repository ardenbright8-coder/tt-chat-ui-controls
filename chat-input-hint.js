// 输入框里的灰字（v1.15.8）：酒馆原来写「输入想发送的消息，或输入 /? 获取帮助」，用户用不上斜杠命令，改成一句「输入文字内容」。
// 酒馆连上 / 断开模型时会把灰字换成 connected_text / no_connection_text，所以改 connected_text，
// 再盯着灰字，被换回原话时改回来。没连上时的「未连接到 API」照旧显示，那句有用。

const HINT = '输入文字内容';
let observer = null;
let original = '';
let timer = null;

// 原话中英文都带「/?」（翻译可能比这里晚到），认这个记号就不怕语言不同
function apply(box) {
    const connected = box.getAttribute('connected_text') || '';
    if (connected !== HINT) {
        if (connected.includes('/?')) original = connected;
        box.setAttribute('connected_text', HINT);
    }
    const now = box.getAttribute('placeholder') || '';
    if (now.includes('/?')) box.setAttribute('placeholder', HINT);
}

export function initChatInputHint() {
    clearInterval(timer);
    const start = () => {
        const box = document.getElementById('send_textarea');
        if (!box) return false;
        apply(box);
        observer?.disconnect();
        // 刹车：要是有别的代码一直把灰字改回去，两边会来回抢；3 秒里改了 20 次以上就不再管，灰字随它
        let runs = [];
        observer = new MutationObserver(() => {
            const now = Date.now();
            runs = runs.filter((at) => now - at < 3000);
            runs.push(now);
            if (runs.length > 20) {
                observer.disconnect();
                console.warn('[酒馆拓展] 输入框灰字被反复改回去，不再接管');
                return;
            }
            apply(box);
        });
        observer.observe(box, { attributes: true, attributeFilter: ['placeholder', 'connected_text'] });
        return true;
    };
    if (start()) return;
    let tries = 0;
    timer = setInterval(() => { if (start() || ++tries > 60) clearInterval(timer); }, 500);
}

export function cleanupChatInputHint() {
    clearInterval(timer);
    observer?.disconnect();
    observer = null;
    const box = document.getElementById('send_textarea');
    if (box && original) {
        box.setAttribute('connected_text', original);
        if (box.getAttribute('placeholder') === HINT) box.setAttribute('placeholder', original);
    }
}
