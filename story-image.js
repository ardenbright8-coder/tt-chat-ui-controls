// 自动配图：主模型（如 Gemini）每写完一条正文，交给另一个连接配置（如 DeepSeek）
// 读这段正文写英文画图标签，再走酒馆自带的图像生成（/sd），把图贴回这条消息末尾。
// 主模型完全不知道出图这件事，不用在预设里塞生图指令；也不切换当前连接。

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-autoimg-settings';
const ctx = () => globalThis.SillyTavern?.getContext?.();

const DEFAULT_PROMPT = `You write ONE image prompt for a local anime-style image model (Anima / Danbooru tags).
Read the story passage and draw its single most important visual moment.
Output ONLY the tags: one line, English, lowercase, comma-separated. No sentences, no Chinese, no explanation, no quotes, no prefix like "prompt:".
Tag order:
1. rating: safe / sensitive / nsfw / explicit (explicit whenever genitals or sex are visible). If the passage shows or clearly implies intercourse, rate explicit and add sex, vaginal, penis and the position, even if the text is poetic or indirect
2. who: 1girl, 1boy, or 1girl 2boys etc., plus mature female / mature male
3. her look: hair color and style, eye color, body (large breasts, curvy, wide hips)
4. clothing right now: e.g. red hanfu, open clothes, clothes pulled down, completely nude
5. expression, at least two: seductive smile, blush, half-closed eyes, looking at viewer
6. pose and action with exact terms: missionary, cowgirl position, doggystyle, fellatio, vaginal, penis, spread legs
7. place, time, light: palace bedroom, night, candlelight, paper lanterns
Use 25-40 tags.
Example: explicit, 1girl, 1boy, hetero, mature female, black hair, hair bun, golden hairpin, brown eyes, large breasts, curvy, red hanfu, open clothes, seductive smile, blush, half-closed eyes, looking at viewer, missionary, on back, spread legs, vaginal, penis, palace bedroom, red silk bedding, night, candlelight`;

// 这些类型的消息不配图：续写会把同一条拉长、扮演是替用户写、quiet/extension 是后台或扩展自己发的
const SKIP_TYPES = new Set(['continue', 'impersonate', 'quiet', 'extension', 'first_message']);

let receivedListener = null;
let profileListener = null;
const PROFILE_EVENTS = ['CONNECTION_PROFILE_CREATED', 'CONNECTION_PROFILE_UPDATED', 'CONNECTION_PROFILE_DELETED'];
let mountTimer = null;
let queue = Promise.resolve();

function settings() {
    const context = ctx();
    const all = context?.extensionSettings;
    if (!all) return { autoImageEnabled: false, autoImageProfile: '', autoImagePrompt: DEFAULT_PROMPT };
    all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    const s = all[EXTENSION_KEY];
    if (typeof s.autoImageEnabled !== 'boolean') s.autoImageEnabled = false;
    if (typeof s.autoImageProfile !== 'string') s.autoImageProfile = '';
    if (typeof s.autoImagePrompt !== 'string' || !s.autoImagePrompt.trim()) s.autoImagePrompt = DEFAULT_PROMPT;
    return s;
}

function save() {
    ctx()?.saveSettingsDebounced?.();
}

function profiles() {
    const list = ctx()?.extensionSettings?.connectionManager?.profiles;
    return Array.isArray(list) ? list.filter((p) => p?.id).map((p) => ({ id: p.id, name: p.name || p.id })) : [];
}

