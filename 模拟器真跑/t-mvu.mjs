// 变量小框读路径的小测试（不用开模拟器）：node 模拟器真跑/t-mvu.mjs
// lxq-sample.json 是 10-20 陆雪琪卡在模拟器里一条真实回复的变量块（正文删了）+ 前后变量
import fs from 'node:fs';
globalThis.localStorage = { getItem: () => null, setItem() {} };
const m = await import(new URL('../mvu-fix.js', import.meta.url).href);
const s = JSON.parse(fs.readFileSync(new URL('./lxq-sample.json', import.meta.url), 'utf8'));
const eq = (a, b, n) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(ok ? '绿' : '红', n, ok ? '' : JSON.stringify(a)); if (!ok) process.exitCode = 1; };
eq(m.parsePath('世界.当前时间[0]'), ['世界', '当前时间', '0'], '点+下标');
eq(m.parsePath("角色['林 婉茹'].好感度[0]"), ['角色', '林 婉茹', '好感度', '0'], '引号键');
eq(m.parsePath('a.b.0'), ['a', 'b', '0'], '纯点');
const rows = m.compare(m.readChanges(s.mes), s.before, s.after);
eq(rows.map((r) => [r.old, r.now, r.ok]), [['清晨', '上午', true], ['青云山，下山的小径', '青山镇，镇口', true]], '陆雪琪真实回复');
eq(m.readChanges("_.add('陆雪琪.堕落度[0]', 1)\n").map((r) => [r.path, r.kind, r.value]), [[['陆雪琪', '堕落度', '0'], 'add', 1]], '没分号的add');
const jp = m.readChanges('<JSONPatch>[{"op":"replace","path":"/林婉茹/好感度","value":26}]</JSONPatch>');
eq(jp.map((r) => r.path), [['林婉茹', '好感度']], 'JSONPatch照旧');
