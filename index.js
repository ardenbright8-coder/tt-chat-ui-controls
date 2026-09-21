const EXTENSION_KEY = 'chat-text-color';

const COLOR_ROW_ID = 'chat-text-color-row';
const COLOR_PICKER_ID = 'chat-text-color-picker';

const FONT_ROW_ID = 'chat-text-font-row';
const FONT_SELECT_ID = 'chat-text-font-select';
const FONT_HINT_ID = 'chat-text-font-hint';

const BG_BLUR_CONTROL_ID = 'background-image-blur-control';
const BG_BLUR_SLIDER_ID = 'background-image-blur-strength';
const BG_BLUR_COUNTER_ID = 'background-image-blur-strength-counter';

const COLOR_CSS_VAR = '--ChatTextColor';
const FONT_CSS_VAR = '--ChatTextFontFamily';
const BG_BLUR_CSS_VAR = '--BackgroundImageBlurPx';
const BG_SCALE_CSS_VAR = '--BackgroundImageScale';

const FONT_OPTIONS = [
    { value: 'theme', label: '跟随主题（默认）', family: 'inherit' },
    { value: 'lxgw-wenkai-gb', file: 'wenkai.woff2', label: '霞鹜文楷 GB（舒展）', face: 'TT LXGW WenKai GB', family: '"TT LXGW WenKai GB", serif' },
    { value: 'lxgw-zhenkai-gb', file: 'zhenkai.woff2', label: '霞鹜臻楷 GB（较厚实）', face: 'TT LXGW ZhenKai GB', family: '"TT LXGW ZhenKai GB", serif' },
    { value: 'xiaolai', file: 'xiaolai.woff2', label: '小赖字体（圆润手写）', face: 'TT Xiaolai', family: '"TT Xiaolai", sans-serif' },
    { value: 'yozai', file: 'yozai.woff2', label: '悠哉字体（轻松手写）', face: 'TT Yozai', family: '"TT Yozai", serif' },
];

// Load only the chosen bundled font. Keep the previous font on failure.
const fontLoads = new Map();
let fontRequest = 0;

let retryTimer = null;
let initialized = false;
let colorChangeHandler = null;
let fontChangeHandler = null;
let bgBlurSliderHandler = null;
let bgBlurCounterHandler = null;
let originalBlurLabel = null;
let originalBlurInfoTitle = null;

function getContext() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function getCurrentMainTextColor() {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue('--SmartThemeBodyColor')
        .trim();

    return value || 'rgba(220, 220, 210, 1)';
}

function clampBlur(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(30, Math.max(0, Math.round(number)));
}

function getFontOption(value) {
    return FONT_OPTIONS.find((item) => item.value === value) ?? FONT_OPTIONS[0];
}

function getExtensionState() {
    const context = getContext();

    if (!context?.extensionSettings) {
        return null;
    }

    let changed = false;

    if (!context.extensionSettings[EXTENSION_KEY]) {
        context.extensionSettings[EXTENSION_KEY] = {};
        changed = true;
    }

    const settings = context.extensionSettings[EXTENSION_KEY];

    if (!settings.color) {
        settings.color = getCurrentMainTextColor();
        changed = true;
    }

    if (!FONT_OPTIONS.some((item) => item.value === settings.fontPreset)) {
        settings.fontPreset = 'theme';
        changed = true;
    }

    if (!Number.isFinite(Number(settings.backgroundImageBlurStrength))) {
        settings.backgroundImageBlurStrength = 0;
        changed = true;
    } else {
        settings.backgroundImageBlurStrength = clampBlur(settings.backgroundImageBlurStrength);
    }

    if ('chatBlurStrength' in settings) {
        delete settings.chatBlurStrength;
        changed = true;
    }

    if (changed) {
        context.saveSettingsDebounced?.();
    }

    return { context, settings };
}

function applyColor(color) {
    if (!color) return;
    document.documentElement.style.setProperty(COLOR_CSS_VAR, color);
}

