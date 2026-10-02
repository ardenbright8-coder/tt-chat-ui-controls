// 自动配图：主模型（如 Gemini）每写完一条正文，交给另一个连接配置（如 DeepSeek）
// 读这段正文规划一张图，再走酒馆自带的图像生成（/sd），把图贴回这条消息末尾。
// 主模型完全不知道出图这件事，不用在预设里塞生图指令；也不切换当前连接。
//
// 长相档案：每段聊天记一本「谁长什么样」（存在聊天自己的 metadata 里，换故事就是另一本）。
// 写词模型只负责「这一幕有谁、穿什么、在干嘛」，每个人的长相由这里原样抄进画图词，所以同一个人每张图都一个样。
// 新角色第一次出场先出一张定妆照；不满意在设置里用中文说怎么改，改完再出一张。

const EXTENSION_KEY = 'chat-text-color';
const SETTINGS_ID = 'tt-autoimg-settings';
const CAST_KEY = 'tt_autoimg_cast';
const PROMPT_VERSION = 4;
const ctx = () => globalThis.SillyTavern?.getContext?.();

// 画面要亮：模型和写词都容易往「夜里、烛光、昏暗」走，出来又灰又压抑
const BRIGHT_TAGS = 'bright lighting, well-lit, warm colors, vivid colors';

// 写词说明 = 公共部分（回 JSON 的格式、跳过规则、长相档案规则）+ 各套装自己的「画面怎么写」。
// 公共部分每套都一样，保证长相照档案画、强迫场面跳过；套装只换画面风格。
const BASE_RULES = `You plan ONE illustration of a story passage for a local anime-style image model that reads Danbooru tags.
Reply with ONLY one JSON object, no markdown, no explanation:
{"skip": false, "rating": "", "people": [{"name": "", "sex": "female"}], "new_looks": {}, "scene": ""}

Rules:
- skip: true if nothing visual is worth drawing, or if the passage depicts sexual activity that is forced, coerced or non-consensual. Then leave the other fields empty.
- rating: safe / sensitive / nsfw / explicit. Use explicit whenever genitals or sex are visible; if the passage shows or clearly implies consensual intercourse, use explicit even when the wording is poetic.
- people: everyone visible, left to right. name = the name as written in the story (keep Chinese names as they are), or a short role such as "the man". sex = female or male. The user's own character ("you" / 你 in the story) is a man: when he is in the picture (being kissed, touched, held, in bed with her), list him as {"name": "the man", "sex": "male"}; leave him out only for pov shots.
- new_looks: ONLY for female characters that are NOT in the known cast list. For each, give a fixed appearance as tags: mature female, beautiful detailed face, face shape, eye shape and color, hair color, hair length and style, body (unless the story says otherwise: large breasts, narrow waist, wide hips, curvy), skin, one distinctive mark. No clothing, no expression. Never redescribe the known cast.
- scene never contains hair, eye, face or body-shape tags; those come from the cast list.
- Always name the shot (portrait, upper body, cowboy shot, full body, close-up) and the angle. Earlier tags weigh more, so put the most important visual first.
- Mood and light: bright, warm and well-lit by default (soft daylight, sunlight, warm lantern glow, bright room). Only when the passage itself is clearly dark (danger, grief, battle, horror) may the mood turn darker, and the picture must still stay clear and readable. Never gothic, never gloomy for no reason.
`;

