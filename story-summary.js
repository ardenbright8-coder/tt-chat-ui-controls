// One-tap story summary.
// A '总结全文' item in the left options menu (under 继续) asks the current model, OUTSIDE the
// role-play (no preset, no world info, nothing added to the chat), to
// summarise the whole story so far in about 1000 Chinese characters.
// The result shows in a floating bubble whose Copy button copies only the
// summary text.

const BUTTON_ID = 'option_tt_story_summary';
const BUBBLE_ID = 'tt_story_summary_bubble';
const RESPONSE_TOKENS = 4096;
const PROMPT_RESERVE_TOKENS = 1500;

const SYSTEM_PROMPT = [
    '【暂停一切角色扮演】',
    '从现在起你不再扮演任何角色，也不要续写故事、不要与任何人对话。',
    '你是旁观的故事整理者，任务只有一个：通读用户给出的整段对话记录，把到目前为止的故事整理成一篇约 1000 字的中文总结。',
    '哪些内容是关键由你自己判断：把故事的来龙去脉、关键事件与转折、人物关系和处境的变化，以及故事眼下停在哪里理清楚。',
    '只依据记录里写到的内容，不编造，不续写，不评价。',
    '忽略记录中的状态栏、格式说明、系统提示、思考过程之类与剧情无关的内容。',
    '输出要求：只输出总结正文，用 <总结> 和 </总结> 包起来；不要标题、不要前言后语、不要任何其他标签或格式。',
].join('\n');

let running = false;
let lastResult = null; // { chatId, length, text, note }
let button = null;
let mountTimer = null;
let observer = null;

const ctx = () => globalThis.SillyTavern?.getContext?.();

// Drop things that are not story text: code blocks (status bars, HTML
// cards), script/style, collapsible reasoning, then any remaining tags.
export function cleanMessageText(text) {
    return String(text ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<(think|thinking|details)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>\n]{1,80}>/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Pull the text between <总结> tags; fall back to the whole reply without tags.
export function extractSummary(reply) {
    const text = String(reply ?? '');
    const tagged = text.match(/<总结>([\s\S]*?)(?:<\/总结>|$)/);
    const body = tagged ? tagged[1] : text.replace(/<(think|thinking)[\s\S]*?<\/\1>/gi, '');
    return body.replace(/<\/?[^>\n]{1,40}>/g, '').trim();
}

async function countTokens(context, text) {
    try {
        if (typeof context.getTokenCountAsync === 'function') return await context.getTokenCountAsync(text);
    } catch { /* fall through to estimate */ }
    return Math.ceil(text.length / 1.3);
}

// Newest messages are kept first; the oldest are dropped only if the model's
// context can't hold the whole story.
async function buildTranscript(context) {
    const lines = [];
    for (const message of context.chat ?? []) {
        if (!message || message.is_system) continue;
        const text = cleanMessageText(message.mes);
        if (!text) continue;
        lines.push(`${message.name || (message.is_user ? context.name1 : context.name2)}：${text}`);
    }
    if (!lines.length) return null;

    const maxContext = Math.min(Number(context.maxContext) || 32768, 1_000_000);
    const budget = Math.max(2000, maxContext - RESPONSE_TOKENS - PROMPT_RESERVE_TOKENS);
    let kept = lines;
    let transcript = kept.join('\n\n');
    let tokens = await countTokens(context, transcript);
    while (tokens > budget && kept.length > 1) {
        const ratio = budget / tokens;
        const drop = Math.max(1, Math.ceil(kept.length * (1 - ratio)));
        kept = kept.slice(drop);
        transcript = kept.join('\n\n');
        tokens = await countTokens(context, transcript);
    }
    const skipped = lines.length - kept.length;
    return { transcript, skipped, total: lines.length };
}

function setBusy(busy) {
    running = busy;
    if (!button) return;
    button.classList.toggle('tt-summary-busy', busy);
    const icon = button.querySelector('i');
    icon?.classList.toggle('fa-book-open', !busy);
    icon?.classList.toggle('fa-spinner', busy);
    icon?.classList.toggle('fa-spin', busy);
    const label = button.querySelector('span');
    if (label) label.textContent = busy ? '正在总结…' : '总结全文';
}

function closeBubble() {
    document.getElementById(BUBBLE_ID)?.remove();
}

async function copyText(text, trigger) {
    let ok = false;
    try {
        await navigator.clipboard.writeText(text);
        ok = true;
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.append(area);
        area.select();
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        area.remove();
    }
    if (trigger) {
        const label = trigger.textContent;
        trigger.textContent = ok ? '已复制' : '复制失败';
        setTimeout(() => { trigger.textContent = label; }, 1400);
    }
}

function showBubble({ text = '', note = '', error = '', loading = false }) {
    closeBubble();
    const bubble = document.createElement('div');
    bubble.id = BUBBLE_ID;
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', '剧情总结');

    const head = document.createElement('div');
    head.className = 'tt-summary-head';
    const title = document.createElement('span');
    title.textContent = '剧情总结';
    const count = document.createElement('span');
    count.className = 'tt-summary-count';
    if (text) count.textContent = `${text.replace(/\s/g, '').length} 字`;
    head.append(title, count);

    const body = document.createElement('div');
    body.className = 'tt-summary-body';
    if (loading) body.textContent = '正在通读全文并整理，稍等片刻…';
    else if (error) body.textContent = error;
    else body.textContent = text;
    if (error) body.classList.add('tt-summary-error');

    bubble.append(head, body);
    if (note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'tt-summary-note';
        noteEl.textContent = note;
        bubble.append(noteEl);
    }

    const actions = document.createElement('div');
    actions.className = 'tt-summary-actions';
    const make = (label, cls, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); onClick(b); });
        actions.append(b);
        return b;
    };
    const copy = make('复制', 'tt-summary-copy', (b) => copyText(text, b));
    copy.disabled = !text;
    const again = make('重新生成', 'tt-summary-again', () => runSummary(true));
    again.disabled = loading;
    make('关闭', 'tt-summary-close', closeBubble);
    bubble.append(actions);

    document.body.append(bubble);
}

