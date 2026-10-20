// 排版容错（v1.18.34）：AI 把状态栏、折叠框每行前面空了四格，酒馆的 markdown 把它当「原样照抄的代码」，
// 反引号、</details> 露出来，第二个状态栏还被塞进第一个里（仙侠小说那张卡，10-20 模拟器里抓到的）。
// 做法：往酒馆自带「正则」里放一条全局规则，只在显示时把「标签 / ``` 开头的行」前面的空格去掉；
// 发给 AI 的原文一个字不动（markdownOnly）。规则在「正则」列表里看得见，名字「酒馆拓展·排版容错」。
// 用户 10-20：「尽可能让所有的都能兼容进来」「一劳永逸」。扩展页「排版容错」能关。

import { tip } from './tip.js';
import { vlog } from './var-log.js';

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-format-settings';
const RULE_ID = 'tt-chat-ui-controls-format-fix';
const BS = String.fromCharCode(92);
const FENCE = '`'.repeat(3);
// /^[ \t]+(?=<\/?[A-Za-z][\w-]*(?=[\s>/])|```)/gm ：行首空白，后面紧跟一个 HTML 标签或 ```
export const FIND = `/^[ ${BS}t]+(?=<${BS}/?[A-Za-z][${BS}w-]*(?=[${BS}s>/])|${FENCE})/gm`;

const ctx = () => globalThis.SillyTavern?.getContext?.();
let mountTimer = null;

function settings() {
    const all = ctx()?.extensionSettings;
    if (!all) return { formatFix: true };
    const s = all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    if (typeof s.formatFix !== 'boolean') s.formatFix = true;
    return s;
}

function rule() {
    return {
        id: RULE_ID,
        scriptName: '酒馆拓展·排版容错（去掉标签前的缩进，只改显示）',
        findRegex: FIND,
        replaceString: '',
        trimStrings: [],
        placement: [2], // AI 回复
        disabled: false,
        markdownOnly: true, // 只改显示
        promptOnly: false,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    };
}

// 规则跟开关对齐；返回有没有改动
function syncRule() {
    const all = ctx()?.extensionSettings;
    if (!all) return false;
    const list = all.regex = Array.isArray(all.regex) ? all.regex : [];
    const i = list.findIndex((r) => r?.id === RULE_ID);
    const on = settings().formatFix;
    if (on) {
        const want = rule();
        if (i < 0) { list.push(want); vlog('排版容错', '加上了全局正则规则'); return true; }
        const cur = list[i];
        if (cur.findRegex !== want.findRegex || cur.disabled || !cur.markdownOnly) { list[i] = { ...cur, ...want }; return true; }
        return false;
    }
    if (i >= 0) { list.splice(i, 1); vlog('排版容错', '关掉了，删掉全局正则规则'); return true; }
    return false;
}

function mountPanel() {
    if (document.getElementById(SETTINGS_ID)) return true;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', `
<div id="${SETTINGS_ID}">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>排版容错</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="tt-tip-row"><label class="checkbox_label tt-hold-check"><input type="checkbox" id="tt-format-fix"> <span>状态栏不乱码</span></label>${tip('AI 写状态栏时每行前面空了好几格，酒馆会把它当成代码原样显示：反引号、</details> 露在外面，几个状态栏套在一起。打开后显示时把这些空格去掉，发给 AI 的原文不动。规则放在「正则」里，叫「酒馆拓展·排版容错」。')}</div>
    </div>
  </div>
</div>`);
    const box = document.getElementById('tt-format-fix');
    box.checked = settings().formatFix;
    box.addEventListener('change', async () => {
        settings().formatFix = box.checked;
        syncRule();
        ctx()?.saveSettingsDebounced?.();
        try { await ctx()?.reloadCurrentChat?.(); } catch (error) { console.warn('[酒馆拓展] 重画聊天失败', error); }
    });
    return true;
}

export function initFormatFix() {
    clearInterval(mountTimer);
    if (syncRule()) ctx()?.saveSettingsDebounced?.();
    if (mountPanel()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (mountPanel() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

// 停用扩展时规则留着不删：停用不该改用户的显示；真不要了在扩展页关掉开关
export function cleanupFormatFix() {
    clearInterval(mountTimer);
    document.getElementById(SETTINGS_ID)?.remove();
}

// 给电脑上的自测脚本用
export const __test = { FIND, rule, syncRule, settings };
