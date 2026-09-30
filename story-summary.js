// Story summary + summary library.
//
// 总结全文 (options menu, under 继续): asks the current model OUTSIDE the
// role-play (no preset, no world info, nothing written to the chat) to
// summarise the story so far in about 1000 Chinese characters. Every result
// is saved to the summary library automatically.
//
// 总结库: lists saved summaries across all chats and characters. A summary
// can become the opening of a fresh chat (added as an extra greeting swipe,
// so swiping still reaches the card's own openings), or be placed in this
// chat's Author's Note for cards whose status bar needs the real opening.

const SUMMARY_ID = 'option_tt_story_summary';
const LIBRARY_ID = 'option_tt_summary_library';
const BLANK_ID = 'option_tt_blank_opening';
const BLANK_WINDOW_MS = 60_000;
const BUBBLE_ID = 'tt_story_summary_bubble';
const EXTENSION_KEY = 'chat-text-color';
const LIBRARY_LIMIT = 30;
const PROMPT_RESERVE_TOKENS = 1500;
const RECAP_TITLE = '【前情提要】';

const LENGTH_MIN = 1000;
const LENGTH_MAX = 3000;
const LENGTH_DEFAULT = 1000;

function systemPrompt(length) {
    return [
        '【暂停一切角色扮演】',
        '从现在起你不再扮演任何角色，也不要续写故事、不要与任何人对话。',
        '下面是这段角色扮演的聊天记录。你的任务只有一个：把故事里已经发生的情节，整理成一篇约 ' + length + ' 字的中文剧情总结。',
        '哪些内容是关键由你自己判断：把故事的来龙去脉、关键事件与转折、人物关系和处境的变化，以及故事眼下停在哪里理清楚。',
        '只写记录里发生过的情节，不添加没有的事件，不续写后面的发展。',
        '记录里的状态栏、界面代码、格式说明、思考过程等与剧情无关的内容直接略过。',
        '记录只有一部分时，就根据现有内容完成总结。',
        '只输出总结正文，用 <总结> 和 </总结> 包起来，不要标题、前言或其他内容。',
    ].join('\n');
}

let running = false;
let lastResult = null; // { chatId, chatLength, words, text, note }
let mountTimer = null;
let observer = null;

const ctx = () => globalThis.SillyTavern?.getContext?.();

// ---------------------------------------------------------------- text utils

// Drop things that are not story text: code blocks (status bars, HTML
// cards), script/style, collapsible reasoning, then any remaining tags.
export function cleanMessageText(text) {
    return String(text ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<(think|thinking|details|UpdateVariable|StatusPlaceHolderImpl)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/?[A-Za-z\u4e00-\u9fff_][^<>]*\/?>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
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

// Replace an earlier recap block in the Author's Note, or put one on top.
export function mergeRecapIntoNote(note, summary) {
    const block = `${RECAP_TITLE}\n${summary}\n${RECAP_TITLE.replace('【', '【/')}`;
    const current = String(note ?? '');
    const pattern = /【前情提要】[\s\S]*?【\/前情提要】/;
    if (pattern.test(current)) return current.replace(pattern, block);
    return current.trim() ? `${block}\n\n${current}` : block;
}

const charCount = (text) => String(text ?? '').replace(/\s/g, '').length;

function formatTime(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------- library

function library() {
    const context = ctx();
    const all = context?.extensionSettings;
    if (!all) return [];
    all[EXTENSION_KEY] ??= {};
    const settings = all[EXTENSION_KEY];
    if (!Array.isArray(settings.summaryLibrary)) settings.summaryLibrary = [];
    return settings.summaryLibrary;
}

function summaryLength() {
    const settings = ctx()?.extensionSettings?.[EXTENSION_KEY];
    const value = Number(settings?.summaryLength);
    return Number.isFinite(value) && value > 0 ? Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, Math.round(value))) : LENGTH_DEFAULT;
}

// Name of the preset the user currently has selected, exactly as the preset
// dropdown shows it (chat completion, text completion, …).
function currentPresetName() {
    const context = ctx();
    const api = context?.mainApi;
    const select = api ? document.querySelector(`select[data-preset-manager-for="${api}"]`) : null;
    const fromUi = select?.selectedOptions?.[0]?.textContent?.trim();
    if (fromUi) return fromUi;
    if (api === 'openai') return String(context?.chatCompletionSettings?.preset_settings_openai ?? '').trim();
    return '';
}

function usePreset() {
    const value = ctx()?.extensionSettings?.[EXTENSION_KEY]?.summaryUsePreset;
    return value !== false;
}

function setUsePreset(on) {
    const all = ctx()?.extensionSettings;
    if (!all) return;
    all[EXTENSION_KEY] ??= {};
    all[EXTENSION_KEY].summaryUsePreset = !!on;
    persist();
}

function setSummaryLength(value) {
    const all = ctx()?.extensionSettings;
    if (!all) return;
    all[EXTENSION_KEY] ??= {};
    all[EXTENSION_KEY].summaryLength = Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, Math.round(Number(value) || LENGTH_DEFAULT)));
    persist();
}

