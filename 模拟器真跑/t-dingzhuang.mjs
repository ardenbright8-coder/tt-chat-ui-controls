// 定妆照改长相、挑衣服两段说明，直接拿模型跑一遍看回得对不对（v1.18.35）；不开模拟器
// 用法：node t-dingzhuang.mjs [平台名几个字] [模型名]   默认电脑上的 Gemini 3.8 flash
// 加 --出图 <起始编号>：再用电脑上「正在用」那版把定妆照画出来（ComfyUI 要开着），图放 output 顶层 ceshi_定妆照·…
import fs from 'node:fs';
import { createRequire } from 'node:module';
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} } }) };
const m = (await import(new URL('../story-image.js', import.meta.url).href)).__test;

const args = process.argv.slice(2);
const at = args.indexOf('--出图');
const 起 = at >= 0 ? Number(args[at + 1]) : 0;
const [平台 = 'Gemini', 模型 = 'gemini-3.8-flash'] = args.filter((a, i) => at < 0 || (i !== at && i !== at + 1));
const 根 = 'E:/个人AI资源管理/60_公用资源（钩子·skill·搜索引擎·可后期扩展）';
const 钥夹 = fs.readdirSync(根).find((n) => n.startsWith('模型API密钥'));
const 清单 = JSON.parse(fs.readFileSync(`${根}/${钥夹}/酒馆模型清单.json`, 'utf8'));
const p = 清单.平台.find((x) => x.名字.includes(平台));

async function ask(system, user) {
    const r = await fetch(`${p.地址}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.钥匙}` },
        body: JSON.stringify({ model: 模型, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 3000 }),
    });
    const j = await r.json();
    return j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 300);
}

const look = 'mature female, oval face, almond eyes, dark brown eyes, long straight black hair, large breasts, narrow waist, wide hips, fair skin, beauty mark under left eye';
const 改法 = [
    '熟女一点，三十多岁少妇那种，换成波浪卷的栗色长发，穿现代 OL 装，在办公室',
    '年轻一点，二十出头，短发，穿宽松卫衣，表情调皮',
    '衣服随便',
];
const 卡 = { description: '{{char}}是苏晚，民国时期上海百乐门的头牌歌女，风情万种，周旋于军阀和商人之间。', scenario: '1932 年上海，雨夜的百乐门后台。' };

const 画 = [];
let 当前 = { look, outfit: '', setting: '', mood: '' };
for (const 话 of 改法) {
    const reply = await ask(m.REVISE_PROMPT, `Current appearance: ${当前.look}\nCurrent portrait outfit: ${当前.outfit}\nCurrent portrait setting: ${当前.setting}\nCurrent portrait mood: ${当前.mood}\nUser request: ${话}`);
    const j = m.parseJsonReply(reply);
    console.log(`\n【改长相】${话}\n  回得是不是 JSON：${j ? '是' : '不是'}\n  look：${j?.look}\n  outfit：${j?.outfit}｜setting：${j?.setting}｜mood：${j?.mood}`);
    if (j) {
        当前 = { look: m.cleanTags(j.look), outfit: m.cleanTags(j.outfit || ''), setting: m.cleanTags(j.setting || ''), mood: m.cleanTags(j.mood || '') };
        画.push({ 名: `改·${话.slice(0, 8)}`, 词: m.portraitPrompt(当前.look, 当前.outfit ? 当前 : {}) });
    }
}
// 没定衣服时现挑：同一个人连挑两次，看换不换样
let last = '';
for (let i = 1; i <= 2; i++) {
    const reply = await ask(m.PORTRAIT_PICK_PROMPT, `Name: 苏晚\nAppearance: ${look}\n\nCharacter card:\n${卡.description}\n\nScenario:\n${卡.scenario}\n\nLast time she wore: ${last || '(nothing yet)'}`);
    const j = m.parseJsonReply(reply);
    console.log(`\n【现挑第 ${i} 次】民国歌女卡\n  outfit：${j?.outfit}｜setting：${j?.setting}｜mood：${j?.mood}`);
    if (j?.outfit) { last = m.cleanTags(j.outfit); 画.push({ 名: `现挑民国·第${i}次`, 词: m.portraitPrompt(look, j) }); }
}

if (起) {
    const require = createRequire(import.meta.url);
    const 出图 = require('C:/A-AI-gongju/geren-yule/工具/酒馆/出图/后台.js').处理;
    const 夹 = 'C:/A-AI-gongju/jiuguan-shengtu/ComfyUI_windows_portable/ComfyUI/output';
    let 号 = 起;
    for (const x of 画) {
        const r = await 出图.生图试一张({ 描述: x.词, 种子: 2026102100 + 号 });
        const 名 = `ceshi_定妆照·${x.名}_${String(号).padStart(5, '0')}_.png`;
        fs.renameSync(r.文件, `${夹}/${名}`);
        console.log('#' + 号, r.秒 + '秒', 名, '\n   词：' + x.词);
        号++;
    }
}