function setFontHint(text) {
    const hint = document.getElementById(FONT_HINT_ID);
    if (hint) hint.textContent = text;
}

function applyFontPreset(value) {
    const option = getFontOption(value);
    const request = ++fontRequest;
    if (!option.face) {
        document.documentElement.style.setProperty(FONT_CSS_VAR, 'inherit');
        setFontHint('跟随主题。其他四款字体已随扩展提供，无需付费。');
        return option.value;
    }

    setFontHint(`正在加载${option.label}，首次使用请稍候…`);
    if (!fontLoads.has(option.value)) {
        const promise = Promise.resolve().then(() => {
            if (!globalThis.FontFace || !document.fonts) throw new Error('Font loading API unavailable');
            const url = new URL(`./fonts/${option.file}`, import.meta.url);
            const face = new FontFace(option.face, `url("${url.href}") format("woff2")`, { style: 'normal', weight: '400' });
            return face.load();
        }).then((face) => {
            document.fonts.add(face);
            return face;
        });
        fontLoads.set(option.value, promise);
    }
    fontLoads.get(option.value).then(() => {
        if (request !== fontRequest) return;
        document.documentElement.style.setProperty(FONT_CSS_VAR, option.family);
        const sample = document.querySelector('#chat .mes .mes_text p, #chat .mes .mes_text');
        const overridden = sample && !getComputedStyle(sample).fontFamily.includes(option.face);
        setFontHint(overridden ? '字体已加载，但正文样式仍被主题覆盖。' : `${option.label}已加载；聊天正文已切换。`);
    }).catch(() => {
        fontLoads.delete(option.value);
        if (request !== fontRequest) return;
        setFontHint('字体加载失败，保留原字体。请确认扩展更新完整；重选此字体可重试。');
    });
    return option.value;
}

function applyBackgroundImageBlur(value) {
    const normalized = clampBlur(value);
    const scale = 1 + normalized * 0.002;

    document.documentElement.style.setProperty(BG_BLUR_CSS_VAR, `${normalized}px`);
    document.documentElement.style.setProperty(BG_SCALE_CSS_VAR, String(scale));

    return normalized;
}

function mountColorPicker(state) {
    if (document.getElementById(COLOR_ROW_ID)) {
        return true;
    }

    const block = document.getElementById('color-picker-block');
    const quotePicker = document.getElementById('quote-color-picker');

    if (!block || !quotePicker) {
        return false;
    }

    const { context, settings } = state;

    const row = document.createElement('div');
    row.id = COLOR_ROW_ID;
    row.className = 'flex-container';
    row.title = '只控制聊天消息正文颜色，不影响菜单、按钮、角色名、时间戳、推理面板和输入框。';

    const picker = document.createElement('toolcool-color-picker');
    picker.id = COLOR_PICKER_ID;
    picker.setAttribute('color', settings.color);

    const label = document.createElement('span');
    label.textContent = '聊天正文颜色';

    row.append(picker, label);

    const quoteRow = quotePicker.closest('.flex-container');
    if (quoteRow?.parentElement === block) {
        quoteRow.insertAdjacentElement('afterend', row);
    } else {
        block.appendChild(row);
    }

    colorChangeHandler = (event) => {
        const rgba = event?.detail?.rgba;
        if (!rgba) return;

        settings.color = rgba;
        applyColor(rgba);
        context.saveSettingsDebounced?.();
    };

    picker.addEventListener('change', colorChangeHandler);
    return true;
}