// Chinese runs ~1–1.5 tokens per character; leave room for reasoning models.
const responseTokensFor = (length) => Math.max(4096, Math.ceil(length * 2) + 2048);

function persist() {
    try { ctx()?.saveSettingsDebounced?.(); } catch { /* next save will catch up */ }
}

function saveToLibrary({ text, character, chatId }) {
    const items = library();
    const existing = items.findIndex((item) => item.text === text);
    if (existing >= 0) items.splice(existing, 1);
    const item = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, character, chatId, createdAt: Date.now() };
    items.unshift(item);
    if (items.length > LIBRARY_LIMIT) items.length = LIBRARY_LIMIT;
    persist();
    return item;
}

function removeFromLibrary(id) {
    const items = library();
    const index = items.findIndex((item) => item.id === id);
    if (index >= 0) items.splice(index, 1);
    persist();
}

// ---------------------------------------------------------------- applying

// Only a chat that holds nothing but its opening may get a new opening.
function openingState() {
    const chat = ctx()?.chat ?? [];
    if (chat.length === 0) return 'empty';
    if (chat.length === 1 && !chat[0].is_user) return 'greeting';
    return 'busy';
}

async function useAsOpening(text) {
    const context = ctx();
    const chat = context?.chat;
    if (!chat) throw new Error('没有打开的聊天');
    const body = `${RECAP_TITLE}\n${text}`;
    const state = openingState();
    if (state === 'busy') throw new Error('只能在刚开的新聊天里替换开场白');
    if (state === 'empty') {
        const now = new Date().toISOString();
        chat.push({
            name: context.name2,
            is_user: false,
            is_system: false,
            send_date: now,
            mes: body,
            swipes: [body],
            swipe_id: 0,
            swipe_info: [{ send_date: now, extra: {} }],
            extra: {},
        });
    } else {
        // Add the recap as one more greeting swipe and show it. The card's own
        // openings keep their positions, so swiping right brings them back.
        const message = chat[0];
        if (!Array.isArray(message.swipes) || !message.swipes.length) {
            message.swipes = [message.mes];
            message.swipe_id = 0;
        }
        if (!Array.isArray(message.swipe_info)) message.swipe_info = message.swipes.map(() => ({}));
        while (message.swipe_info.length < message.swipes.length) message.swipe_info.push({});
        let index = message.swipes.indexOf(body);
        if (index < 0) {
            message.swipes.push(body);
            message.swipe_info.push({ send_date: message.send_date, extra: {} });
            index = message.swipes.length - 1;
        }
        message.swipe_id = index;
        message.mes = body;
    }
    await context.saveChat?.();
    await context.reloadCurrentChat?.();
}

// Remove the card's opening from this fresh chat only, so the user can write
// their own first message. Reloading an existing chat never re-adds it.
let pendingBlankUntil = 0;
let blankListener = null;

