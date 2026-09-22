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

    // 常用阅读 / 宋体
    { value: 'source-han-serif', file: 'sourcehanserif.otf', format: 'opentype', label: '思源宋体（常用阅读）', face: 'TT Source Han Serif CN', family: '"TT Source Han Serif CN", serif' },
    { value: 'chill-jinshu-song', file: 'chilljinshu.otf', format: 'opentype', label: '寒蝉锦书宋（温润宋体）', face: 'TT Chill Jinshu Song', family: '"TT Chill Jinshu Song", serif' },
    { value: 'wenjin-mincho', file: 'wenjin.ttf', format: 'truetype', label: '文津宋体（古典正文）', face: 'TT WenJin Mincho', family: '"TT WenJin Mincho", serif' },

    // 楷 / 手写阅读
    { value: 'lxgw-wenkai-gb', file: 'wenkai.woff2', label: '霞鹜文楷 GB（舒展）', face: 'TT LXGW WenKai GB', family: '"TT LXGW WenKai GB", serif' },
    { value: 'lxgw-zhenkai-gb', file: 'zhenkai.woff2', label: '霞鹜臻楷 GB（较厚实）', face: 'TT LXGW ZhenKai GB', family: '"TT LXGW ZhenKai GB", serif' },
    { value: 'qingsong-handwriting', file: 'qingsong.ttf', format: 'truetype', label: '清松手写体1（圆润）', face: 'TT Qingsong Handwriting', family: '"TT Qingsong Handwriting", cursive' },
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

let bgBlurSliderChangeHandler = null;
let bgBlurCounterCommitHandler = null;
let bgBlurCounterKeyHandler = null;
let mobileTouchGuardCleanup = null;

