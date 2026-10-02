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
// 🚨 别再升：v1.15.4 起写词说明归用户，升这个号不会再替换手机上的说明（见 AGENTS.md）
const PROMPT_VERSION = 8;
const ctx = () => globalThis.SillyTavern?.getContext?.();

// 画面要亮：模型和写词都容易往「夜里、烛光、昏暗」走，出来又灰又压抑
const BRIGHT_TAGS = 'bright lighting, well-lit, warm colors, vivid colors';

// 写词说明 = 公共部分（回 JSON 的格式、跳过规则、长相档案规则）+ 各套装自己的「画面怎么写」。
// 公共部分每套都一样，保证长相照档案画；套装只换画面风格。画不画、画多露骨交给写词模型自己判断，这里不加内容限制。
const BASE_RULES = `You plan ONE illustration of a story passage for a local anime-style image model that reads Danbooru tags.
Reply with ONLY one JSON object, no markdown, no explanation:
{"skip": false, "rating": "", "people": [{"name": "", "sex": "female"}], "new_looks": {}, "scene": ""}

Rules:
- skip: true if nothing visual is worth drawing. Then leave the other fields empty.
- rating: safe / sensitive / nsfw / explicit. Use explicit whenever genitals or sex are visible; if the passage shows or clearly implies intercourse, use explicit even when the wording is poetic.
- people: everyone visible, left to right. name = the name as written in the story (keep Chinese names as they are), or a short role such as "the man". sex = female or male.
- The picture is about the women. Men stay out of frame whenever possible. The user's own character ("you" / 你 in the story) is a man; any man is listed as {"name": "the man", "sex": "male"} ONLY when his body is needed for sexual contact (penetration, fellatio, groping, being straddled), and then he is shown only in part: first-person pov, his face and head out of frame, only his hands, hips and penis visible. In every other moment (talking, kissing, hugging, sitting together) leave him out of the picture and show only her reaction. scene never describes his face, hair or full body. Never pick a framing where his back, chest or face is the main subject (for example her hugging him from behind seen from outside): reframe it so the camera is his eyes and the picture shows her face and body.
- Draw ONE moment: the last and most important beat of the passage. One action only; never mix several positions or sex acts in one picture. Use only what the passage actually describes (acts, clothes, props); never add things that are not in the text, such as futanari, yuri, masturbation, watching or extra partners.
- Include every woman who takes part in this moment (up to 5); do not drop women who are in the scene. If more than 5 are present, keep the 5 at the center of the action.
- Place: always give concrete setting details that match the story's era. Unless the story is clearly modern, it is ancient / fantasy China: name the room and its period details (carved wooden lattice windows, paper lanterns, folding screen, canopy bed with silk curtains, low wooden table, incense burner, courtyard, pavilion). Never modern furniture, electric lamps or glass windows in such a story.
- Vary the pose and the camera from picture to picture (different position, angle and framing each time) instead of repeating the same one.
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
- Refer to people by position and sex ("the woman on the left", "the man's hands"), never by Chinese name inside the sentences. If a man is present, describe only the parts of him in frame (his hands, hips, penis) from a first-person view, never his face.
- Describe the light as bright and warm in the sentences (soft lantern glow filling the room, warm sunlight), unless the passage is clearly dark.
- Same sensual default as an adult romance: tempting clothing, seductive looks, attractive poses; explicit anatomy words when the passage is a sex scene.`,
    camera: `
Style of this set: cinematic camera work.
- scene: English Danbooru tags, lowercase, comma-separated, 20-35 tags, starting with a strong shot choice, then clothing, expression, pose and action, place, light.
- Pick the most dramatic framing for the moment and say it clearly: close-up on face or hands, extreme close-up, pov (the viewer is the user's character), from below, from above, dutch angle, foreshortening, over the shoulder, reflection in mirror, depth of field with blurred foreground. Vary it between pictures; avoid flat front-facing full body shots.
- Same sensual default as an adult romance; in sex scenes prefer pov or close framing that shows faces and contact.`,
};