function mountFontSelector(state) {
    if (document.getElementById(FONT_ROW_ID)) {
        return true;
    }

    const block = document.getElementById('color-picker-block');
    const colorRow = document.getElementById(COLOR_ROW_ID);

    if (!block || !colorRow) {
        return false;
    }

    const { context, settings } = state;

    const row = document.createElement('div');
    row.id = FONT_ROW_ID;
    row.className = 'flex-container';
    row.title = '只更换聊天消息正文的字体。四款开源字体随扩展提供，无需系统安装或付费。';

    const label = document.createElement('span');
    label.textContent = '聊天正文字体';

    const select = document.createElement('select');
    select.id = FONT_SELECT_ID;
    select.className = 'text_pole';

    for (const option of FONT_OPTIONS) {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        select.appendChild(element);
    }

    const hint = document.createElement('small');
    hint.id = FONT_HINT_ID;
    hint.textContent = '四款字体随扩展提供；首次选择需等待本地字体加载。';

    select.value = getFontOption(settings.fontPreset).value;

    const right = document.createElement('div');
    right.className = 'chat-font-select-stack';
    right.append(select, hint);

    row.append(label, right);
    colorRow.insertAdjacentElement('afterend', row);
    applyFontPreset(settings.fontPreset);

    fontChangeHandler = () => {
        settings.fontPreset = applyFontPreset(select.value);
        context.saveSettingsDebounced?.();
    };

    select.addEventListener('change', fontChangeHandler);
    return true;
}

function renameNativeBlurLabel() {
    const nativeSlider = document.getElementById('blur_strength');
    const nativeControl = nativeSlider?.closest('.alignitemscenter');
    const label = nativeControl?.querySelector('small > span');
    const info = nativeControl?.querySelector('small .fa-circle-info');

    if (!label) return;

    if (originalBlurLabel === null) {
        originalBlurLabel = label.textContent;
    }
    if (info && originalBlurInfoTitle === null) {
        originalBlurInfoTitle = info.getAttribute('title');
    }

    label.textContent = 'UI 模糊强度';
    if (info) {
        info.title = '控制设置窗口、弹窗、顶部栏、输入区等前端 UI 的毛玻璃；不负责底层背景图片。';
    }
}

function mountBackgroundBlurControl(state) {
    if (document.getElementById(BG_BLUR_CONTROL_ID)) {
        renameNativeBlurLabel();
        return true;
    }

    const nativeSlider = document.getElementById('blur_strength');
    const nativeControl = nativeSlider?.closest('.alignitemscenter');
    const container = nativeControl?.parentElement;

    if (!nativeSlider || !nativeControl || !container) {
        return false;
    }

    const { context, settings } = state;
    const initialValue = applyBackgroundImageBlur(settings.backgroundImageBlurStrength);

    const control = document.createElement('div');
    control.id = BG_BLUR_CONTROL_ID;
    control.className = 'alignitemscenter flex-container flexFlowColumn flexBasis48p flexGrow flexShrink gap0';

    const small = document.createElement('small');
    const label = document.createElement('span');
    label.textContent = '背景图片模糊强度';

    const info = document.createElement('div');
    info.className = 'fa-solid fa-circle-info opacity50p';
    info.title = '只模糊最底层背景图片。聊天正文卡片和设置/菜单等 UI 不跟着变化。0 最清晰，30 最模糊。';

    small.append(label, info);

    const slider = document.createElement('input');
    slider.className = 'neo-range-slider';
    slider.type = 'range';
    slider.id = BG_BLUR_SLIDER_ID;
    slider.name = BG_BLUR_SLIDER_ID;
    slider.min = '0';
    slider.max = '30';
    slider.step = '1';
    slider.value = String(initialValue);

    const counter = document.createElement('input');
    counter.className = 'neo-range-input';
    counter.type = 'number';
    counter.id = BG_BLUR_COUNTER_ID;
    counter.min = '0';
    counter.max = '30';
    counter.step = '1';
    counter.value = String(initialValue);
    counter.setAttribute('data-for', BG_BLUR_SLIDER_ID);

    control.append(small, slider, counter);
    nativeControl.insertAdjacentElement('afterend', control);

    const saveValue = (rawValue) => {
        const value = applyBackgroundImageBlur(rawValue);
        slider.value = String(value);
        counter.value = String(value);
        settings.backgroundImageBlurStrength = value;
        context.saveSettingsDebounced?.();
    };

    bgBlurSliderHandler = () => saveValue(slider.value);
    bgBlurCounterHandler = () => {
        if (counter.value === '') return;
        saveValue(counter.value);
    };

    slider.addEventListener('input', bgBlurSliderHandler);
    counter.addEventListener('input', bgBlurCounterHandler);
    counter.addEventListener('change', bgBlurCounterHandler);

    renameNativeBlurLabel();
    return true;
}