// Menu action: in a fresh chat, drop its opening now; otherwise start a new
// chat through the host's own flow (with its confirm dialog) and drop the
// opening as soon as that chat is created.
async function blankOpening() {
    const state = openingState();
    if (state === 'empty') {
        globalThis.toastr?.info?.('这个聊天已经是空白开局了');
        return;
    }
    if (state === 'greeting') {
        try {
            await clearOpening();
            globalThis.toastr?.success?.('已清空开场白，可以自己写开局了');
        } catch (error) {
            globalThis.toastr?.error?.(String(error?.message || error));
        }
        return;
    }
    const context = ctx();
    const events = context?.eventSource;
    const types = context?.eventTypes ?? context?.event_types;
    const start = document.getElementById('option_start_new_chat');
    if (!events?.on || !types?.CHAT_CREATED || !start) {
        globalThis.toastr?.warning?.('请先用“开始新聊天”开一个新聊天，再点“空白开局”');
        return;
    }
    pendingBlankUntil = Date.now() + BLANK_WINDOW_MS;
    if (!blankListener) {
        blankListener = () => {
            if (Date.now() > pendingBlankUntil) return;
            pendingBlankUntil = 0;
            // Let the host finish its new-chat work (first-message events,
            // status-bar setup) before the opening is removed.
            setTimeout(async () => {
                if (openingState() !== 'greeting') return;
                try {
                    await clearOpening();
                    globalThis.toastr?.success?.('新聊天已开好，开场白已清空');
                } catch (error) {
                    globalThis.toastr?.error?.(String(error?.message || error));
                }
            }, 300);
        };
        events.on(types.CHAT_CREATED, blankListener);
    }
    start.click();
}

async function clearOpening() {
    const context = ctx();
    if (openingState() !== 'greeting') throw new Error('只能在刚开的新聊天里清空开场白');
    context.chat.splice(0, 1);
    await context.saveChat?.();
    await context.reloadCurrentChat?.();
}

function useAsAuthorsNote(text) {
    const input = document.getElementById('extension_floating_prompt');
    if (!input) throw new Error('找不到作者注释输入框');
    const jq = globalThis.jQuery;
    const next = mergeRecapIntoNote(input.value, text);
    // Go through the host's own input handler (same path as its /note command),
    // which saves the chat metadata and refreshes the token counter.
    if (jq) jq(input).val(next).trigger('input');
    else {
        input.value = next;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // An interval of 0 switches the note off; make it apply every turn.
    const interval = document.getElementById('extension_floating_interval');
    if (interval && Number(interval.value) === 0) {
        if (jq) jq(interval).val(1).trigger('input');
        else { interval.value = '1'; interval.dispatchEvent(new Event('input', { bubbles: true })); }
    }
}

// ---------------------------------------------------------------- bubble UI

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
    flash(trigger, ok ? '已复制' : '复制失败');
}

function flash(button, label) {
    if (!button) return;
    const original = button.dataset.label ?? button.textContent;
    button.dataset.label = original;
    button.textContent = label;
    clearTimeout(Number(button.dataset.timer));
    button.dataset.timer = String(setTimeout(() => { button.textContent = original; }, 1500));
}

// actions: [{ label, cls?, onClick(button), disabled? }]
function showBubble({ title = '剧情总结', text = '', meta = '', note = '', error = '', loading = false, list = null, extra = null, actions = [] }) {
    closeBubble();
    const bubble = document.createElement('div');
    bubble.id = BUBBLE_ID;
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', title);

    const head = document.createElement('div');
    head.className = 'tt-summary-head';
    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    const metaEl = document.createElement('span');
    metaEl.className = 'tt-summary-count';
    metaEl.textContent = meta || (text ? `${charCount(text)} 字` : '');
    head.append(titleEl, metaEl);
    bubble.append(head);

    if (list) bubble.append(list);
    else {
        const body = document.createElement('div');
        body.className = 'tt-summary-body';
        body.textContent = loading ? `正在通读全文，整理约 ${summaryLength()} 字的总结，稍等片刻…` : (error || text);
        if (error) body.classList.add('tt-summary-error');
        bubble.append(body);
    }

    if (extra) bubble.append(extra);

    if (note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'tt-summary-note';
        noteEl.textContent = note;
        bubble.append(noteEl);
    }

    const bar = document.createElement('div');
    bar.className = 'tt-summary-actions';
    bar.style.gridTemplateColumns = `repeat(${Math.min(3, actions.length) || 1}, minmax(0, 1fr))`;
    for (const action of actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = action.cls ?? '';
        b.textContent = action.label;
        b.disabled = !!action.disabled;
        b.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            action.onClick(b);
        });
        bar.append(b);
    }
    bubble.append(bar);
    document.body.append(bubble);
    return bubble;
}

