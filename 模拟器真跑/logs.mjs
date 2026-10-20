// node logs.mjs [秒数] [reload]：收集页面报错和控制台输出
const secs = Number(process.argv[2] || 5);
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find((p) => p.type === 'page').webSocketDebuggerUrl);
let id = 0;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled') console.log('[' + m.params.type + ']', m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600));
  if (m.method === 'Runtime.exceptionThrown') console.log('[EXC]', (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 800));
  if (m.method === 'Log.entryAdded') console.log('[log ' + m.params.entry.level + ']', m.params.entry.text.slice(0, 600), m.params.entry.url || '');
};
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
await new Promise((r) => { ws.onopen = r; });
send('Runtime.enable'); send('Log.enable');
if (process.argv[3] === 'reload') send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, secs * 1000));
ws.close();