const STYLE_RULES = {
    default: `
Style of this set: sensual Chinese-fantasy romance.
- scene: English Danbooru tags, lowercase, comma-separated, 20-35 tags, in this order: what each person is wearing right now; expression, at least two; pose and action with exact terms (missionary, cowgirl position, doggystyle, fellatio, vaginal, penis, spread legs); shot and angle; place; time and light.
- Sensual by default: this is an adult romance story. Even in everyday, non-sexual moments make her alluring and use at least sensitive: keep what the story says she wears, but show it in a tempting way (cleavage, bare shoulders, off shoulder, collarbone, thighs, sheer or loosened fabric, wet clothes, clothes clinging to body, garter, side slit), give her a seductive or shy-flirty look (seductive smile, bedroom eyes, blush, biting lip, looking at viewer) and an attractive pose (leaning forward, arched back, crossed legs, hand on own chest, hair over shoulder).`,
    bold: `
Style of this set: bold and revealing.
- scene: English Danbooru tags, lowercase, comma-separated, 25-40 tags, in this order: clothing state; expression, at least two; pose and action with exact terms; shot and angle; place; time and light.
- Push exposure one level above what the text strictly needs. Private or flirtatious moments use at least nsfw: clothes half off, open robe, no bra, see-through, nipples visible through fabric, panties, bare thighs, pulled-up skirt. Any intimate contact uses explicit with precise anatomy (nipples, pussy, penis, vaginal, cum where the story implies it) and body reactions (sweat, blush, heavy breathing, trembling, toes curling, open mouth, tongue out, lustful eyes).
- Prefer poses that show her body: arched back, spread legs, on back, on all fours, straddling, from below, from behind with looking back.`,
    elegant: `
Style of this set: elegant and suggestive, like a game key visual.
- scene: English Danbooru tags, lowercase, comma-separated, 20-30 tags, in this order: clothing; expression; pose; shot and angle; scenery details; light and atmosphere.
- Keep it mostly sensitive: beauty, longing and tension rather than nudity. Intimate moments are shown by suggestion (embrace, kiss, hand on cheek, covered by silk sheets, back view, bare shoulders, fallen hairpin, loosened collar). Use explicit only if the passage is unmistakably a sex scene, and even then frame it tastefully (from side, from behind, partially covered).
- Spend tags on composition and atmosphere: depth of field, floating petals, light rays, reflections, flowing sleeves, wind, framed by doorway or curtains, rich background.`,
    sentence: `
Style of this set: natural-language description (the image model understands full English sentences, and sentences keep several people from mixing up).
- scene: 2-4 English sentences that describe exactly what the camera sees: who stands or lies where, what each one wears now, their expressions, what their hands and bodies are doing, then the place and light. After the sentences add 8-15 Danbooru tags for shot, angle and key details.
- Refer to people by position and sex ("the woman on the left", "the man behind her"), never by Chinese name inside the sentences. If a man is present, say clearly that he is a man.
- Describe the light as bright and warm in the sentences (soft lantern glow filling the room, warm sunlight), unless the passage is clearly dark.
- Same sensual default as an adult romance: tempting clothing, seductive looks, attractive poses; explicit anatomy words when the passage is a consensual sex scene.`,
    camera: `
Style of this set: cinematic camera work.
- scene: English Danbooru tags, lowercase, comma-separated, 20-35 tags, starting with a strong shot choice, then clothing, expression, pose and action, place, light.
- Pick the most dramatic framing for the moment and say it clearly: close-up on face or hands, extreme close-up, pov (the viewer is the user's character), from below, from above, dutch angle, foreshortening, over the shoulder, reflection in mirror, depth of field with blurred foreground. Vary it between pictures; avoid flat front-facing full body shots.
- Same sensual default as an adult romance; in sex scenes prefer pov or close framing that shows faces and contact.`,
};

const PRESETS = [
    { id: 'default', name: '① 默认·国风情欲' },
    { id: 'bold', name: '② 更放得开' },
    { id: 'elegant', name: '③ 唯美含蓄' },
    { id: 'sentence', name: '④ 整句描述（多人不串）' },
    { id: 'camera', name: '⑤ 镜头感' },
].map((p) => ({ ...p, text: BASE_RULES + STYLE_RULES[p.id] }));

const DEFAULT_PROMPT = PRESETS[0].text;

const REVISE_PROMPT = `You maintain one character's fixed appearance for an anime image model that reads Danbooru tags.
You get her current appearance tags and the user's request in Chinese. Change ONLY what the request asks for; copy every other tag over unchanged (hairstyle, body, skin, marks stay as they are unless the request mentions them).
Output ONLY the revised appearance: English tags, lowercase, comma-separated, covering mature female, face shape, eye shape and color, hair color, hair length and style, body, skin, one distinctive mark. No clothing, no expression, no explanation.`;

// 这些类型的消息不配图：续写会把同一条拉长、扮演是替用户写、quiet/extension 是后台或扩展自己发的
const SKIP_TYPES = new Set(['continue', 'impersonate', 'quiet', 'extension', 'first_message']);
const PROFILE_EVENTS = ['CONNECTION_PROFILE_CREATED', 'CONNECTION_PROFILE_UPDATED', 'CONNECTION_PROFILE_DELETED', 'CONNECTION_PROFILE_LOADED', 'MODEL_TARGET_LOADED'];

let receivedListener = null;
let profileListener = null;
let chatListener = null;
let mountTimer = null;
let queue = Promise.resolve();

const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, '自动配图');
const esc = (v) => String(v ?? '').replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));

function settings() {
    const context = ctx();
    const all = context?.extensionSettings;
    if (!all) return { autoImageEnabled: false, autoImageProfile: '', autoImagePrompt: DEFAULT_PROMPT, autoImageQuietToast: true, autoImagePortrait: true, autoImageCleanView: true };
    all[EXTENSION_KEY] = all[EXTENSION_KEY] || {};
    const s = all[EXTENSION_KEY];
    if (typeof s.autoImageEnabled !== 'boolean') s.autoImageEnabled = false;
    if (typeof s.autoImageProfile !== 'string') s.autoImageProfile = '';
    // 写词说明换了格式（v2 起要回 JSON），旧版存下的说明不能再用，换成新的默认
    if (!Array.isArray(s.autoImageCustomPresets)) s.autoImageCustomPresets = [];
    if (typeof s.autoImagePresetId !== 'string' || !presetById(s.autoImagePresetId, s)) s.autoImagePresetId = 'default';
    if (s.autoImagePromptVersion !== PROMPT_VERSION || typeof s.autoImagePrompt !== 'string' || !s.autoImagePrompt.trim()) {
        s.autoImagePrompt = presetById(s.autoImagePresetId, s).text;
        s.autoImagePromptVersion = PROMPT_VERSION;
    }
    if (typeof s.autoImageQuietToast !== 'boolean') s.autoImageQuietToast = true;
    if (typeof s.autoImagePortrait !== 'boolean') s.autoImagePortrait = true;
    if (typeof s.autoImageCleanView !== 'boolean') s.autoImageCleanView = true;
    return s;
}