function lengthRow() {
    const row = document.createElement('div');
    row.className = 'tt-summary-length';
    const label = document.createElement('span');
    label.textContent = '字数';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(LENGTH_MIN);
    range.max = String(LENGTH_MAX);
    range.step = '100';
    const number = document.createElement('input');
    number.type = 'number';
    number.inputMode = 'numeric';
    number.min = String(LENGTH_MIN);
    number.max = String(LENGTH_MAX);
    number.step = '100';
    const value = summaryLength();
    range.value = String(value);
    number.value = String(value);
    range.addEventListener('input', () => { number.value = range.value; });
    range.addEventListener('change', () => setSummaryLength(range.value));
    number.addEventListener('change', () => {
        setSummaryLength(number.value);
        number.value = String(summaryLength());
        range.value = number.value;
    });
    row.append(label, range, number);
    return row;
}

function lengthControl() {
    const box = document.createElement('div');
    box.className = 'tt-summary-settings';
    const toggle = document.createElement('label');
    toggle.className = 'tt-summary-toggle';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = usePreset();
    check.addEventListener('change', () => setUsePreset(check.checked));
    const text = document.createElement('span');
    text.textContent = `使用预设：${currentPresetName() || '当前预设'}（推荐）`;
    toggle.title = '用你平时聊天的预设来生成总结，不带世界书和作者注释；拿不到内容时自动改用直接请求';
    toggle.append(check, text);
    box.append(lengthRow(), toggle);
    return box;
}

function setLoadingText(message) {
    const body = document.querySelector(`#${BUBBLE_ID} .tt-summary-body`);
    if (body) body.textContent = message;
}

function showResult(result) {
    showBubble({
        text: result.text,
        extra: lengthControl(),
        note: [result.note, '已自动存入总结库。调整字数后点“重新生成”即按新字数总结。'].filter(Boolean).join('\n'),
        actions: [
            { label: '复制', cls: 'tt-summary-primary', onClick: (b) => copyText(result.text, b) },
            { label: '重新生成', onClick: () => runSummary(true) },
            { label: '关闭', onClick: closeBubble },
        ],
    });
}

function showLibrary(query = '') {
    const items = library();
    const wrap = document.createElement('div');
    wrap.className = 'tt-summary-list';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'tt-summary-search';
    search.placeholder = '按角色名或内容搜索';
    search.value = query;
    const rows = document.createElement('div');
    rows.className = 'tt-summary-rows';
    wrap.append(search, rows);

    const render = () => {
        rows.replaceChildren();
        const q = search.value.trim().toLowerCase();
        const shown = q
            ? items.filter((item) => `${item.character ?? ''}\n${item.text}`.toLowerCase().includes(q))
            : items;
        if (!shown.length) {
            const empty = document.createElement('div');
            empty.className = 'tt-summary-empty';
            empty.textContent = items.length
                ? '没有找到匹配的总结。'
                : '总结库还是空的。在聊天里点菜单“总结全文”，生成的总结会自动存到这里（最多保留最近 30 条）。';
            rows.append(empty);
            return;
        }
        for (const item of shown) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'tt-summary-row';
            const top = document.createElement('span');
            top.className = 'tt-summary-row-meta';
            top.textContent = `${item.character || '未知角色'} · ${formatTime(item.createdAt)} · ${charCount(item.text)} 字`;
            const preview = document.createElement('span');
            preview.className = 'tt-summary-row-text';
            preview.textContent = item.text;
            row.append(top, preview);
            row.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                showLibraryItem(item, search.value);
            });
            rows.append(row);
        }
    };
    search.addEventListener('input', render);
    render();

    showBubble({
        title: '总结库',
        meta: items.length ? `${items.length} / ${LIBRARY_LIMIT} 条` : '',
        list: wrap,
        actions: [{ label: '关闭', onClick: closeBubble }],
    });
}