const MOBILE_GESTURE_THRESHOLD = 10;
const MOBILE_SLIDER_DOMINANCE = 1.2;

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
        setFontHint('跟随主题。其他八款字体已随扩展提供，无需系统安装。');
        return option.value;
    }

    setFontHint(`正在加载${option.label}，首次使用请稍候…`);
    if (!fontLoads.has(option.value)) {
        const promise = Promise.resolve().then(() => {
            if (!globalThis.FontFace || !document.fonts) throw new Error('Font loading API unavailable');
            const url = new URL(`./fonts/${option.file}`, import.meta.url);
            const face = new FontFace(option.face, `url("${url.href}") format("${option.format || 'woff2'}")`, { style: 'normal', weight: '400' });
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

function isCoarsePointerEnvironment() {
    return globalThis.matchMedia?.('(pointer: coarse)')?.matches === true;
}

function installMobileTouchGuards() {
    if (mobileTouchGuardCleanup || !isCoarsePointerEnvironment()) {
        return;
    }

    const activeRanges = new Map();
    const activeSwitches = new Map();
    const syntheticEvents = new WeakSet();

    const dispatchSynthetic = (element, type) => {
        const event = new Event(type, { bubbles: true });
        syntheticEvents.add(event);
        element.dispatchEvent(event);
    };

    const isTouchRange = (element) =>
        element instanceof HTMLInputElement
        && element.type === 'range'
        && !element.disabled;

    const resolveSettingsCheckbox = (target) => {
        if (!(target instanceof Element)) return null;
        if (target.closest('a, button, .right_menu_button, .fa-circle-info')) return null;

        const label = target.closest('#user-settings-block label.checkbox_label');
        if (!label) return null;

        const direct = label.querySelector(':scope > input[type="checkbox"]');
        if (!(direct instanceof HTMLInputElement) || direct.disabled || direct.classList.contains('displayNone')) {
            return null;
        }

        return { label, checkbox: direct };
    };

    const decorateSettingsCheckboxes = (root = document) => {
        const checkboxes = root.querySelectorAll?.(
            '#user-settings-block label.checkbox_label > input[type="checkbox"]:not(.displayNone)',
        ) ?? [];

        for (const checkbox of checkboxes) {
            if (!(checkbox instanceof HTMLInputElement) || checkbox.dataset.ttTouchSwitch === '1') {
                continue;
            }

            const label = checkbox.closest('label.checkbox_label');
            if (!label) continue;

            checkbox.dataset.ttTouchSwitch = '1';
            checkbox.classList.add('tt-touch-switch-input');
            label.classList.add('tt-touch-switch-label');

            const visual = document.createElement('span');
            visual.className = 'tt-touch-switch-visual';
            visual.setAttribute('aria-hidden', 'true');
            checkbox.insertAdjacentElement('afterend', visual);
        }
    };

    const undecorateSettingsCheckboxes = () => {
        document.querySelectorAll('#user-settings-block .tt-touch-switch-visual').forEach((element) => element.remove());
        document.querySelectorAll('#user-settings-block .tt-touch-switch-label').forEach((element) => {
            element.classList.remove('tt-touch-switch-label', 'tt-touch-preview-on', 'tt-touch-preview-off', 'tt-touch-switch-dragging');
        });
        document.querySelectorAll('#user-settings-block .tt-touch-switch-input').forEach((element) => {
            element.classList.remove('tt-touch-switch-input');
            delete element.dataset.ttTouchSwitch;
        });
    };

    const decimalPlaces = (value) => {
        const text = String(value);
        const eIndex = text.toLowerCase().indexOf('e-');
        if (eIndex >= 0) return Number(text.slice(eIndex + 2)) || 0;
        const dot = text.indexOf('.');
        return dot < 0 ? 0 : text.length - dot - 1;
    };

    const normalizeRangeValue = (slider, rawValue) => {
        const min = Number(slider.min || 0);
        const max = Number(slider.max || 100);
        const finiteRaw = Number.isFinite(rawValue) ? rawValue : Number(slider.value);
        const clamped = Math.min(max, Math.max(min, finiteRaw));

        if (!slider.step || slider.step === 'any') {
            return clamped;
        }

        const step = Number(slider.step);
        if (!Number.isFinite(step) || step <= 0) {
            return clamped;
        }

        const stepped = min + Math.round((clamped - min) / step) * step;
        const precision = Math.min(12, Math.max(decimalPlaces(min), decimalPlaces(step)));
        return Number(stepped.toFixed(precision));
    };

    const clearSwitchPreview = (state) => {
        state.label.classList.remove('tt-touch-preview-on', 'tt-touch-preview-off', 'tt-touch-switch-dragging');
    };

    const previewSwitch = (state, nextValue) => {
        state.label.classList.toggle('tt-touch-preview-on', nextValue);
        state.label.classList.toggle('tt-touch-preview-off', !nextValue);
        state.label.classList.add('tt-touch-switch-dragging');
    };

    const onPointerDown = (event) => {
        if (event.pointerType === 'mouse' || !event.isPrimary) {
            return;
        }

        const range = event.target;
        if (isTouchRange(range)) {
            const startValue = Number(range.value);
            activeRanges.set(event.pointerId, {
                slider: range,
                startX: event.clientX,
                startY: event.clientY,
                startValue,
                currentValue: startValue,
                mode: 'pending',
            });
            return;
        }

        const resolved = resolveSettingsCheckbox(event.target);
        if (!resolved) return;

        const { label, checkbox } = resolved;
        activeSwitches.set(event.pointerId, {
            label,
            checkbox,
            startX: event.clientX,
            startY: event.clientY,
            startChecked: checkbox.checked,
            nextChecked: checkbox.checked,
            mode: 'pending',
        });
    };

    const onPointerMove = (event) => {
        const rangeState = activeRanges.get(event.pointerId);
        if (rangeState) {
            const dx = event.clientX - rangeState.startX;
            const dy = event.clientY - rangeState.startY;

            if (rangeState.mode === 'pending') {
                if (Math.hypot(dx, dy) < MOBILE_GESTURE_THRESHOLD) {
                    rangeState.slider.value = String(rangeState.startValue);
                    return;
                }

                if (Math.abs(dx) > Math.abs(dy) * MOBILE_SLIDER_DOMINANCE) {
                    rangeState.mode = 'slider';
                    rangeState.slider.classList.add('tt-touch-slider-dragging');
                } else {
                    rangeState.mode = 'scroll';
                    rangeState.slider.value = String(rangeState.startValue);
                    return;
                }
            }

            if (rangeState.mode === 'scroll') {
                rangeState.slider.value = String(rangeState.startValue);
                return;
            }

            if (rangeState.mode !== 'slider') return;

            if (event.cancelable) event.preventDefault();

            const rect = rangeState.slider.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const min = Number(rangeState.slider.min || 0);
            const max = Number(rangeState.slider.max || 100);
            const span = max - min;
            const direction = getComputedStyle(rangeState.slider).direction === 'rtl' ? -1 : 1;
            const next = normalizeRangeValue(
                rangeState.slider,
                rangeState.startValue + direction * (dx / width) * span,
            );

            rangeState.currentValue = next;
            rangeState.slider.value = String(next);
            dispatchSynthetic(rangeState.slider, 'input');
            return;
        }

        const switchState = activeSwitches.get(event.pointerId);
        if (!switchState) return;

        const dx = event.clientX - switchState.startX;
        const dy = event.clientY - switchState.startY;

        if (switchState.mode === 'pending') {
            if (Math.hypot(dx, dy) < MOBILE_GESTURE_THRESHOLD) {
                return;
            }

            if (Math.abs(dx) > Math.abs(dy) * MOBILE_SLIDER_DOMINANCE) {
                switchState.mode = 'switch';
            } else {
                switchState.mode = 'scroll';
                clearSwitchPreview(switchState);
                return;
            }
        }

        if (switchState.mode === 'scroll') {
            clearSwitchPreview(switchState);
            return;
        }

        if (switchState.mode !== 'switch') return;

        if (event.cancelable) event.preventDefault();

        // Right = ON, left = OFF. The checkbox itself is not changed until pointerup.
        switchState.nextChecked = dx > 0;
        previewSwitch(switchState, switchState.nextChecked);
    };

    const finishRangeGesture = (event, cancelled = false) => {
        const state = activeRanges.get(event.pointerId);
        if (!state) return false;

        activeRanges.delete(event.pointerId);
        state.slider.classList.remove('tt-touch-slider-dragging');

        if (!cancelled && state.mode === 'slider') {
            state.slider.value = String(state.currentValue);
            dispatchSynthetic(state.slider, 'change');
        } else {
            state.slider.value = String(state.startValue);
        }

        return true;
    };

    const finishSwitchGesture = (event, cancelled = false) => {
        const state = activeSwitches.get(event.pointerId);
        if (!state) return false;

        activeSwitches.delete(event.pointerId);
        const dx = event.clientX - state.startX;
        clearSwitchPreview(state);

        const commitDistance = 18;
        if (cancelled || state.mode !== 'switch' || Math.abs(dx) < commitDistance) {
            state.checkbox.checked = state.startChecked;
            return true;
        }

        const nextChecked = dx > 0;
        const changed = state.startChecked !== nextChecked;
        state.checkbox.checked = nextChecked;

        if (changed) {
            dispatchSynthetic(state.checkbox, 'input');
            dispatchSynthetic(state.checkbox, 'change');
        }

        return true;
    };

    const onPointerUp = (event) => {
        if (finishRangeGesture(event, false)) return;
        finishSwitchGesture(event, false);
    };

    const onPointerCancel = (event) => {
        if (finishRangeGesture(event, true)) return;
        finishSwitchGesture(event, true);
    };

    const onRangeInputCapture = (event) => {
        if (syntheticEvents.has(event) || !isTouchRange(event.target)) {
            return;
        }

        const state = [...activeRanges.values()].find((item) => item.slider === event.target);
        if (!state) return;

        event.stopImmediatePropagation();
        event.target.value = String(state.mode === 'slider' ? state.currentValue : state.startValue);
    };

    const onSettingsCheckboxClickCapture = (event) => {
        const resolved = resolveSettingsCheckbox(event.target);
        if (!resolved || !event.isTrusted || event.detail === 0) {
            return;
        }

        // Pointer taps never toggle settings checkboxes on mobile.
        // A deliberate horizontal swipe dispatches synthetic input/change instead.
        event.preventDefault();
        event.stopImmediatePropagation();
    };

    decorateSettingsCheckboxes();

    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node instanceof Element) {
                    decorateSettingsCheckboxes(node.matches('#user-settings-block') ? node : node);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('input', onRangeInputCapture, true);
    document.addEventListener('click', onSettingsCheckboxClickCapture, true);

    mobileTouchGuardCleanup = () => {
        activeRanges.clear();
        activeSwitches.clear();
        observer.disconnect();
        undecorateSettingsCheckboxes();

        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('pointermove', onPointerMove, true);
        document.removeEventListener('pointerup', onPointerUp, true);
        document.removeEventListener('pointercancel', onPointerCancel, true);
        document.removeEventListener('input', onRangeInputCapture, true);
        document.removeEventListener('click', onSettingsCheckboxClickCapture, true);

        mobileTouchGuardCleanup = null;
    };
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
    row.title = '只更换聊天消息正文的字体。八款开源字体随扩展提供，无需系统安装或付费。';

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
    hint.textContent = '八款字体随扩展提供；首次选择需等待本地字体加载。';

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

    const previewValue = (rawValue) => {
        const value = applyBackgroundImageBlur(rawValue);
        slider.value = String(value);
        counter.value = String(value);
        return value;
    };

    const commitValue = (rawValue) => {
        const value = previewValue(rawValue);
        settings.backgroundImageBlurStrength = value;
        context.saveSettingsDebounced?.();
    };

    bgBlurSliderHandler = () => previewValue(slider.value);
    bgBlurSliderChangeHandler = () => commitValue(slider.value);

    bgBlurCounterHandler = () => {
        if (counter.value === '') return;
        previewValue(counter.value);
    };

    bgBlurCounterCommitHandler = () => {
        if (counter.value === '') {
            counter.value = String(settings.backgroundImageBlurStrength);
            return;
        }
        commitValue(counter.value);
    };

    bgBlurCounterKeyHandler = (event) => {
        if (event.key === 'Enter') {
            counter.blur();
        }
    };

    slider.addEventListener('input', bgBlurSliderHandler);
    slider.addEventListener('change', bgBlurSliderChangeHandler);
    counter.addEventListener('input', bgBlurCounterHandler);
    counter.addEventListener('change', bgBlurCounterCommitHandler);
    counter.addEventListener('keydown', bgBlurCounterKeyHandler);

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
    startMessageBannerFix();
    installMobileTouchGuards();
    if (initialized) {
        mountUi();
        return;
    }

    initialized = true;
    startMountRetry();
}

export async function cleanup() {
    stopMessageBannerFix?.();
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
    if (slider && bgBlurSliderChangeHandler) {
        slider.removeEventListener('change', bgBlurSliderChangeHandler);
    }

    if (counter && bgBlurCounterHandler) {
        counter.removeEventListener('input', bgBlurCounterHandler);
    }
    if (counter && bgBlurCounterCommitHandler) {
        counter.removeEventListener('change', bgBlurCounterCommitHandler);
    }
    if (counter && bgBlurCounterKeyHandler) {
        counter.removeEventListener('keydown', bgBlurCounterKeyHandler);
    }

    mobileTouchGuardCleanup?.();

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
    bgBlurSliderChangeHandler = null;
    bgBlurCounterHandler = null;
    bgBlurCounterCommitHandler = null;
    bgBlurCounterKeyHandler = null;
    originalBlurLabel = null;
    originalBlurInfoTitle = null;
    initialized = false;
}


// Message banners: use each message's original portrait and disable avatar zoom.
let stopMessageBannerFix = null;

function bannerOriginalUrl(source, base = document.baseURI) {
    try {
        const url = new URL(source, base);
        if (url.origin !== new URL(base).origin || !url.pathname.endsWith('/thumbnail')) return null;
        const type = url.searchParams.get('type');
        const file = url.searchParams.get('file');
        if (!file || /[/\\\\]/.test(file) || !['avatar', 'persona'].includes(type)) return null;
        const directory = type === 'avatar' ? 'characters/' : 'User%20Avatars/';
        const prefix = url.pathname.slice(0, -'thumbnail'.length);
        const result = new URL(prefix + directory + encodeURIComponent(file), url);
        if (url.searchParams.has('t')) result.searchParams.set('t', url.searchParams.get('t'));
        return result.href;
    } catch {
        return null;
    }
}

function startMessageBannerFix() {
    if (stopMessageBannerFix) return;
    const selector = '#chat .mes > .mesAvatarWrapper > .avatar > img';
    const originals = new WeakMap();
    const pending = new WeakMap();
    const probes = new Set();
    let active = true;
    let chat = null;

    const style = document.createElement('style');
    style.textContent = `
#chat .mes > .mesAvatarWrapper > .avatar,
#chat .mes > .mesAvatarWrapper > .avatar * {
    pointer-events: none !important;
    cursor: default !important;
}`;
    document.head.append(style);

    // Capture also blocks programmatic DOM clicks before the native delegated handler.
    const blockZoom = (event) => {
        if (event.target?.closest?.('#chat .mes > .mesAvatarWrapper > .avatar')) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    };
    document.addEventListener('click', blockZoom, true);

    const upgrade = (img) => {
        if (!active || !img.matches(selector)) return;
        const source = img.getAttribute('src');
        const target = source && bannerOriginalUrl(source);
        if (!target || pending.get(img) === source) return;
        pending.set(img, source);
        const probe = new Image();
        probes.add(probe);
        const finish = () => {
            probes.delete(probe);
            probe.onload = probe.onerror = null;
        };
        probe.onload = () => {
            if (active && img.isConnected && img.matches(selector)
                && img.getAttribute('src') === source && probe.naturalWidth > 0) {
                originals.set(img, { source, target });
                img.setAttribute('src', target);
            }
            finish();
        };
        // Keep the working thumbnail if the original is unavailable.
        probe.onerror = finish;
        probe.src = target;
    };
    const scan = (node) => {
        if (node.nodeType !== 1) return;
        if (node.matches(selector)) upgrade(node);
        // Streaming text cannot contain the direct avatar wrapper.
        if (node.closest('.mes_text')) return;
        node.querySelectorAll(selector).forEach(upgrade);
    };
    const observer = new MutationObserver((records) => {
        if (!chat) {
            attach();
            return;
        }
        for (const record of records) {
            if (record.type === 'attributes') upgrade(record.target);
            else record.addedNodes.forEach(scan);
        }
    });
    const attach = () => {
        chat = document.getElementById('chat');
        if (!chat) return;
        observer.disconnect();
        observer.observe(chat, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
        scan(chat);
    };
    attach();
    if (!chat) observer.observe(document.body, { childList: true, subtree: true });

    stopMessageBannerFix = () => {
        active = false;
        observer.disconnect();
        document.removeEventListener('click', blockZoom, true);
        style.remove();
        for (const probe of probes) {
            probe.onload = probe.onerror = null;
            probe.removeAttribute('src');
        }
        probes.clear();
        document.querySelectorAll(selector).forEach((img) => {
            const original = originals.get(img);
            if (original && img.getAttribute('src') === original.target) {
                img.setAttribute('src', original.source);
            }
        });
        stopMessageBannerFix = null;
    };
}