// 内置套装 + 自己另存的套装
function presetById(id, s) {
    return PRESETS.find((p) => p.id === id) || (s?.autoImageCustomPresets || []).find((p) => p.id === id) || null;
}

function save() {
    ctx()?.saveSettingsDebounced?.();
}

// 生图时酒馆会挂一条「正在生成图像…」的常驻提示，挡着看正文；开着这项就把它藏起来（出错的红色提示不受影响）
const QUIET_STYLE_ID = 'tt-autoimg-quiet-style';
function applyQuietToast() {
    document.body?.classList.toggle('tt-autoimg-quiet', !!settings().autoImageQuietToast);
    document.body?.classList.toggle('tt-autoimg-clean', !!settings().autoImageCleanView);
    if (document.getElementById(QUIET_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = QUIET_STYLE_ID;
    style.textContent = 'body.tt-autoimg-quiet #toast-container > .toast:has(.action-loader-toast[data-slug="sd-image-generation"]) { display: none !important; }'
        + ' #tt-autoimg-cast .tt-cast-row { border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; padding: 6px; margin: 6px 0; }'
        + ' #tt-autoimg-cast .tt-cast-head { display: flex; gap: 8px; align-items: center; }'
        + ' #tt-autoimg-cast .tt-cast-head img { width: 64px; height: 88px; object-fit: cover; border-radius: 6px; }'
        + ' #tt-autoimg-cast textarea, #tt-autoimg-cast input { width: 100%; margin-top: 4px; }'
        // 干净看图：图片铺满气泡宽度，点图不放大，原来那排放大 / 说明 / 删除按钮藏起来，只留右上角两个小按钮
        + ' body.tt-autoimg-clean .mes .mes_media_wrapper { padding-right: 0; }'
        + ' body.tt-autoimg-clean .mes .mes_img_container { width: 100%; }'
        + ' body.tt-autoimg-clean .mes .mes_img { width: 100%; max-height: 80vh; object-fit: contain; cursor: default; }'
        + ' body.tt-autoimg-clean .mes .mes_img_controls { display: none !important; }'
        + ' .tt-img-tools { display: none; }'
        + ' body.tt-autoimg-clean .tt-img-tools { display: flex; position: absolute; top: 6px; right: 6px; gap: 6px; z-index: 3; }'
        + ' .tt-img-tools > div { width: 30px; height: 30px; border-radius: 50%; background: rgba(0,0,0,.35); color: #fff; opacity: .65;'
        + ' display: flex; align-items: center; justify-content: center; font-size: 13px; cursor: pointer; }';
    document.head.append(style);
}

// ---------------------------------------------------------------- 连接配置

// 可选的两类：酒馆的「连接配置文件」，和 TauriTavern 自己的「模型」（只存接口 + 模型 + 钥匙的轻量条目）。
// 选项值带前缀区分：t: 开头是「模型」，其余是连接配置文件（旧版存的就是裸 id）
function profiles() {
    const cm = ctx()?.extensionSettings?.connectionManager;
    const list = [];
    for (const p of Array.isArray(cm?.profiles) ? cm.profiles : []) {
        if (p?.id) list.push({ id: p.id, name: p.name || p.id, group: '连接配置文件' });
    }
    for (const t of Array.isArray(cm?.modelTargets) ? cm.modelTargets : []) {
        if (t?.id) list.push({ id: 't:' + t.id, name: t.name || t.id, group: '模型' });
    }
    return list;
}

function findTarget(value) {
    if (!String(value).startsWith('t:')) return null;
    const id = String(value).slice(2);
    return ctx()?.extensionSettings?.connectionManager?.modelTargets?.find((t) => t.id === id) || null;
}

// 「模型」条目没有现成的发请求接口，照连接配置文件那套字段自己拼一份；不切换当前连接
async function requestWithTarget(context, target, messages, maxTokens) {
    const map = context.CONNECT_API_MAP?.[target.api];
    if (!map || map.selected !== 'openai' || !map.source) throw new Error('这个「模型」不是聊天补全类型，换一个');
    const url = target['api-url'];
    return await context.ChatCompletionService.processRequest({
        stream: false,
        messages,
        max_tokens: maxTokens,
        model: target.model,
        chat_completion_source: map.source,
        custom_api_format: target['custom-api-format'] || (target.api === 'custom' ? 'openai_compat' : undefined),
        opencode_api_format: target['custom-api-format'],
        opencode_endpoint: url,
        secret_id: target.secretRef?.id,
        custom_url: url,
        vertexai_region: url,
        zai_endpoint: url,
        siliconflow_endpoint: url,
        minimax_endpoint: url,
        moonshot_endpoint: url,
        pollinations_endpoint: url,
    }, { presetName: undefined }, true, null);
}

// maxTokens 给得宽：会先「想」的模型（如 deepseek-v4.1-flash）想的那段也算回复长度，给小了只剩思考、答案是空的
async function askModel(context, messages, maxTokens) {
    const s = settings();
    if (!s.autoImageProfile || !profiles().some((p) => p.id === s.autoImageProfile)) {
        throw new Error('先在「自动配图」里选一个写画图词的连接配置');
    }
    const target = findTarget(s.autoImageProfile);
    if (!target && !context.ConnectionManagerRequestService?.sendRequest) throw new Error('这个版本的酒馆没有「连接配置」请求接口');
    const result = target
        ? await requestWithTarget(context, target, messages, maxTokens)
        : await context.ConnectionManagerRequestService.sendRequest(s.autoImageProfile, messages, maxTokens, { includePreset: false });
    return String(typeof result === 'string' ? result : result?.content ?? '');
}

// ---------------------------------------------------------------- 文本处理

// 正文里常夹着状态栏 HTML、变量更新块、代码块，写词模型只需要剧情本身
function plainText(text) {
    return String(text || '')
        .replace(/<(UpdateVariable|StatusPlaceHolderImpl|status|thinking|think)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// 画图词只留英文标签：去掉中文、引号、管道符这些会搅乱生图或斜杠命令的字符
function cleanTags(text) {
    return String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
        .replace(/[^\x20-\x7E]+/g, ' ')
        .replace(/["`|{}<>]/g, ' ')
        .replace(/\s*[,;]\s*/g, ', ')
        .replace(/(,\s*)+/g, ', ')
        .replace(/\s+/g, ' ')
        .replace(/^[,\s]+|[,\s]+$/g, '');
}

// 写词模型的回复里找出那个 JSON；找不到多半是它拒绝了或者胡说，这时宁可不画
function parsePlan(reply) {
    const text = String(reply || '').replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/```(json)?/gi, ' ');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        const plan = JSON.parse(text.slice(start, end + 1));
        return plan && typeof plan === 'object' ? plan : null;
    } catch {
        return null;
    }
}

function countTag(n, word) {
    return n === 1 ? `1${word}` : `${n}${word}s`;
}

// 位置词：两个人「左 / 右」，三个人「左 / 中 / 右」
function placeWord(i, n) {
    if (n === 2) return ['on the left', 'on the right'][i];
    if (n === 3) return ['on the left', 'in the middle', 'on the right'][i];
    return `number ${i + 1}`;
}

// 规划 + 长相档案 → 最终画图词。长相原样从档案抄，不让写词模型改
function buildPrompt(plan, cast) {
    const people = Array.isArray(plan.people) ? plan.people.filter((p) => p && p.name) : [];
    const girls = people.filter((p) => String(p.sex).toLowerCase() !== 'male');
    const boys = people.filter((p) => String(p.sex).toLowerCase() === 'male');
    const parts = [cleanTags(plan.rating) || 'sensitive'];
    if (girls.length) parts.push(countTag(girls.length, 'girl'));
    if (boys.length) parts.push(countTag(boys.length, 'boy'));
    if (girls.length && boys.length) parts.push('hetero');
    if (!girls.length && !boys.length) parts.push('no humans');
    const looks = girls.map((g) => cleanTags(cast[g.name]?.look || plan.new_looks?.[g.name] || 'mature female'));
    if (looks.length === 1) {
        parts.push(looks[0]);
    } else if (looks.length > 1) {
        // 多个女角色：用整句把长相绑在位置上，减少 A 的发色跑到 B 头上
        parts.push(looks.map((l, i) => `the woman ${placeWord(i, looks.length)} has ${l.replace(/,\s*/g, ' and ')}`).join(', '));
    }
    if (boys.length) parts.push('mature male');
    parts.push(cleanTags(plan.scene), BRIGHT_TAGS);
    return cleanTags(parts.filter(Boolean).join(', ')).slice(0, 1400);
}

function portraitPrompt(look) {
    return cleanTags(`safe, 1girl, solo, ${look}, upper body, portrait, looking at viewer, gentle smile, simple light background, ${BRIGHT_TAGS}`);
}

// ---------------------------------------------------------------- 长相档案

function cast() {
    const meta = ctx()?.chatMetadata;
    if (!meta) return {};
    if (!meta[CAST_KEY] || typeof meta[CAST_KEY] !== 'object') meta[CAST_KEY] = {};
    return meta[CAST_KEY];
}

async function saveCast() {
    const context = ctx();
    if (context?.saveMetadataDebounced) context.saveMetadataDebounced();
    else await context?.saveMetadata?.();
    renderCast();
}

// ---------------------------------------------------------------- 生图

async function draw(context, prompt) {
    const sd = context.SlashCommandParser?.commands?.sd;
    if (!sd?.callback) throw new Error('没找到酒馆自带的图像生成（/sd），先在扩展里打开「图像生成」');
    const url = await sd.callback({ quiet: 'true' }, prompt);
    return typeof url === 'string' && url.trim() ? url : '';
}

function attach(context, id, message, url, title) {
    // 画图要一分钟，期间这条可能被删了或换了：对不上就不贴
    if (context.chat[id] !== message) return false;
    message.extra = message.extra || {};
    if (!Array.isArray(message.extra.media)) message.extra.media = [];
    message.extra.media.push({ url, type: 'image', title, source: 'generated' });
    message.extra.media_index = message.extra.media.length - 1;
    message.extra.inline_image = true; // false 会把正文藏起来只显示图
    message.extra.media_display = 'list'; // 定妆照和配图上下排开，都直接看得到，不用左右滑
    const el = globalThis.jQuery?.(`#chat .mes[mesid="${id}"]`);
    if (el?.length) context.appendMediaToMessage(message, el);
    return true;
}

async function drawAndAttach(id, type) {
    const s = settings();
    if (!s.autoImageEnabled || SKIP_TYPES.has(type)) return;
    const context = ctx();
    const message = context?.chat?.[id];
    if (!message || message.is_user || message.is_system || !plainText(message.mes)) return;

    const known = cast();
    const knownLines = Object.entries(known).map(([name, c]) => `- ${name}: ${c.look}`);
    const prevUser = [...context.chat.slice(0, id)].reverse().find((m) => m?.is_user && !m.is_system);
    const char = context.characters?.[context.characterId];
    const parts = [`Known cast (fixed looks, do not redescribe):\n${knownLines.length ? knownLines.join('\n') : '(none yet)'}`];
    if (char?.description) parts.push(`Character card of ${message.name} (use it when inventing her look):\n${plainText(char.description).slice(0, 1200)}`);
    if (prevUser?.mes) parts.push(`User's last action:\n${plainText(prevUser.mes).slice(-800)}`);
    parts.push(`Story passage to illustrate:\n${plainText(message.mes).slice(-4000)}`);

    const reply = await askModel(context, [{ role: 'system', content: s.autoImagePrompt }, { role: 'user', content: parts.join('\n\n') }], 4000);
    const plan = parsePlan(reply);
    if (!plan) { toast('warning', '这段没配图：写词模型没按格式回答（可能是不肯写）'); return; }
    if (plan.skip) { toast('info', '这段跳过，不配图'); return; }

    // 新角色先进档案、先出定妆照
    const fresh = Object.entries(plan.new_looks || {}).filter(([name, look]) => name && cleanTags(look) && !known[name]);
    for (const [name, look] of fresh) {
        known[name] = { look: cleanTags(look), portrait: '' };
        if (s.autoImagePortrait) {
            const url = await draw(context, portraitPrompt(known[name].look));
            if (url) {
                known[name].portrait = url;
                attach(context, id, message, url, `定妆照：${name}`);
            }
        }
        toast('success', `新角色「${name}」的长相定下了。不满意去「扩展 → 自动配图 → 角色长相」里说怎么改`);
    }
    if (fresh.length) await saveCast();

    const url = await draw(context, buildPrompt(plan, known));
    if (url) attach(context, id, message, url, buildPrompt(plan, known));
    await context.saveChat();
}

function enqueue(job, label) {
    // 排队：上一张还没画完又来一条，就等上一张画完再画，免得两张同时挤显卡
    queue = queue.then(job).catch((error) => {
        console.warn(`[酒馆拓展] ${label}失败`, error);
        toast('error', String(error?.message || error));
    });
}

function onReceived(id, type) {
    if (!settings().autoImageEnabled) return;
    enqueue(() => drawAndAttach(Number(id), type), '自动配图');
}

// 手动按钮：不看开关，直接给这条配
async function drawAndAttachForce(id) {
    const s = settings();
    const was = s.autoImageEnabled;
    s.autoImageEnabled = true;
    try { await drawAndAttach(id, 'manual'); } finally { s.autoImageEnabled = was; }
}

async function reviseLook(name, request) {
    const context = ctx();
    const entry = cast()[name];
    if (!entry) return;
    const reply = await askModel(context, [
        { role: 'system', content: REVISE_PROMPT },
        { role: 'user', content: `Current appearance: ${entry.look}\nUser request: ${request}` },
    ], 3000);
    const look = cleanTags(reply.split('\n').filter((l) => l.includes(',')).sort((a, b) => b.length - a.length)[0] || reply);
    if (look.split(',').length < 4) throw new Error('改长相没成功：' + reply.slice(0, 80));
    entry.look = look;
    await saveCast();
    const url = await draw(context, portraitPrompt(look));
    if (url) {
        entry.portrait = url;
        await saveCast();
        toast('success', `「${name}」改好了，设置里那一行有新的定妆照`);
    }
}

// ---------------------------------------------------------------- 聊天里的图：只留「复制」「改词重画」两个小按钮

let chatObserver = null;

function addImageTools(root) {
    root.querySelectorAll?.('.mes_img_container').forEach((box) => {
        if (box.querySelector(':scope > .tt-img-tools')) return;
        box.insertAdjacentHTML('beforeend', '<div class="tt-img-tools"><div class="tt-img-copy fa-solid fa-copy" title="复制图片"></div><div class="tt-img-redo fa-solid fa-pen" title="改画图词，重画这张"></div></div>');
    });
}

function mediaOf(el) {
    const mes = el.closest('.mes');
    const box = el.closest('.mes_img_container');
    const id = Number(mes?.getAttribute('mesid'));
    const index = Number(box?.getAttribute('data-index'));
    const message = ctx()?.chat?.[id];
    const item = message?.extra?.media?.[index];
    return { id, index, message, item, img: box?.querySelector('.mes_img') };
}

async function toPngBlob(src) {
    const blob = await (await fetch(src)).blob();
    if (blob.type === 'image/png') return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function copyImage(src) {
    const png = await toPngBlob(src);
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        toast('success', '图片已复制');
        return;
    } catch { /* 手机上不一定能往剪贴板放图片，下面改成保存 */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(png);
    a.download = `酒馆配图-${Date.now()}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast('info', '这台设备不支持复制图片，已改成保存图片');
}

async function redrawImage(id, index, prompt) {
    const context = ctx();
    const message = context.chat[id];
    const url = await draw(context, cleanTags(prompt));
    if (!url || context.chat[id] !== message || !message.extra?.media?.[index]) return;
    message.extra.media[index] = { ...message.extra.media[index], url, title: cleanTags(prompt) };
    const el = globalThis.jQuery?.(`#chat .mes[mesid="${id}"]`);
    if (el?.length) context.appendMediaToMessage(message, el);
    await context.saveChat();
    toast('success', '重画好了');
}

// 捕获阶段拦：点图片本身不再弹放大窗口；点两个小按钮各干各的
function onChatClickCapture(event) {
    if (!settings().autoImageCleanView) return;
    const tool = event.target.closest?.('.tt-img-copy, .tt-img-redo');
    const onImage = event.target.closest?.('.mes_img');
    if (!tool && !onImage) return;
    event.stopPropagation();
    event.preventDefault();
    if (!tool) return;
    const { id, index, item, img } = mediaOf(tool);
    if (tool.classList.contains('tt-img-copy')) {
        const src = item?.url || img?.getAttribute('src');
        if (src) copyImage(src).catch((error) => toast('error', '复制失败：' + (error?.message || error)));
        return;
    }
    const context = ctx();
    const ask = context?.callGenericPopup && context?.POPUP_TYPE?.INPUT !== undefined
        ? context.callGenericPopup('改画图词（英文标签），点确定就按新的重画这张', context.POPUP_TYPE.INPUT, item?.title || '', { rows: 8, wide: true })
        : Promise.resolve(globalThis.prompt('改画图词（英文标签），确定后重画这张', item?.title || ''));
    ask.then((text) => {
        if (typeof text !== 'string' || !text.trim()) return;
        toast('info', '按新的画图词重画，大约一分钟');
        enqueue(() => redrawImage(id, index, text), '重画');
    });
}

function watchChatImages() {
    const chat = document.getElementById('chat');
    if (!chat || chatObserver) return !!chat;
    addImageTools(chat);
    chatObserver = new MutationObserver((records) => {
        for (const r of records) r.addedNodes.forEach((n) => n.nodeType === 1 && addImageTools(n.matches?.('.mes_img_container') ? n.parentElement : n));
    });
    chatObserver.observe(chat, { childList: true, subtree: true });
    document.addEventListener('click', onChatClickCapture, true);
    return true;
}

// ---------------------------------------------------------------- 设置界面

function settingsHtml() {
    return `
<div id="${SETTINGS_ID}" class="tt-autoimg">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>自动配图</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <small>主模型每写完一条正文，交给下面选的连接配置规划一张图，再用「图像生成」画好贴到这条正文末尾。主模型和当前连接都不受影响。</small>
      <label class="checkbox_label"><input type="checkbox" id="tt-autoimg-on"> <span>每条正文自动配一张图</span></label>
      <label class="checkbox_label"><input type="checkbox" id="tt-autoimg-portrait"> <span>新角色第一次出场先出一张定妆照</span></label>
      <label class="checkbox_label"><input type="checkbox" id="tt-autoimg-quiet"> <span>画图时不弹「正在生成图像…」提示</span></label>
      <label class="checkbox_label"><input type="checkbox" id="tt-autoimg-clean"> <span>聊天里的图铺满气泡，点图不放大，右上角只留「复制」「改词重画」</span></label>
      <label for="tt-autoimg-profile">写画图词用哪个连接配置</label>
      <select id="tt-autoimg-profile" class="text_pole"></select>
      <small id="tt-autoimg-hint"></small>
      <b>角色长相（这段聊天的）</b>
      <small>每个角色的脸、发型、身材定在这里，之后每张图都照这个画；衣服动作随剧情变。下面英文可以直接改，也可以在「想怎么改」里写中文。</small>
      <div id="tt-autoimg-cast"></div>
      <label for="tt-autoimg-preset">写词套装（画面怎么写：尺度、构图、镜头）</label>
      <select id="tt-autoimg-preset" class="text_pole"></select>
      <label for="tt-autoimg-prompt">这套的写词说明（英文，可改；开头要它回 JSON 的那几行别动）</label>
      <textarea id="tt-autoimg-prompt" class="text_pole" rows="8"></textarea>
      <div class="flex-container">
        <div id="tt-autoimg-saveas" class="menu_button">另存为我的套装</div>
        <div id="tt-autoimg-delpreset" class="menu_button">删除这个套装</div>
        <div id="tt-autoimg-reset" class="menu_button">恢复这套原样</div>
        <div id="tt-autoimg-now" class="menu_button">给最后一条正文配一张</div>
      </div>
    </div>
  </div>
</div>`;
}

function renderCast() {
    const box = document.getElementById('tt-autoimg-cast');
    if (!box) return;
    const entries = Object.entries(cast());
    if (!entries.length) {
        box.innerHTML = '<small>这段聊天还没有角色。配第一张图时会自动建。</small>';
        return;
    }
    box.innerHTML = entries.map(([name, c]) => `
<div class="tt-cast-row" data-name="${esc(name)}">
  <div class="tt-cast-head">${c.portrait ? `<img src="${esc(c.portrait)}" alt="">` : ''}<b>${esc(name)}</b></div>
  <textarea class="text_pole tt-cast-look" rows="3">${esc(c.look)}</textarea>
  <input class="text_pole tt-cast-ask" placeholder="想怎么改（中文），比如：脸再瓜子一点，丹凤眼，头发换成栗色">
  <div class="flex-container">
    <div class="menu_button tt-cast-redo">按这个改，再出一张定妆照</div>
    <div class="menu_button tt-cast-del">删掉这个角色</div>
  </div>
</div>`).join('');
}

function onCastClick(event) {
    const row = event.target.closest('.tt-cast-row');
    if (!row) return;
    const name = row.dataset.name;
    if (event.target.closest('.tt-cast-del')) {
        delete cast()[name];
        saveCast();
        return;
    }
    if (event.target.closest('.tt-cast-redo')) {
        const ask = row.querySelector('.tt-cast-ask').value.trim();
        if (!ask) { toast('info', '先在「想怎么改」里写一句'); return; }
        toast('info', `开始改「${name}」，大约一分钟出新定妆照`);
        enqueue(() => reviseLook(name, ask), '改长相');
    }
}

function onCastChange(event) {
    const area = event.target.closest('.tt-cast-look');
    if (!area) return;
    const name = area.closest('.tt-cast-row')?.dataset.name;
    const entry = cast()[name];
    if (!entry) return;
    entry.look = cleanTags(area.value) || entry.look;
    saveCast();
}

function fillProfiles() {
    const select = document.getElementById('tt-autoimg-profile');
    if (!select) return;
    const s = settings();
    const list = profiles();
    // 列表没变就不动它：手机上一按下就重写选项，原生下拉可能弹不出来
    const sig = list.map((p) => p.group + p.id + '=>' + p.name).join(' ;; ');
    if (select.dataset.sig === sig && select.options.length) return;
    select.dataset.sig = sig;
    const groups = ['连接配置文件', '模型'].map((g) => {
        const items = list.filter((p) => p.group === g);
        return items.length ? `<optgroup label="${g}">` + items.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') + '</optgroup>' : '';
    });
    select.innerHTML = '<option value="">（未选）</option>' + groups.join('');
    select.value = list.some((p) => p.id === s.autoImageProfile) ? s.autoImageProfile : '';
    const hint = document.getElementById('tt-autoimg-hint');
    if (hint) hint.textContent = list.length ? '「连接配置文件」和「模型」两类都能选，跟「API 连接」页那个下拉框是同一批' : '还没有连接配置：先在「API 连接」里连上 DeepSeek，存成连接配置文件或模型';
}

function mount() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    if (document.getElementById(SETTINGS_ID)) return true;
    host.insertAdjacentHTML('beforeend', settingsHtml());
    const s = settings();
    const bind = (id, key, after) => {
        const box = document.getElementById(id);
        box.checked = !!s[key];
        box.addEventListener('change', () => { settings()[key] = box.checked; save(); after?.(); });
    };
    bind('tt-autoimg-on', 'autoImageEnabled');
    bind('tt-autoimg-portrait', 'autoImagePortrait');
    bind('tt-autoimg-quiet', 'autoImageQuietToast', applyQuietToast);
    bind('tt-autoimg-clean', 'autoImageCleanView', applyQuietToast);

    const select = document.getElementById('tt-autoimg-profile');
    fillProfiles();
    select.addEventListener('change', () => { settings().autoImageProfile = select.value; save(); });
    // 手机上点下拉框时 focus 不一定先触发，按下就刷一次；连接配置增删改也跟着刷
    ['focus', 'pointerdown', 'touchstart', 'mousedown'].forEach((name) => select.addEventListener(name, fillProfiles, { passive: true }));
    document.querySelector(`#${SETTINGS_ID} .inline-drawer-toggle`)?.addEventListener('click', () => { fillProfiles(); renderCast(); });

    const castBox = document.getElementById('tt-autoimg-cast');
    castBox.addEventListener('click', onCastClick);
    castBox.addEventListener('change', onCastChange);
    renderCast();

    const prompt = document.getElementById('tt-autoimg-prompt');
    const presetSel = document.getElementById('tt-autoimg-preset');
    const fillPresets = () => {
        const cur = settings();
        const mine = cur.autoImageCustomPresets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        presetSel.innerHTML = '<optgroup label="内置">' + PRESETS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '</optgroup>'
            + (mine ? `<optgroup label="我的">${mine}</optgroup>` : '');
        presetSel.value = cur.autoImagePresetId;
        prompt.value = cur.autoImagePrompt;
    };
    fillPresets();
    presetSel.addEventListener('change', () => {
        const cur = settings();
        const preset = presetById(presetSel.value, cur);
        if (!preset) return;
        cur.autoImagePresetId = preset.id;
        cur.autoImagePrompt = preset.text;
        prompt.value = preset.text;
        save();
    });
    prompt.addEventListener('change', () => {
        const cur = settings();
        cur.autoImagePrompt = prompt.value.trim() || presetById(cur.autoImagePresetId, cur)?.text || DEFAULT_PROMPT;
        // 自己的套装改了就直接存回这一套；内置套装改动只算临时，换套装或点「恢复这套原样」就回去
        const mine = cur.autoImageCustomPresets.find((p) => p.id === cur.autoImagePresetId);
        if (mine) mine.text = cur.autoImagePrompt;
        save();
    });
    document.getElementById('tt-autoimg-reset').addEventListener('click', () => {
        const cur = settings();
        const preset = presetById(cur.autoImagePresetId, cur) || PRESETS[0];
        cur.autoImagePrompt = preset.text;
        prompt.value = preset.text;
        save();
    });
    document.getElementById('tt-autoimg-saveas').addEventListener('click', async () => {
        const context = ctx();
        const name = context?.callGenericPopup && context?.POPUP_TYPE?.INPUT !== undefined
            ? await context.callGenericPopup('给这套起个名字', context.POPUP_TYPE.INPUT, '我的套装')
            : globalThis.prompt('给这套起个名字', '我的套装');
        if (typeof name !== 'string' || !name.trim()) return;
        const cur = settings();
        const preset = { id: 'c' + Date.now(), name: name.trim(), text: prompt.value.trim() || cur.autoImagePrompt };
        cur.autoImageCustomPresets.push(preset);
        cur.autoImagePresetId = preset.id;
        cur.autoImagePrompt = preset.text;
        save();
        fillPresets();
        toast('success', `存好了：${preset.name}`);
    });
    document.getElementById('tt-autoimg-delpreset').addEventListener('click', () => {
        const cur = settings();
        const i = cur.autoImageCustomPresets.findIndex((p) => p.id === cur.autoImagePresetId);
        if (i < 0) { toast('info', '内置套装删不了，只能删自己另存的'); return; }
        const [gone] = cur.autoImageCustomPresets.splice(i, 1);
        cur.autoImagePresetId = 'default';
        cur.autoImagePrompt = PRESETS[0].text;
        save();
        fillPresets();
        toast('success', `删掉了：${gone.name}`);
    });
    document.getElementById('tt-autoimg-now').addEventListener('click', () => {
        const chat = ctx()?.chat || [];
        let id = chat.length - 1;
        while (id >= 0 && (chat[id]?.is_user || chat[id]?.is_system)) id--;
        if (id < 0) { toast('info', '这个聊天里还没有正文'); return; }
        toast('info', '开始配图，大约一分钟');
        enqueue(() => drawAndAttachForce(id), '手动配图');
    });
    return true;
}

export function initStoryImage() {
    const context = ctx();
    applyQuietToast();
    const types = context?.eventTypes ?? context?.event_types;
    if (context?.eventSource?.on && types) {
        if (!receivedListener && types.MESSAGE_RECEIVED) {
            receivedListener = (id, kind) => onReceived(id, kind);
            context.eventSource.on(types.MESSAGE_RECEIVED, receivedListener);
        }
        if (!profileListener) {
            profileListener = () => fillProfiles();
            PROFILE_EVENTS.forEach((name) => types[name] && context.eventSource.on(types[name], profileListener));
        }
        if (!chatListener && types.CHAT_CHANGED) {
            chatListener = () => renderCast();
            context.eventSource.on(types.CHAT_CHANGED, chatListener);
        }
    }
    clearInterval(mountTimer);
    const ready = () => mount() & watchChatImages();
    if (ready()) return;
    let tries = 0;
    mountTimer = setInterval(() => { if (ready() || ++tries > 60) clearInterval(mountTimer); }, 500);
}

export function cleanupStoryImage() {
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    const off = (type, fn) => { try { context?.eventSource?.removeListener?.(type, fn); } catch { /* ignore */ } };
    if (types) {
        if (receivedListener) off(types.MESSAGE_RECEIVED, receivedListener);
        if (profileListener) PROFILE_EVENTS.forEach((name) => off(types[name], profileListener));
        if (chatListener) off(types.CHAT_CHANGED, chatListener);
    }
    receivedListener = profileListener = chatListener = null;
    clearInterval(mountTimer);
    chatObserver?.disconnect();
    chatObserver = null;
    document.removeEventListener('click', onChatClickCapture, true);
    document.querySelectorAll('.tt-img-tools').forEach((el) => el.remove());
    document.getElementById(SETTINGS_ID)?.remove();
    document.getElementById(QUIET_STYLE_ID)?.remove();
    document.body?.classList.remove('tt-autoimg-quiet');
}

// 给电脑上的自测脚本用
export const __test = { cleanTags, plainText, parsePlan, buildPrompt, portraitPrompt, DEFAULT_PROMPT, REVISE_PROMPT, PRESETS };
