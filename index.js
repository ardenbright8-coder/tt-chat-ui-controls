const EXTENSION_KEY = 'chat-text-color';

const COLOR_ROW_ID = 'chat-text-color-row';
const COLOR_PICKER_ID = 'chat-text-color-picker';

const FONT_ROW_ID = 'chat-text-font-row';
const FONT_SELECT_ID = 'chat-text-font-select';

const BG_BLUR_CONTROL_ID = 'background-image-blur-control';
const BG_BLUR_SLIDER_ID = 'background-image-blur-strength';
const BG_BLUR_COUNTER_ID = 'background-image-blur-strength-counter';

const COLOR_CSS_VAR = '--ChatTextColor';
const FONT_CSS_VAR = '--ChatTextFontFamily';
const BG_BLUR_CSS_VAR = '--BackgroundImageBlurPx';
const BG_SCALE_CSS_VAR = '--BackgroundImageScale';

const FONT_OPTIONS = [
    {
        value: 'theme',
        label: '跟随主题（默认）',
        family: 'inherit',
    },
    {
        value: 'wenyuan',
        label: '文渊宋体',
        family: 'var(--mor-font-main, "WenYuan Serif SC"), "Noto Serif SC", serif',
    },
    {
        value: 'noto-serif',
        label: '思源宋体 / Noto Serif SC',
        family: '"Noto Serif SC", "Source Han Serif SC", serif',
    },
    {
        value: 'lxgw-wenkai',
        label: '霞鹜文楷',
        family: '"LXGW WenKai GB", "LXGW WenKai", KaiTi, serif',
    },
    {
        value: 'stkaiti',
        label: '华文楷体',
        family: '"STKaiti", "华文楷体", KaiTi, serif',
    },
    {
        value: 'fzkaiti',
        label: '方正楷体简体',
        family: '"方正楷体简体", "FZKai-Z03", KaiTi, serif',
    },
    {
        value: 'fzxinkaiti',
        label: '方正新楷体_GBK',
        family: '"方正新楷体_GBK", "FZXinKai-Z03S", KaiTi, serif',
    },
    {
        value: 'hanyi-shusong',
        label: '汉仪书宋一简',
        family: '"汉仪书宋一简", "HYShuSongYiJ", serif',
    },
    {
        value: 'fz-beiwei',
        label: '方正北魏楷书_GBK',
        family: '"方正北魏楷书_GBK", "FZBeiWeiKaiShu-S19S", KaiTi, serif',
    },
    {
        value: 'aa-yingluo',
        label: 'Aa恋恋樱落',
        family: '"Aa恋恋樱落", "AaLianlianyingluo", KaiTi, cursive',
    },
    {
        value: 'hanyi-shikai',
        label: '汉仪诗楷简',
        family: '"汉仪诗楷简", "HanYSKJG", KaiTi, serif',
    },
];

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

function applyFontPreset(value) {
    const option = getFontOption(value);
    document.documentElement.style.setProperty(FONT_CSS_VAR, option.family);
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
    row.title = '只更换聊天消息正文的字体。若某个字体没有被主题、扩展或系统加载，会自动回退到后备字体。';

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

    select.value = applyFontPreset(settings.fontPreset);
    row.append(label, select);
    colorRow.insertAdjacentElement('afterend', row);

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
