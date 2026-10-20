// 跟模拟器里手机酒馆的网页对话：node cdp.mjs eval "<js>"  |  node cdp.mjs shot out.png  |  node cdp.mjs file x.js
// 先 adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
import fs from 'node:fs';

const [, , cmd, arg] = process.argv;
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = list.find((p) => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const waits = new Map();
ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waits.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => { ws.onopen = r; });

if (cmd === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(arg, Buffer.from(r.result.data, 'base64'));
    console.log('saved', arg);
} else {
    const code = cmd === 'file' ? fs.readFileSync(arg, 'utf8') : arg;
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${code}})()`, awaitPromise: true, returnByValue: true, timeout: 120000 });
    if (r.result?.exceptionDetails) console.log('ERR', JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
    else console.log(typeof r.result?.result?.value === 'string' ? r.result.result.value : JSON.stringify(r.result?.result?.value, null, 1));
}
ws.close();
