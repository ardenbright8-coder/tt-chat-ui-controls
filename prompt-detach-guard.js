// Guard only prompt-list detach actions. Never intercept enable/edit controls.
let cleanupGuard;
const SELECTOR = '.prompt-manager-detach-action';
export function initPromptDetachGuard() {
    if (cleanupGuard) return;
    let press = null;
    let allowed = null;
    let modal = null;
    const buttonFor = target => target?.closest?.(SELECTOR);
    const cancelPress = () => {
        if (!press) return;
        press.button.classList.remove('tt-detach-holding');
        press = null;
    };
    const close = () => { modal?.remove(); modal = null; };
    const ask = button => {
        if (modal || !button.isConnected) return;
        const entry = button.closest('[data-pm-identifier]');
        const id = entry?.dataset.pmIdentifier;
        const settings = globalThis.SillyTavern?.getContext?.().chatCompletionSettings;
        const name = settings?.prompts?.find(p => p.identifier === id)?.name || '这个条目';
        const preset = settings?.preset_settings_openai;
        const order = JSON.stringify(settings?.prompt_order);
        const dialog = document.createElement('dialog');
        dialog.className = 'tt-detach-confirm';
        const message = document.createElement('p');
        message.textContent = '确定从当前预设列表移除「' + name + '」？条目正文仍保留。';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'menu_button';
        cancel.textContent = '取消';
        cancel.autofocus = true;
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'menu_button';
        confirm.textContent = '确认移除';
        cancel.addEventListener('click', close);
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
        confirm.addEventListener('click', () => {
            const now = globalThis.SillyTavern?.getContext?.().chatCompletionSettings;
            close();
            // A changed preset/list invalidates a pending confirmation.
            if (!button.isConnected || button.closest('[data-pm-identifier]')?.dataset.pmIdentifier !== id
                || now?.preset_settings_openai !== preset || JSON.stringify(now?.prompt_order) !== order) return;
            allowed = button;
            try { button.click(); } finally { allowed = null; }
        });
        dialog.append(message, cancel, confirm);
        document.body.append(dialog);
        modal = dialog;
        dialog.showModal();
        cancel.focus();
    };
    const down = event => {
        cancelPress();
        const button = buttonFor(event.target);
        if (!button || event.button !== 0 || event.isPrimary === false || modal) return;
        press = { button, pointer: event.pointerId, x: event.clientX, y: event.clientY, start: performance.now() };
        button.classList.add('tt-detach-holding');
    };
    const move = event => {
        if (press?.pointer === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
    };
    const up = event => {
        if (!press || press.pointer !== event.pointerId) return;
        const current = press;
        cancelPress();
        if (buttonFor(event.target) === current.button && performance.now() - current.start >= 800) ask(current.button);
    };
    const click = event => {
        const button = buttonFor(event.target);
        if (!button || allowed === button) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        globalThis.toastr?.info?.('按住红色断链按钮 0.8 秒，松手后确认移除。', '', { timeOut: 2000, preventDuplicates: true });
    };
    const contextMenu = event => {
        if (!buttonFor(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    const key = event => {
        if (!buttonFor(event.target) || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) ask(buttonFor(event.target));
    };
    const style = document.createElement('style');
    style.textContent = '.prompt-manager-detach-action{touch-action:pan-y;user-select:none;-webkit-touch-callout:none}.tt-detach-holding{outline:2px solid #e4a34d;outline-offset:5px;border-radius:4px}.tt-detach-confirm{max-width:min(90vw,420px);padding:20px;color:var(--SmartThemeBodyColor,#eee);background:var(--SmartThemeBlurTintColor,#333);border:1px solid #888;border-radius:12px}.tt-detach-confirm::backdrop{background:#0009}.tt-detach-confirm button{display:inline-block;margin:8px}';
    document.head.append(style);
    const listeners = [['pointerdown', down], ['pointermove', move], ['pointerup', up],
        ['pointercancel', cancelPress], ['scroll', cancelPress], ['click', click],
        ['contextmenu', contextMenu], ['keydown', key]];
    listeners.forEach(([name, fn]) => document.addEventListener(name, fn, true));
    window.addEventListener('blur', cancelPress);
    cleanupGuard = () => {
        cancelPress(); close(); style.remove();
        listeners.forEach(([name, fn]) => document.removeEventListener(name, fn, true));
        window.removeEventListener('blur', cancelPress);
        cleanupGuard = null;
    };
}
export function cleanupPromptDetachGuard() { cleanupGuard?.(); }
