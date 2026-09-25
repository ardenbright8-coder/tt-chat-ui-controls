const KEY = 'chat-text-color';
const TARGET = 1000000;
let dispose;

export function initContextLock() {
    if (dispose) return;
    const context = globalThis.SillyTavern?.getContext?.();
    const slider = document.getElementById('openai_max_context');
    const counter = document.getElementById('openai_max_context_counter');
    if (!context?.chatCompletionSettings || !context.eventSource || !slider || !counter) return;
    const state = () => {
        const ctx = globalThis.SillyTavern.getContext();
        const config = ctx.extensionSettings[KEY] ??= {};
        if (typeof config.contextLockEnabled !== 'boolean') {
            config.contextLockEnabled = true;
            ctx.saveSettingsDebounced?.();
        }
        return { ctx, config };
    };
    const row = document.createElement('label');
    row.id = 'tt-context-lock';
    row.className = 'checkbox_label';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    const label = document.createElement('span');
    label.textContent = '固定上下文为 100 万（模型限制更低时从低）';
    row.append(toggle, label);
    counter.parentElement.insertAdjacentElement('afterend', row);
    const originalDisabled = [slider.disabled, counter.disabled];
    let active = true;
    function apply() {
        if (!active) return;
        const { ctx, config } = state();
        toggle.checked = config.contextLockEnabled;
        [slider, counter].forEach((el, i) => { el.disabled = config.contextLockEnabled || originalDisabled[i]; });
        if (!config.contextLockEnabled) return;
        // Respect the host limit; never silently unlock a smaller model.
        const max = Number(slider.max);
        const value = max > 0 ? Math.min(TARGET, max) : TARGET;
        const changed = Number(ctx.chatCompletionSettings.openai_max_context) !== value;
        ctx.chatCompletionSettings.openai_max_context = value;
        slider.value = String(value);
        counter.value = String(value);
        if (changed) ctx.saveSettingsDebounced?.();
    }
    toggle.addEventListener('change', () => {
        const { ctx, config } = state();
        config.contextLockEnabled = toggle.checked;
        ctx.saveSettingsDebounced?.();
        apply();
    });
    const subscriptions = [];
    for (const name of ['APP_READY', 'SETTINGS_LOADED', 'SETTINGS_LOADED_AFTER',
        'CHAT_CHANGED', 'OAI_PRESET_CHANGED_AFTER', 'CHATCOMPLETION_MODEL_CHANGED',
        'CHATCOMPLETION_SOURCE_CHANGED', 'GENERATION_AFTER_COMMANDS']) {
        const event = context.eventTypes?.[name];
        if (!event) continue;
        context.eventSource.on(event, apply);
        subscriptions.push(event);
    }
    // Host model changes use jQuery .trigger('input').
    const inputs = globalThis.jQuery?.('#openai_max_context, #openai_max_context_counter');
    inputs?.on('input.ttContextLock change.ttContextLock', apply);
    const observer = new MutationObserver(apply);
    observer.observe(slider, { attributes: true, attributeFilter: ['max'] });
    dispose = () => {
        active = false;
        subscriptions.forEach(event => context.eventSource.removeListener(event, apply));
        inputs?.off('.ttContextLock');
        observer.disconnect();
        [slider, counter].forEach((el, i) => { el.disabled = originalDisabled[i]; });
        row.remove();
        dispose = null;
    };
    apply();
}

export function cleanupContextLock() {
    dispose?.();
}