function showLibraryItem(item, query = '') {
    const state = openingState();
    const openingNote = state === 'busy'
        ? '替换开场白只能在刚开的新聊天里用；聊天已经开始的，可以用“作者注释”。'
        : '替换开场白：总结会成为开场白的一个新选项并直接显示，右滑可翻回卡里原来的开场白。带状态栏的卡建议用“作者注释”：开场白不动，总结写进本聊天的作者注释。';
    let deleteArmed = false;
    showBubble({
        title: item.character ? `${item.character} 的总结` : '总结',
        meta: `${formatTime(item.createdAt)} · ${charCount(item.text)} 字`,
        text: item.text,
        note: openingNote,
        actions: [
            {
                label: '替换开场白',
                cls: 'tt-summary-primary',
                disabled: state === 'busy',
                onClick: async (b) => {
                    try {
                        b.disabled = true;
                        await useAsOpening(item.text);
                        closeBubble();
                        globalThis.toastr?.success?.('已用总结作为开场白，右滑可翻回原开场白');
                    } catch (error) {
                        b.disabled = false;
                        flash(b, '失败');
                        globalThis.toastr?.error?.(String(error?.message || error));
                    }
                },
            },
            {
                label: '作者注释',
                onClick: (b) => {
                    try {
                        useAsAuthorsNote(item.text);
                        flash(b, '已放入');
                        globalThis.toastr?.success?.('总结已放进本聊天的作者注释，每轮都会带给模型');
                    } catch (error) {
                        flash(b, '失败');
                        globalThis.toastr?.error?.(String(error?.message || error));
                    }
                },
            },
            { label: '复制', onClick: (b) => copyText(item.text, b) },
            {
                label: '删除',
                cls: 'tt-summary-danger',
                onClick: (b) => {
                    // Two taps: the first arms, the second deletes.
                    if (!deleteArmed) {
                        deleteArmed = true;
                        b.textContent = '再点一次删除';
                        setTimeout(() => { deleteArmed = false; if (b.isConnected) b.textContent = '删除'; }, 2500);
                        return;
                    }
                    removeFromLibrary(item.id);
                    showLibrary(query);
                },
            },
            { label: '返回列表', onClick: () => showLibrary(query) },
            { label: '关闭', onClick: closeBubble },
        ],
    });
}

// ---------------------------------------------------------------- summarise

async function countTokens(context, text) {
    try {
        if (typeof context.getTokenCountAsync === 'function') return await context.getTokenCountAsync(text);
    } catch { /* fall through to estimate */ }
    return Math.ceil(text.length / 1.3);
}

// Newest messages are kept first; the oldest are dropped only if the model's
// context can't hold the whole story.
// context.maxContext is the text-completion slider; chat-completion APIs keep
// their own limit in chatCompletionSettings.openai_max_context.
function contextLimit(context) {
    if (context.mainApi === 'openai') {
        const limit = Number(context.chatCompletionSettings?.openai_max_context);
        if (limit > 0) return limit;
    }
    return Number(context.maxContext) || 32768;
}

async function buildTranscript(context, responseTokens) {
    const lines = [];
    for (const message of context.chat ?? []) {
        if (!message || message.is_system) continue;
        const text = cleanMessageText(message.mes);
        if (!text) continue;
        lines.push(`${message.name || (message.is_user ? context.name1 : context.name2)}：${text}`);
    }
    if (!lines.length) return null;

    const maxContext = Math.min(contextLimit(context), 1_000_000);
    const budget = Math.max(2000, maxContext - responseTokens - PROMPT_RESERVE_TOKENS);
    let kept = lines;
    let transcript = kept.join('\n\n');
    let tokens = await countTokens(context, transcript);
    while (tokens > budget && kept.length > 1) {
        const drop = Math.max(1, Math.ceil(kept.length * (1 - budget / tokens)));
        kept = kept.slice(drop);
        transcript = kept.join('\n\n');
        tokens = await countTokens(context, transcript);
    }
    return { transcript, skipped: lines.length - kept.length, total: lines.length };
}

function setBusy(busy) {
    running = busy;
    const item = document.getElementById(SUMMARY_ID);
    if (!item) return;
    item.classList.toggle('tt-summary-busy', busy);
    const icon = item.querySelector('i');
    icon?.classList.toggle('fa-book-open', !busy);
    icon?.classList.toggle('fa-spinner', busy);
    icon?.classList.toggle('fa-spin', busy);
    const label = item.querySelector('span');
    if (label) label.textContent = busy ? '正在总结…' : '总结全文';
}