async function runSummary(force = false) {
    if (running) return;
    const context = ctx();
    if (!context?.generateRaw) {
        showBubble({ error: '当前酒馆版本不支持此功能（缺少 generateRaw 接口）。' });
        return;
    }
    const chatId = context.getCurrentChatId?.() ?? context.chatId ?? '';
    const length = context.chat?.length ?? 0;
    if (!force && lastResult && lastResult.chatId === chatId && lastResult.length === length) {
        showBubble(lastResult);
        return;
    }

    setBusy(true);
    showBubble({ loading: true });
    try {
        const built = await buildTranscript(context);
        if (!built) {
            showBubble({ error: '当前聊天还没有可总结的内容。' });
            return;
        }
        const omitted = built.skipped > 0
            ? `（对话过长，最早的 ${built.skipped} 条已省略，以下从中途开始）\n\n`
            : '';
        const prompt = [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: `${omitted}【对话记录开始】\n${built.transcript}\n【对话记录结束】\n\n现在暂停角色扮演，按要求输出约 1000 字的总结。`,
            },
        ];
        const reply = await context.generateRaw({ prompt, responseLength: RESPONSE_TOKENS, trimNames: false });
        const text = extractSummary(reply);
        if (!text) {
            showBubble({ error: '模型没有返回总结内容，可以点“重新生成”再试一次。' });
            return;
        }
        const note = built.skipped > 0
            ? `对话太长，只总结了最近 ${built.total - built.skipped} 条（共 ${built.total} 条）。`
            : '';
        lastResult = { chatId, length, text, note };
        showBubble(lastResult);
    } catch (error) {
        console.error('[酒馆拓展] 总结失败', error);
        showBubble({ error: `总结失败：${error?.message || error}` });
    } finally {
        setBusy(false);
    }
}

// Close the host's options menu the way its own button does, so the host's
// open/closed flag stays right and the next tap on the menu opens it at once.
function closeOptionsMenu() {
    const menu = document.getElementById('options');
    if (menu && getComputedStyle(menu).display !== 'none') document.getElementById('options_button')?.click();
}

function mountButton() {
    if (document.getElementById(BUTTON_ID)) return true;
    const list = document.querySelector('#options .options-content');
    if (!list) return false;
    button = document.createElement('a');
    button.id = BUTTON_ID;
    button.title = '暂停角色扮演，把目前的故事总结成约 1000 字';
    const icon = document.createElement('i');
    icon.className = 'fa-lg fa-solid fa-book-open';
    const label = document.createElement('span');
    label.textContent = '总结全文';
    button.append(icon, label);
    button.addEventListener('click', (event) => {
        event.preventDefault();
        closeOptionsMenu();
        runSummary(false);
    });
    const after = document.getElementById('option_continue');
    if (after?.parentElement === list) after.after(button);
    else list.append(button);
    return true;
}

function watchMenu() {
    if (observer) return;
    // Put the menu item back if the host rebuilds its options menu.
    observer = new MutationObserver(() => { if (!document.getElementById(BUTTON_ID)) mountButton(); });
    observer.observe(document.getElementById('options') ?? document.body, { childList: true, subtree: true });
}

export function initStorySummary() {
    clearInterval(mountTimer);
    if (mountButton()) {
        watchMenu();
        return;
    }
    let tries = 0;
    mountTimer = setInterval(() => {
        const done = mountButton();
        if (done) watchMenu();
        if (done || ++tries > 60) clearInterval(mountTimer);
    }, 500);
}

export function cleanupStorySummary() {
    clearInterval(mountTimer);
    observer?.disconnect();
    observer = null;
    closeBubble();
    document.getElementById(BUTTON_ID)?.remove();
    button = null;
}