// ⑥ 用户 2026-10-02 发来的整份说明（给 Qwen-Image 写整句、国风 3D 质感），原样收进来，不套 BASE_RULES
const QWEN3D_TEXT = `You plan ONE illustration of a story passage for a local image model that understands full English sentences (Qwen-Image).
Reply with ONLY one JSON object, no markdown, no explanation:
{"skip": false, "rating": "", "people": [{"name": "", "sex": "female"}], "new_looks": {}, "scene": ""}

Rules:
- skip: true if nothing visual is worth drawing. Then leave the other fields empty.
- rating: safe / sensitive / nsfw / explicit. Use explicit whenever genitals or sex are visible.
- people: everyone visible, left to right. name = the name as written in the story (keep Chinese names as they are), or a short role such as "the man". sex = female or male.
- The picture is about the women. The user's own character ("you" / 你) is a man; list him as {"name": "the man", "sex": "male"} only when his body takes part in the sexual contact, and then show him from his own first-person view: only his hands, hips and penis are in frame. In other moments show only her and her reaction.
- Draw ONE moment: the last and most important beat of the passage, with one clear action, as the passage describes it.
- Include every woman who takes part in this moment (up to 5).
- Place: concrete setting details that match the story's era. Unless the story is clearly modern, it is ancient / fantasy China: carved lattice windows, paper lanterns, folding screens, canopy bed with silk curtains, jade bath, pavilion, blossoming garden.
- Vary the pose and the camera from picture to picture.
- new_looks: only for female characters that are not in the known cast list. Give a fixed appearance as tags: mature female, face shape, eye shape and color, hair color, hair length and style, body (large breasts, narrow waist, wide hips unless the story says otherwise), skin, one distinctive mark. No clothing, no expression.
- scene leaves out hair, eye, face and body-shape details; those come from the cast list.
- Mood and light: bright, warm and dreamy by default; darker only when the passage itself is dark.

Style of this set: Chinese 3D donghua CG, written as natural sentences.
- scene: 3-5 English sentences that describe exactly what the camera sees. Start with the shot and angle (close-up, upper body, full body, first-person view, from the side, from behind, from below). Then say where each person is and how their bodies are placed: who lies, kneels, sits or straddles, where the legs, arms and hands are. Then what each one wears right now, their expressions, then the place and the light.
- Refer to people by position and sex ("the woman on the left", "the man's hands"), and keep Chinese names out of the sentences.
- In sex scenes name the act and the contact plainly and precisely (missionary, cowgirl, doggy style, spooning, standing sex, fellatio; his penis inside her pussy; her breasts and pink nipples) and the body reactions (flushed cheeks, sweat, parted lips, half-closed eyes, trembling thighs).
- Make her alluring in every moment: tempting clothing, bare shoulders, sheer silk, wet skin, seductive or shy looks, graceful poses that show her body.
- End the scene with the look of the picture: glossy porcelain skin, gold jewelry and hair ornaments, glowing flowers, soft bloom light.`;

// ⑦ 空白：只留扩展读结果必需的回答格式和几个字段的意思，画风、写法留给用户自己填
const BLANK_TEXT = `You plan ONE illustration of a story passage for a local image model.
Reply with ONLY one JSON object, no markdown, no explanation:
{"skip": false, "rating": "", "people": [{"name": "", "sex": "female"}], "new_looks": {}, "scene": ""}

Fields:
- skip: true if nothing visual is worth drawing. Then leave the other fields empty.
- rating: safe / sensitive / nsfw / explicit.
- people: everyone visible, left to right. name = the name as written in the story, or a short role such as "the man". sex = female or male.
- new_looks: a fixed appearance as tags, only for female characters that are not in the known cast list.
- scene: what the camera sees in this picture.

Style of this set:
- `;