// Menu entry: show the last result for this chat if nothing changed,
// otherwise let the user set the length before generating.
function openSummary() {
    if (running) {
        showBubble({ loading: true, actions: [{ label: '关闭', onClick: closeBubble }] });
        return;
    }
    const context = ctx();
    const chatId = context?.getCurrentChatId?.() ?? context?.chatId ?? '';
    const chatLength = context?.chat?.length ?? 0;
    if (lastResult && lastResult.chatId === chatId && lastResult.chatLength === chatLength && lastResult.words === summaryLength()) {
        showResult(lastResult);
        return;
    }
    showBubble({
        text: '将暂停角色扮演，通读当前聊天，整理成一篇剧情总结。先选好字数，再点“开始总结”。',
        meta: ' ',
        extra: lengthControl(),
        actions: [
            { label: '开始总结', cls: 'tt-summary-primary', onClick: () => runSummary(true) },
            { label: '关闭', onClick: closeBubble },
        ],
    });
}

async function runSummary(force = false) {
    if (running) return;
    const context = ctx();
    if (!context?.generateRaw) {
        showBubble({ error: '当前酒馆版本不支持此功能（缺少 generateRaw 接口）。', actions: [{ label: '关闭', onClick: closeBubble }] });
        return;
    }
    const chatId = context.getCurrentChatId?.() ?? context.chatId ?? '';
    const chatLength = context.chat?.length ?? 0;
    const words = summaryLength();
    if (!force && lastResult && lastResult.chatId === chatId && lastResult.chatLength === chatLength && lastResult.words === words) {
        showResult(lastResult);
        return;
    }

    const fail = (message) => showBubble({
        error: message,
        extra: lengthControl(),
        actions: [{ label: '重新生成', onClick: () => runSummary(true) }, { label: '关闭', onClick: closeBubble }],
    });

    setBusy(true);
    showBubble({ loading: true, actions: [{ label: '关闭', onClick: closeBubble }] });
    try {
        const responseTokens = responseTokensFor(words);
        const built = await buildTranscript(context, responseTokens);
        if (!built) {
            fail('当前聊天还没有可总结的内容。');
            return;
        }
        if (charCount(built.transcript) < 30) {
            fail('没有读到可总结的聊天正文（消息里可能全是界面代码）。');
            return;
        }
        const omitted = built.skipped > 0
            ? `（对话过长，最早的 ${built.skipped} 条已省略，以下从中途开始）\n\n`
            : '';
        const prompt = [
            { role: 'system', content: systemPrompt(words) },
            {
                role: 'user',
                content: `${omitted}【对话记录开始】\n${built.transcript}\n【对话记录结束】\n\n现在暂停角色扮演，按要求输出约 ${words} 字的剧情总结。`,
            },
        ];
        // Try the chosen route first and fall back to the other one when it
        // errors or comes back empty. The preset route uses the user's own
        // chat preset (world info / author's note skipped); the direct route
        // sends only our instruction plus the cleaned transcript.
        const presetFirst = usePreset() && typeof context.generateQuietPrompt === 'function';
        const routes = presetFirst ? ['preset', 'direct'] : ['direct', 'preset'];
        const names = { preset: '走预设', direct: '直接请求' };
        const run = {
            preset: async () => {
                if (typeof context.generateQuietPrompt !== 'function') throw new Error('当前酒馆不支持');
                const instruction = `${systemPrompt(words)}\n\n现在暂停角色扮演，根据以上全部聊天记录，按要求输出约 ${words} 字的剧情总结。`;
                return context.generateQuietPrompt({ quietPrompt: instruction, skipWIAN: true, responseLength: responseTokens, removeReasoning: true });
            },
            direct: () => context.generateRaw({ prompt, responseLength: responseTokens, trimNames: false }),
        };
        let text = '';
        let used = '';
        const problems = [];
        for (const [index, route] of routes.entries()) {
            if (index > 0) setLoadingText(`${names[routes[0]]}没有拿到内容，正在改用${names[route]}重试…`);
            try {
                text = extractSummary(await run[route]());
            } catch (error) {
                problems.push(`${names[route]}：${error?.message || error}`);
                continue;
            }
            if (text) { used = route; break; }
            problems.push(`${names[route]}：模型返回为空`);
        }
        if (!text) {
            fail(`总结失败。${problems.join('；')}。可以稍后重试，或换个模型再试。`);
            return;
        }
        const presetName = currentPresetName() || '当前预设';
        const note = [
            used === 'preset' ? `这次用的预设：${presetName}` : '这次是直接请求，没有用预设。',
            used !== routes[0] ? `（${names[routes[0]]}没有拿到内容，已自动改用${names[used]}）` : '',
            used === 'direct' && built.skipped > 0 ? `对话太长，只带了最近 ${built.total - built.skipped} 条（共 ${built.total} 条）。` : '',
        ].filter(Boolean).join('\n');
        saveToLibrary({ text, character: context.name2, chatId });
        lastResult = { chatId, chatLength, words, text, note };
        showResult(lastResult);
    } catch (error) {
        console.error('[酒馆拓展] 总结失败', error);
        fail(`总结失败：${error?.message || error}`);
    } finally {
        setBusy(false);
    }
}