function mountUi() {
    const state = getExtensionState();
    if (!state) return false;

    applyColor(state.settings.color);
    applyFontPreset(state.settings.fontPreset);
    applyBackgroundImageBlur(state.settings.backgroundImageBlurStrength);

    const colorMounted = mountColorPicker(state);
    const fontMounted = colorMounted && mountFontSelector(state);
    const blurMounted = mountBackgroundBlurControl(state);

    return colorMounted && fontMounted && blurMounted;
}

function startMountRetry() {
    if (mountUi()) return;

    if (retryTimer !== null) {
        globalThis.clearInterval(retryTimer);
    }

    let attempts = 0;
    retryTimer = globalThis.setInterval(() => {
        attempts += 1;

        if (mountUi() || attempts >= 60) {
            globalThis.clearInterval(retryTimer);
            retryTimer = null;
        }
    }, 250);
}

export async function init() {
    if (initialized) {
        mountUi();
        return;
    }

    initialized = true;
    startMountRetry();
}

export async function cleanup() {
    fontRequest += 1; // Ignore any in-flight font completion after disable.
    fontLoads.clear();
    if (retryTimer !== null) {
        globalThis.clearInterval(retryTimer);
        retryTimer = null;
    }

    const picker = document.getElementById(COLOR_PICKER_ID);
    if (picker && colorChangeHandler) {
        picker.removeEventListener('change', colorChangeHandler);
    }

    const fontSelect = document.getElementById(FONT_SELECT_ID);
    if (fontSelect && fontChangeHandler) {
        fontSelect.removeEventListener('change', fontChangeHandler);
    }

    const slider = document.getElementById(BG_BLUR_SLIDER_ID);
    const counter = document.getElementById(BG_BLUR_COUNTER_ID);

    if (slider && bgBlurSliderHandler) {
        slider.removeEventListener('input', bgBlurSliderHandler);
    }

    if (counter && bgBlurCounterHandler) {
        counter.removeEventListener('input', bgBlurCounterHandler);
        counter.removeEventListener('change', bgBlurCounterHandler);
    }

    const nativeSlider = document.getElementById('blur_strength');
    const nativeControl = nativeSlider?.closest('.alignitemscenter');
    const nativeLabel = nativeControl?.querySelector('small > span');
    const nativeInfo = nativeControl?.querySelector('small .fa-circle-info');

    if (nativeLabel && originalBlurLabel !== null) {
        nativeLabel.textContent = originalBlurLabel;
    }
    if (nativeInfo) {
        if (originalBlurInfoTitle === null) {
            nativeInfo.removeAttribute('title');
        } else {
            nativeInfo.setAttribute('title', originalBlurInfoTitle);
        }
    }

    document.getElementById(COLOR_ROW_ID)?.remove();
    document.getElementById(FONT_ROW_ID)?.remove();
    document.getElementById(BG_BLUR_CONTROL_ID)?.remove();

    document.documentElement.style.removeProperty(COLOR_CSS_VAR);
    document.documentElement.style.removeProperty(FONT_CSS_VAR);
    document.documentElement.style.removeProperty(BG_BLUR_CSS_VAR);
    document.documentElement.style.removeProperty(BG_SCALE_CSS_VAR);

    colorChangeHandler = null;
    fontChangeHandler = null;
    bgBlurSliderHandler = null;
    bgBlurCounterHandler = null;
    originalBlurLabel = null;
    originalBlurInfoTitle = null;
    initialized = false;
}