const PRESETS = [
    { id: 'default', name: '① 默认·国风情欲' },
    { id: 'bold', name: '② 更放得开' },
    { id: 'elegant', name: '③ 唯美含蓄' },
    { id: 'sentence', name: '④ 整句描述（多人不串）' },
    { id: 'camera', name: '⑤ 镜头感' },
    { id: 'qwen3d', name: '⑥ 国风3D·整句（Qwen）', text: QWEN3D_TEXT },
    { id: 'blank', name: '⑦ 空白（只留格式，自己填）', text: BLANK_TEXT },
].map((p) => ({ ...p, text: p.text || BASE_RULES + STYLE_RULES[p.id] }));

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
    if (!Array.isArray(s.autoImageCustomPresets)) s.autoImageCustomPresets = [];
    if (typeof s.autoImagePresetId !== 'string' || !presetById(s.autoImagePresetId, s)) s.autoImagePresetId = 'default';
    if (!s.autoImageMyTexts || typeof s.autoImageMyTexts !== 'object') s.autoImageMyTexts = {};
    // v1.15.4 起写词说明归用户：5 套内置的各留一份用户自己的，改了就存，更新扩展不再替换。
    // 这段只在头一次升到这版时跑：v8 以前的旧说明先换成 v8（去掉内容限制），再把当时的说明收成用户自己的。
    if (!s.autoImagePromptsOwned) {
        if (s.autoImagePromptVersion !== PROMPT_VERSION || typeof s.autoImagePrompt !== 'string' || !s.autoImagePrompt.trim()) {
            for (const p of s.autoImageCustomPresets) if (typeof p?.text === 'string') p.text = stripOldLimits(p.text);
            s.autoImagePrompt = presetById(s.autoImagePresetId, s).text;
            s.autoImagePromptVersion = PROMPT_VERSION;
        }
        if (PRESETS.some((p) => p.id === s.autoImagePresetId)) s.autoImageMyTexts[s.autoImagePresetId] = s.autoImagePrompt;
        s.autoImagePromptsOwned = true;
    }
    // 以后新加的内置套装，用户还没有自己那份时才补上
    for (const p of PRESETS) if (typeof s.autoImageMyTexts[p.id] !== 'string') s.autoImageMyTexts[p.id] = p.text;
    if (typeof s.autoImagePrompt !== 'string' || !s.autoImagePrompt.trim()) s.autoImagePrompt = presetText(s.autoImagePresetId, s);
    if (typeof s.autoImageQuietToast !== 'boolean') s.autoImageQuietToast = true;
    if (typeof s.autoImagePortrait !== 'boolean') s.autoImagePortrait = true;
    if (typeof s.autoImageCleanView !== 'boolean') s.autoImageCleanView = true;
    return s;
}

// v8 以前写词说明里的内容限制（强迫 / 非自愿就跳过、只有自愿才算露骨），旧套装里有就删掉
function stripOldLimits(text) {
    return text
        .replace(', or if the passage depicts sexual activity that is forced, coerced or non-consensual', '')
        .replace('clearly implies consensual intercourse', 'clearly implies intercourse')
        .replace('when the passage is a consensual sex scene', 'when the passage is a sex scene');
}

// 内置套装 + 自己另存的套装
function presetById(id, s) {
    return PRESETS.find((p) => p.id === id) || (s?.autoImageCustomPresets || []).find((p) => p.id === id) || null;
}

