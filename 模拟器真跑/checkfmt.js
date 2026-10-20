// 查聊天里每条 AI 消息有没有排版崩：露出 ``` / </details> / <status 这类原样记号，或折叠框套在一起
const c = SillyTavern.getContext();
const F = '`'.repeat(3);
const out = [];
for (const el of document.querySelectorAll('#chat .mes[mesid]')) {
    const id = Number(el.getAttribute('mesid'));
    const m = c.chat[id];
    if (!m || m.is_user) continue;
    const t = el.querySelector('.mes_text');
    if (!t) continue;
    const text = t.innerText;
    const indented = (m.mes.match(/^[ \t]{4,}(<|```)/gm) || []).length;
    out.push({
        id,
        原文缩进行: indented,
        折叠框: t.querySelectorAll('details').length,
        套在一起: t.querySelectorAll('details details').length,
        露出反引号: text.includes(F),
        露出标签: /<\/?(details|summary|status\d*|StatusBlock)\b/i.test(text),
        小网页框: el.querySelectorAll('iframe').length,
    });
}
return JSON.stringify({ name: c.name2, msgs: out });