// 正文里常夹着状态栏 HTML、变量更新块、代码块，DeepSeek 只需要剧情本身
function plainText(text) {
    return String(text || '')
        .replace(/<(UpdateVariable|StatusPlaceHolderImpl|status|thinking|think)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// 模型偶尔会多嘴、加引号、写中文：只留一行英文标签
function cleanTags(reply) {
    let text = String(reply || '').replace(/<think>[\s\S]*?<\/think>/gi, ' ');
    text = text.replace(/```[a-z]*|```/gi, ' ');
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && l.includes(','));
    text = lines.length ? lines.sort((a, b) => b.length - a.length)[0] : text;
    return text
        .replace(/^(prompt|tags)\s*[:：]\s*/i, '')
        .replace(/[^\x20-\x7E]+/g, ' ')
        .replace(/["`|{}<>]/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/(,\s*)+/g, ', ')
        .replace(/\s+/g, ' ')
        .replace(/^[,\s]+|[,\s]+$/g, '')
        .slice(0, 900);
}

async function writeTags(context, message, id) {
    const s = settings();
    const service = context.ConnectionManagerRequestService;
    if (!service?.sendRequest) throw new Error('这个版本的酒馆没有「连接配置」请求接口');
    if (!s.autoImageProfile || !profiles().some((p) => p.id === s.autoImageProfile)) {
        throw new Error('先在「自动配图」里选一个写画图词的连接配置');
    }
    const prevUser = [...context.chat.slice(0, id)].reverse().find((m) => m?.is_user && !m.is_system);
    const char = context.characters?.[context.characterId];
    const parts = [];
    if (char?.description) parts.push(`Character ${message.name} (appearance reference):\n${plainText(char.description).slice(0, 1200)}`);
    if (prevUser?.mes) parts.push(`User's last action:\n${plainText(prevUser.mes).slice(-800)}`);
    parts.push(`Story passage to illustrate:\n${plainText(message.mes).slice(-4000)}`);
    const result = await service.sendRequest(
        s.autoImageProfile,
        [{ role: 'system', content: s.autoImagePrompt }, { role: 'user', content: parts.join('\n\n') }],
        600,
        { includePreset: false },
    );
    const tags = cleanTags(typeof result === 'string' ? result : result?.content);
    if (tags.split(',').length < 5) throw new Error('写画图词的模型没给出像样的标签：' + String(result?.content ?? result).slice(0, 80));
    return tags;
}

async function drawAndAttach(id, type) {
    const s = settings();
    if (!s.autoImageEnabled || SKIP_TYPES.has(type)) return;
    const context = ctx();
    const message = context?.chat?.[id];
    if (!message || message.is_user || message.is_system || !plainText(message.mes)) return;
    const sd = context.SlashCommandParser?.commands?.sd;
    if (!sd?.callback) { globalThis.toastr?.warning?.('没找到酒馆自带的图像生成（/sd），先在扩展里打开「图像生成」', '自动配图'); return; }

    const tags = await writeTags(context, message, id);
    const url = await sd.callback({ quiet: 'true' }, tags);
    if (typeof url !== 'string' || !url.trim()) return; // 生图失败时 /sd 自己会弹提示

    // 画图要一分钟，期间这条可能被删了或换了：对不上就不贴
    if (context.chat[id] !== message) return;
    message.extra = message.extra || {};
    if (!Array.isArray(message.extra.media)) message.extra.media = [];
    message.extra.media.push({ url, type: 'image', title: tags, source: 'generated' });
    message.extra.media_index = message.extra.media.length - 1;
    message.extra.inline_image = true; // false 会把正文藏起来只显示图
    if (!message.extra.media_display) message.extra.media_display = 'gallery';
    const el = globalThis.jQuery?.(`#chat .mes[mesid="${id}"]`);
    if (el?.length) context.appendMediaToMessage(message, el);
    await context.saveChat();
}

function onReceived(id, type) {
    if (!settings().autoImageEnabled) return;
    // 排队：上一张还没画完又来一条，就等上一张画完再画，免得两张同时挤显卡
    queue = queue.then(() => drawAndAttach(Number(id), type)).catch((error) => {
        console.warn('[酒馆拓展] 自动配图失败', error);
        globalThis.toastr?.error?.(String(error?.message || error), '自动配图');
    });
}

function settingsHtml() {
    return `
<div id="${SETTINGS_ID}" class="tt-autoimg">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>自动配图</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <small>主模型每写完一条正文，交给下面选的连接配置写英文画图词，再用「图像生成」画好贴到这条正文末尾。主模型和当前连接都不受影响。</small>
      <label class="checkbox_label"><input type="checkbox" id="tt-autoimg-on"> <span>每条正文自动配一张图</span></label>
      <label for="tt-autoimg-profile">写画图词用哪个连接配置</label>
      <select id="tt-autoimg-profile" class="text_pole"></select>
      <small id="tt-autoimg-hint"></small>
      <label for="tt-autoimg-prompt">给它的写词说明（英文，可改）</label>
      <textarea id="tt-autoimg-prompt" class="text_pole" rows="8"></textarea>
      <div class="flex-container">
        <div id="tt-autoimg-reset" class="menu_button">恢复默认说明</div>
        <div id="tt-autoimg-now" class="menu_button">给最后一条正文配一张</div>
      </div>
    </div>
  </div>
</div>`;
}

function fillProfiles() {
    const select = document.getElementById('tt-autoimg-profile');
    if (!select) return;
    const s = settings();
    const list = profiles();
    // 列表没变就不动它：手机上一按下就重写选项，原生下拉可能弹不出来
    const sig = list.map((p) => p.id + '=>' + p.name).join(' ;; ');
    if (select.dataset.sig === sig && select.options.length) return;
    select.dataset.sig = sig;
    select.innerHTML = '<option value="">（未选）</option>' + list.map((p) => `<option value="${p.id}">${p.name.replace(/[<&>"]/g, '')}</option>`).join('');
    select.value = list.some((p) => p.id === s.autoImageProfile) ? s.autoImageProfile : '';
    const hint = document.getElementById('tt-autoimg-hint');
    if (hint) hint.textContent = list.length ? '' : '还没有连接配置：先在「API 连接」里连上 DeepSeek，在「连接配置」里存一个';
}

function mount() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    if (document.getElementById(SETTINGS_ID)) return true;
    host.insertAdjacentHTML('beforeend', settingsHtml());
    const s = settings();
    const on = document.getElementById('tt-autoimg-on');
    const select = document.getElementById('tt-autoimg-profile');
    const prompt = document.getElementById('tt-autoimg-prompt');
    on.checked = s.autoImageEnabled;
    prompt.value = s.autoImagePrompt;
    fillProfiles();
    on.addEventListener('change', () => { settings().autoImageEnabled = on.checked; save(); });
    select.addEventListener('change', () => { settings().autoImageProfile = select.value; save(); });
    // 手机上点下拉框时 focus 不一定先触发，按下就刷一次；连接配置增删改也跟着刷
    ['focus', 'pointerdown', 'touchstart', 'mousedown'].forEach((name) => select.addEventListener(name, fillProfiles, { passive: true }));
    document.querySelector(`#${SETTINGS_ID} .inline-drawer-toggle`)?.addEventListener('click', fillProfiles);
    prompt.addEventListener('change', () => { settings().autoImagePrompt = prompt.value.trim() || DEFAULT_PROMPT; save(); });
    document.getElementById('tt-autoimg-reset').addEventListener('click', () => {
        prompt.value = DEFAULT_PROMPT; settings().autoImagePrompt = DEFAULT_PROMPT; save();
    });
    document.getElementById('tt-autoimg-now').addEventListener('click', () => {
        const chat = ctx()?.chat || [];
        let id = chat.length - 1;
        while (id >= 0 && (chat[id]?.is_user || chat[id]?.is_system)) id--;
        if (id < 0) { globalThis.toastr?.info?.('这个聊天里还没有正文', '自动配图'); return; }
        globalThis.toastr?.info?.('开始配图，大约一分钟', '自动配图');
        queue = queue.then(() => drawAndAttachForce(id)).catch((error) => {
            console.warn('[酒馆拓展] 手动配图失败', error);
            globalThis.toastr?.error?.(String(error?.message || error), '自动配图');
        });
    });
    return true;
}

// 手动按钮：不看开关，直接给这条配
async function drawAndAttachForce(id) {
    const s = settings();
    const was = s.autoImageEnabled;
    s.autoImageEnabled = true;
    try { await drawAndAttach(id, 'manual'); } finally { s.autoImageEnabled = was; }
}

export function initStoryImage() {
    const context = ctx();
    const type = (context?.eventTypes ?? context?.event_types)?.MESSAGE_RECEIVED;
    if (!receivedListener && context?.eventSource?.on && type) {
        receivedListener = (id, kind) => onReceived(id, kind);
        context.eventSource.on(type, receivedListener);
    }
    const types = context?.eventTypes ?? context?.event_types;
    if (!profileListener && context?.eventSource?.on && types) {
        profileListener = () => fillProfiles();
        PROFILE_EVENTS.forEach((name) => types[name] && context.eventSource.on(types[name], profileListener));
    }
    clearInterval(mountTimer);
    if (mount()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (mount() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupStoryImage() {
    const context = ctx();
    const type = (context?.eventTypes ?? context?.event_types)?.MESSAGE_RECEIVED;
    if (receivedListener) {
        try { context?.eventSource?.removeListener?.(type, receivedListener); } catch { /* ignore */ }
        receivedListener = null;
    }
    const types = context?.eventTypes ?? context?.event_types;
    if (profileListener && types) {
        PROFILE_EVENTS.forEach((name) => { try { context?.eventSource?.removeListener?.(types[name], profileListener); } catch { /* ignore */ } });
        profileListener = null;
    }
    clearInterval(mountTimer);
    document.getElementById(SETTINGS_ID)?.remove();
}

// 给电脑上的自测脚本用
export const __test = { cleanTags, plainText, DEFAULT_PROMPT };