// 这套现在用的说明：内置套装用用户自己那份，自己另存的套装用它存的
function presetText(id, s) {
    const builtIn = PRESETS.find((p) => p.id === id);
    if (builtIn) return typeof s?.autoImageMyTexts?.[id] === 'string' ? s.autoImageMyTexts[id] : builtIn.text;
    return presetById(id, s)?.text || s?.autoImageMyTexts?.default || DEFAULT_PROMPT;
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
        // 干净看图：图片铺满气泡宽度，点图不放大，图上酒馆自带的两排按钮（上面放大 / 说明 / 删除，下面「< 1/1 >」翻图）都藏起来，只留右上角「存到手机」。
        // 手机上图和字铺到右边、最后一条底下给「>」留位置，在 style.css 的 v1.16.0 那段
        + ' body.tt-autoimg-clean .mes .mes_img_container { width: 100%; }'
        + ' body.tt-autoimg-clean .mes .mes_img { width: 100%; max-height: 80vh; object-fit: contain; cursor: default; }'
        + ' body.tt-autoimg-clean .mes .mes_img_controls, body.tt-autoimg-clean .mes .mes_img_swipes { display: none !important; }'
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
    const body = text.slice(start, end + 1);
    // 第二次：修常见的小毛病再试——中文引号、末尾多一个逗号
    for (const s of [body, body.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1')]) {
        try {
            const plan = JSON.parse(s);
            if (plan && typeof plan === 'object') return plan;
        } catch { /* 试下一种 */ }
    }
    return null;
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

// 人多时长相只留一眼认得出的：发色发型、眼睛、胸型、记号、年龄感。脸型、腰、皮肤这些砍掉，给动作和背景腾地方
const KEY_LOOK = /hair|twintails|twin-tails|ponytail|bun|braid|bangs|eyes|breasts|mole|mark|scar|tattoo|freckles|petite|mature|loli|elf|ears|horns/i;
function shortLook(look) {
    const kept = look.split(/,\s*/).filter((t) => KEY_LOOK.test(t) && !/beautiful detailed/i.test(t));
    return kept.length ? kept.join(', ') : look;
}

const PROMPT_LIMIT = 1800;

// 规划 + 长相档案 → 最终画图词。长相原样从档案抄，不让写词模型改。
// 动作、地点、光线（scene）一个字都不许被截掉——以前人一多就把它们挤出上限，图只剩白底
function buildPrompt(plan, cast) {
    const people = Array.isArray(plan.people) ? plan.people.filter((p) => p && p.name) : [];
    // 同框最多 5 个女人（用户要的；人越多越容易糊，3 个以上长相会缩短）
    const girls = people.filter((p) => String(p.sex).toLowerCase() !== 'male').slice(0, 5);
    const boys = people.filter((p) => String(p.sex).toLowerCase() === 'male');
    const head = [cleanTags(plan.rating) || 'sensitive'];
    if (girls.length) head.push(countTag(girls.length, 'girl'));
    if (boys.length) head.push(countTag(boys.length, 'boy'));
    if (girls.length && boys.length) head.push('hetero');
    if (!girls.length && !boys.length) head.push('no humans');
    const tail = [boys.length ? 'pov, faceless male, male head out of frame' : '', cleanTags(plan.scene), BRIGHT_TAGS];
    let looks = girls.map((g) => cleanTags(cast[g.name]?.look || plan.new_looks?.[g.name] || 'mature female'));
    if (looks.length >= 3) looks = looks.map(shortLook);
    const lookText = (list) => list.length === 1 ? list[0]
        // 多个女角色：用整句把长相绑在位置上，减少 A 的发色跑到 B 头上
        : list.map((l, i) => `the woman ${placeWord(i, list.length)} has ${l.replace(/,\s*/g, ' and ')}`).join(', ');
    const join = (middle) => cleanTags([...head, middle, ...tail].filter(Boolean).join(', '));
    let prompt = join(lookText(looks));
    if (prompt.length > PROMPT_LIMIT && looks.length) prompt = join(lookText(looks.map(shortLook)));
    if (prompt.length > PROMPT_LIMIT) {
        // 还超：砍长相那段，scene 留全
        const room = Math.max(0, PROMPT_LIMIT - join('').length - 2);
        prompt = join(lookText(looks.map(shortLook)).slice(0, room).replace(/[^,]*$/, ''));
    }
    return prompt;
}

// 定妆照：只放在设置的「角色长相」里看，不贴进聊天。照样要带点情欲感
function portraitPrompt(look) {
    return cleanTags(`sensitive, 1girl, solo, ${look}, upper body, looking at viewer, seductive smile, blush, bare shoulders, off shoulder, collarbone, cleavage, hanfu, indoors, chinese style room, blurry background, ${BRIGHT_TAGS}`);
}

// ---------------------------------------------------------------- 长相档案

// 长相档案跟着角色卡走（v1.15.8）：一张卡一套，存在扩展设置里按角色卡头像文件名分；新开聊天照样是这一套。
// 群聊没有单一角色卡，还存在这段聊天里。v1.15.8 以前存在聊天里的，打开那段聊天时并进角色卡那套（卡里已有的名字不覆盖）。
function castOwner() {
    const context = ctx();
    if (!context || context.groupId) return '';
    const chid = context.characterId;
    if (chid === undefined || chid === null || chid === '') return '';
    return context.characters?.[chid]?.avatar || '';
}

function cast() {
    const meta = ctx()?.chatMetadata;
    const owner = castOwner();
    if (!owner) {
        if (!meta) return {};
        if (!meta[CAST_KEY] || typeof meta[CAST_KEY] !== 'object') meta[CAST_KEY] = {};
        return meta[CAST_KEY];
    }
    const s = settings();
    if (!s.autoImageCastByChar || typeof s.autoImageCastByChar !== 'object') s.autoImageCastByChar = {};
    const book = s.autoImageCastByChar[owner] = s.autoImageCastByChar[owner] || {};
    const old = meta?.[CAST_KEY];
    if (old && typeof old === 'object' && !meta.tt_autoimg_cast_moved) {
        for (const [name, entry] of Object.entries(old)) if (!book[name]) book[name] = entry;
        meta.tt_autoimg_cast_moved = true;
        save();
        ctx()?.saveMetadataDebounced?.();
    }
    return book;
}

async function saveCast() {
    const context = ctx();
    if (castOwner()) save();
    else if (context?.saveMetadataDebounced) context.saveMetadataDebounced();
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

// 一条消息只留一张配图：重新生成（左右滑）、手动配图再来一张，都是换掉旧的，不往下摞
function attach(context, id, message, url, title) {
    // 画图要一分钟，期间这条可能被删了或换了：对不上就不贴
    if (context.chat[id] !== message) return false;
    message.extra = message.extra || {};
    if (!Array.isArray(message.extra.media)) message.extra.media = [];
    message.extra.media = message.extra.media.filter((m) => m?.source !== 'generated'); // 以前版本贴的定妆照、配图也一并换掉
    message.extra.media.push({ url, type: 'image', title, source: 'generated', tt_autoimg: true });
    message.extra.media_index = message.extra.media.length - 1;
    message.extra.inline_image = true; // false 会把正文藏起来只显示图
    message.extra.media_display = 'list';
    const el = globalThis.jQuery?.(`#chat .mes[mesid="${id}"]`);
    if (el?.length) context.appendMediaToMessage(message, el); // 它会把整块图清空重画，换掉的旧图自己没了
    return true;
}

// 只给最新那条画：排着队的旧消息，等轮到它时已经有更新的消息了，就不画，免得图半天后贴到上面去
let latestJob = 0;
const stale = (job) => job !== latestJob;

async function drawAndAttach(id, type, job = latestJob) {
    const s = settings();
    if (!s.autoImageEnabled || SKIP_TYPES.has(type) || stale(job)) return;
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

    // 回得不对就再问一次：长正文时它可能想太久把额度用完、回个空的；偶尔也会格式写歪
    const messages = [{ role: 'system', content: s.autoImagePrompt }, { role: 'user', content: parts.join('\n\n') }];
    let reply = '';
    let plan = null;
    for (let tries = 0; tries < 2 && !plan; tries++) {
        if (stale(job)) return;
        reply = await askModel(context, messages, 8000);
        plan = parsePlan(reply);
    }
    if (!plan) {
        const said = plainText(reply).replace(/\s+/g, ' ').slice(0, 80);
        toast('warning', `这段没配图：写词模型两次都没按格式回答。它回的是：${said || '（空的）'}`);
        return;
    }
    if (plan.skip) { toast('info', '这段跳过，不配图'); return; }

    // 新角色先进档案（长相定下来，这张配图就照它画）
    const fresh = Object.entries(plan.new_looks || {}).filter(([name, look]) => name && cleanTags(look) && !known[name]);
    for (const [name, look] of fresh) {
        known[name] = { look: cleanTags(look), portrait: '' };
        toast('success', `新角色「${name}」的长相定下了。不满意去「扩展 → 自动配图 → 角色长相」里说怎么改`);
    }
    if (fresh.length) await saveCast();
    if (stale(job)) return; // 写词那几十秒里又来了新消息

    const prompt = buildPrompt(plan, known);
    const url = await draw(context, prompt);
    if (url) attach(context, id, message, url, prompt);
    await context.saveChat();

    // 定妆照放最后画、不贴进聊天，只在设置的「角色长相」里看；有新消息等着就先让它
    if (s.autoImagePortrait) {
        for (const [name] of fresh) {
            if (stale(job)) break;
            const p = await draw(context, portraitPrompt(known[name].look));
            if (p && known[name]) { known[name].portrait = p; await saveCast(); }
        }
    }
}

function enqueue(job, label) {
    // 排队：上一张还没画完又来一条，就等上一张画完再画，免得两张同时挤显卡
    queue = queue.then(job).catch((error) => {
        console.warn(`[酒馆拓展] ${label}失败`, error);
        toast('error', String(error?.message || error));
    });
}

function onReceived(id, type) {
    if (!settings().autoImageEnabled || SKIP_TYPES.has(type)) return;
    const job = ++latestJob;
    enqueue(() => drawAndAttach(Number(id), type, job), '自动配图');
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

// ---------------------------------------------------------------- 聊天里的图：只留右上角「存到手机」一个小按钮

let chatObserver = null;

function addImageTools(root) {
    root.querySelectorAll?.('.mes_img_container').forEach((box) => {
        const old = box.querySelector(':scope > .tt-img-tools');
        if (old && !old.querySelector('.tt-img-save')) old.remove();
        if (box.querySelector(':scope > .tt-img-tools')) return;
        box.insertAdjacentHTML('beforeend', '<div class="tt-img-tools"><div class="tt-img-save fa-solid fa-download" title="存到手机"></div></div>');
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

// 存到手机：走酒馆自己导出文件那一套（TauriTavern 在安卓上存进「下载」，存完自己弹提示说存哪了）；
// 那一套加载不到时（比如电脑浏览器里的老版酒馆）退回浏览器下载。手机上复制图片到剪贴板没用，2026-10-02 换掉了复制
async function saveImage(src) {
    const blob = await (await fetch(src)).blob();
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const name = `酒馆配图-${Date.now()}.${ext}`;
    try {
        const { download } = await import('../../../utils.js');
        await download(blob, name, blob.type || 'image/png', { throwOnFailure: true });
        return;
    } catch (error) {
        console.warn('[酒馆拓展] 酒馆自带的导出用不了，改用浏览器下载', error);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast('success', '图片已保存');
}

// 捕获阶段拦：点图片本身不再弹放大窗口；点「存到手机」存这张
function onChatClickCapture(event) {
    if (!settings().autoImageCleanView) return;
    const tool = event.target.closest?.('.tt-img-save');
    const onImage = event.target.closest?.('.mes_img');
    if (!tool && !onImage) return;
    event.stopPropagation();
    event.preventDefault();
    if (!tool) return;
    const { item, img } = mediaOf(tool);
    const src = item?.url || img?.getAttribute('src');
    if (src) saveImage(src).catch((error) => toast('error', '保存失败：' + (error?.message || error)));
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
      <label class="checkbox_label"><input type="checkbox" id="tt-autoimg-portrait"> <span>新角色出场后补一张定妆照（在魔法棒「看定妆照」里看，不进聊天）</span></label>
      <label class="checkbox_label"><input type="checkbox" id="tt-autoimg-quiet"> <span>画图时不弹「正在生成图像…」提示</span></label>
      <label class="checkbox_label"><input type="checkbox" id="tt-autoimg-clean"> <span>聊天里的图铺满气泡，点图不放大，图上只留右上角「存到手机」</span></label>
      <label for="tt-autoimg-profile">写画图词用哪个连接配置</label>
      <select id="tt-autoimg-profile" class="text_pole"></select>
      <small id="tt-autoimg-hint"></small>
      <small>角色长相和定妆照在左下角魔法棒「看定妆照」里。</small>
      <div class="tt-prompt-editor"></div>
      <div class="flex-container">
        <div id="tt-autoimg-now" class="menu_button">给最后一条正文配一张</div>
      </div>
    </div>
  </div>
</div>`;
}

function renderCast() {
    const box = castPanel?.querySelector('#tt-autoimg-cast');
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

// 改写词说明那一块：扩展设置里一份，魔法棒弹窗里一份，两边改的是同一份设置
const promptEditors = new Set();
const WAND_ID = 'tt-autoimg-wand';

async function confirmPopup(text) {
    const context = ctx();
    if (context?.callGenericPopup && context?.POPUP_TYPE?.CONFIRM !== undefined) return !!(await context.callGenericPopup(text, context.POPUP_TYPE.CONFIRM));
    return globalThis.confirm(text);
}

function bindPromptEditor(root) {
    if (!root) return null;
    root.innerHTML = `
  <label>写词套装（画面怎么写：尺度、构图、镜头）</label>
  <select class="text_pole tt-pe-preset"></select>
  <label>这套的写词说明（英文，可改；开头要它回 JSON 的那几行别动）</label>
  <small>改完自动存在手机里，换套装、更新扩展都不会动它。</small>
  <textarea class="text_pole tt-pe-text" rows="8"></textarea>
  <div class="flex-container">
    <div class="menu_button tt-pe-saveas">另存为我的套装</div>
    <div class="menu_button tt-pe-del">删除这个套装</div>
    <div class="menu_button tt-pe-latest">换成扩展里的新版</div>
  </div>`;
    const presetSel = root.querySelector('.tt-pe-preset');
    const prompt = root.querySelector('.tt-pe-text');
    const fill = () => {
        const cur = settings();
        const mine = cur.autoImageCustomPresets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        presetSel.innerHTML = '<optgroup label="内置">' + PRESETS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '</optgroup>'
            + (mine ? `<optgroup label="我的">${mine}</optgroup>` : '');
        presetSel.value = cur.autoImagePresetId;
        prompt.value = cur.autoImagePrompt;
    };
    const fillOthers = () => promptEditors.forEach((f) => f !== fill && f());
    const fillAll = () => promptEditors.forEach((f) => f());
    promptEditors.add(fill);
    fill();

    presetSel.addEventListener('change', () => {
        const cur = settings();
        if (!presetById(presetSel.value, cur)) return;
        cur.autoImagePresetId = presetSel.value;
        cur.autoImagePrompt = presetText(presetSel.value, cur);
        save();
        fillAll();
    });
    // 边打边存：手机上关弹窗时不一定先触发 change，等它会丢字
    prompt.addEventListener('input', () => {
        const text = prompt.value.trim();
        if (!text) return;
        const cur = settings();
        cur.autoImagePrompt = text;
        const mine = cur.autoImageCustomPresets.find((p) => p.id === cur.autoImagePresetId);
        if (mine) mine.text = text;
        else cur.autoImageMyTexts[cur.autoImagePresetId] = text;
        save();
    });
    prompt.addEventListener('change', fillOthers);
    root.querySelector('.tt-pe-latest').addEventListener('click', async () => {
        const cur = settings();
        const builtIn = PRESETS.find((p) => p.id === cur.autoImagePresetId);
        if (!builtIn) { toast('info', '自己另存的套装没有扩展版，只能自己改'); return; }
        if (cur.autoImageMyTexts[builtIn.id] === builtIn.text) { toast('info', '这套已经是扩展里的版本了'); return; }
        if (!await confirmPopup(`用扩展里的新版换掉「${builtIn.name}」？你在这套上改的会被替换掉。`)) return;
        cur.autoImageMyTexts[builtIn.id] = builtIn.text;
        cur.autoImagePrompt = builtIn.text;
        save();
        fillAll();
        toast('success', `「${builtIn.name}」换成扩展里的版本了`);
    });
    root.querySelector('.tt-pe-saveas').addEventListener('click', async () => {
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
        fillAll();
        toast('success', `存好了：${preset.name}`);
    });
    root.querySelector('.tt-pe-del').addEventListener('click', () => {
        const cur = settings();
        const i = cur.autoImageCustomPresets.findIndex((p) => p.id === cur.autoImagePresetId);
        if (i < 0) { toast('info', '内置套装删不了，只能删自己另存的'); return; }
        const [gone] = cur.autoImageCustomPresets.splice(i, 1);
        cur.autoImagePresetId = 'default';
        cur.autoImagePrompt = presetText('default', cur);
        save();
        fillAll();
        toast('success', `删掉了：${gone.name}`);
    });
    return fill;
}

// 左下角魔法棒菜单里的「改配图提示词」，点开弹窗直接改，不用去翻扩展设置
async function openPromptPopup() {
    const context = ctx();
    if (!context?.callGenericPopup) { toast('info', '弹不出窗口，去扩展设置「自动配图」最下面改'); return; }
    const box = document.createElement('div');
    box.className = 'tt-prompt-popup';
    box.innerHTML = '<h3>改配图提示词</h3><div class="tt-prompt-editor"></div>';
    const fill = bindPromptEditor(box.querySelector('.tt-prompt-editor'));
    try {
        await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
    } finally {
        promptEditors.delete(fill);
    }
}

// 魔法棒「看定妆照」：角色长相档案只放在这个弹窗里，一张角色卡一套
let castPanel = null;

function getCastPanel() {
    if (castPanel) return castPanel;
    castPanel = document.createElement('div');
    castPanel.className = 'tt-autoimg tt-cast-popup';
    castPanel.innerHTML = '<h3>看定妆照</h3><small>这张角色卡里每个角色的脸、发型、身材定在这里，之后每张图都照这个画，衣服动作随剧情变。新开聊天也是这一套。英文可以直接改，也可以在「想怎么改」里写中文。</small><div id="tt-autoimg-cast"></div>';
    const box = castPanel.querySelector('#tt-autoimg-cast');
    box.addEventListener('click', onCastClick);
    box.addEventListener('change', onCastChange);
    return castPanel;
}

async function openCastPopup() {
    const context = ctx();
    if (!context?.callGenericPopup) { toast('info', '弹不出窗口'); return; }
    const panel = getCastPanel();
    renderCast();
    await context.callGenericPopup(panel, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
}

// 魔法棒「自动配图设置」：把扩展页「自动配图」那块内容借到弹窗里，关了再放回去（同一份，不重复绑定）
async function openSettingsPopup() {
    const context = ctx();
    const content = document.querySelector(`#${SETTINGS_ID} .inline-drawer-content`);
    if (!context?.callGenericPopup || !content) { toast('info', '弹不出窗口，去扩展页「自动配图」里改'); return; }
    const home = content.parentElement;
    const next = content.nextSibling;
    const display = content.style.display;
    const box = document.createElement('div');
    box.className = 'tt-autoimg tt-settings-popup';
    box.innerHTML = '<h3>自动配图设置</h3>';
    content.style.display = 'block';
    box.append(content);
    fillProfiles();
    try {
        await context.callGenericPopup(box, context.POPUP_TYPE.TEXT, '', { wide: true, large: true, okButton: '关闭', allowVerticalScrolling: true });
    } finally {
        home.insertBefore(content, next);
        content.style.display = display;
    }
}

// 本扩展在魔法棒里的项。贴底顺序在 wand-menu.js 的 OWN_WAND 里管
const WAND_ITEMS = [
    { id: WAND_ID, icon: 'fa-pen-to-square', text: '改配图提示词', open: openPromptPopup },
    { id: 'tt-cast-wand', icon: 'fa-id-badge', text: '看定妆照', open: openCastPopup },
    { id: 'tt-autoimg-settings-wand', icon: 'fa-sliders', text: '自动配图设置', open: openSettingsPopup },
];

function mountWandItem() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    for (const w of WAND_ITEMS) {
        if (document.getElementById(w.id)) continue;
        const item = document.createElement('div');
        item.id = w.id;
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = `<div class="fa-solid ${w.icon} extensionsMenuExtensionButton"></div><span>${w.text}</span>`;
        item.addEventListener('click', () => w.open());
        menu.appendChild(item);
    }
    return true;
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

    bindPromptEditor(document.querySelector(`#${SETTINGS_ID} .tt-prompt-editor`));
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
    const ready = () => mount() & watchChatImages() & mountWandItem();
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
    WAND_ITEMS.forEach((w) => document.getElementById(w.id)?.remove());
    castPanel = null;
    promptEditors.clear();
    document.getElementById(QUIET_STYLE_ID)?.remove();
    document.body?.classList.remove('tt-autoimg-quiet');
}

// 给电脑上的自测脚本用
export const __test = { cleanTags, plainText, parsePlan, buildPrompt, portraitPrompt, DEFAULT_PROMPT, REVISE_PROMPT, PRESETS, settings, presetText, cast };