// ---------------------------------------------------------------- menu items

// Close the host's options menu the way its own button does, so the host's
// open/closed flag stays right and the next tap on the menu opens it at once.
function closeOptionsMenu() {
    const menu = document.getElementById('options');
    if (menu && getComputedStyle(menu).display !== 'none') document.getElementById('options_button')?.click();
}

function makeMenuItem(id, iconClass, text, title, onClick) {
    const item = document.createElement('a');
    item.id = id;
    item.title = title;
    const icon = document.createElement('i');
    icon.className = `fa-lg fa-solid ${iconClass}`;
    const label = document.createElement('span');
    label.textContent = text;
    item.append(icon, label);
    item.addEventListener('click', (event) => {
        event.preventDefault();
        closeOptionsMenu();
        onClick();
    });
    return item;
}

const MENU_IDS = [SUMMARY_ID, LIBRARY_ID, BLANK_ID];

function mountMenu() {
    if (MENU_IDS.every((id) => document.getElementById(id))) return true;
    const list = document.querySelector('#options .options-content');
    if (!list) return false;
    MENU_IDS.forEach((id) => document.getElementById(id)?.remove());
    const summary = makeMenuItem(SUMMARY_ID, 'fa-book-open', '总结全文', '暂停角色扮演，把目前的故事整理成剧情总结', openSummary);
    const lib = makeMenuItem(LIBRARY_ID, 'fa-box-archive', '总结库', '查看存下的总结，用于新聊天开场或作者注释', () => showLibrary());
    const blank = makeMenuItem(BLANK_ID, 'fa-file', '空白开局', '开一个没有开场白的新聊天，自己写第一条', blankOpening);
    const after = document.getElementById('option_continue');
    if (after?.parentElement === list) after.after(summary, lib, blank);
    else list.append(summary, lib, blank);
    if (running) setBusy(true);
    return true;
}

// Opening the options menu hides the bubble so it never covers the menu.
function onMenuButton(event) {
    if (!event.target.closest?.('#options_button')) return;
    const menu = document.getElementById('options');
    if (menu && getComputedStyle(menu).display === 'none') closeBubble();
}

function watchMenu() {
    if (observer) return;
    document.addEventListener('click', onMenuButton, true);
    // Put the menu items back if the host rebuilds its options menu.
    observer = new MutationObserver(() => {
        if (!MENU_IDS.every((id) => document.getElementById(id))) mountMenu();
    });
    observer.observe(document.getElementById('options') ?? document.body, { childList: true, subtree: true });
}

export function initStorySummary() {
    clearInterval(mountTimer);
    if (mountMenu()) {
        watchMenu();
        return;
    }
    let tries = 0;
    mountTimer = setInterval(() => {
        const done = mountMenu();
        if (done) watchMenu();
        if (done || ++tries > 60) clearInterval(mountTimer);
    }, 500);
}

export function cleanupStorySummary() {
    clearInterval(mountTimer);
    observer?.disconnect();
    observer = null;
    document.removeEventListener('click', onMenuButton, true);
    closeBubble();
    MENU_IDS.forEach((id) => document.getElementById(id)?.remove());
    if (blankListener) {
        const context = ctx();
        const types = context?.eventTypes ?? context?.event_types;
        try { context?.eventSource?.removeListener?.(types?.CHAT_CREATED, blankListener); } catch { /* host gone */ }
        blankListener = null;
    }
    pendingBlankUntil = 0;
}
