const WI_MOBILE_CLASS = 'tt-wi-mobile';
const WI_ENTRY_MARK = 'ttWiMobile';

let observer = null;
let popup = null;
let list = null;
let initialized = false;
let globalCleanup = [];
let helpOverlay = null;
let activeEntry = null;
let listReturnState = null;
const entryCleanup = new WeakMap();
const entrySnapshots = new WeakMap();
const movedNodes = new WeakMap();

function isTouchMobile() {
    return globalThis.matchMedia?.('(pointer: coarse)')?.matches === true;
}

function on(element, type, handler, options) {
    element.addEventListener(type, handler, options);
    return () => element.removeEventListener(type, handler, options);
}

function rememberMove(node) {
    if (!node || movedNodes.has(node)) return;
    movedNodes.set(node, {
        parent: node.parentNode,
        next: node.nextSibling,
    });
}

function move(node, target) {
    if (!node || !target || node.parentNode === target) return;
    rememberMove(node);
    target.appendChild(node);
}

function restoreMovedNode(node) {
    const original = movedNodes.get(node);
    if (!original?.parent) return;

    try {
        if (original.next?.parentNode === original.parent) {
            original.parent.insertBefore(node, original.next);
        } else {
            original.parent.appendChild(node);
        }
    } catch {
        // The original World Info drawer may already have been destroyed/re-rendered.
    }
    movedNodes.delete(node);
}

function textValue(entry) {
    const input = entry.querySelector('textarea[name="comment"]');
    const value = input?.value?.trim();
    return value || input?.placeholder || '未命名条目';
}

function syncCardTitleHeight(entry) {
    const input = entry.querySelector('textarea[name="comment"]');
    if (!input) return;

    if (entry.classList.contains('tt-wi-active-entry')) {
        input.style.removeProperty('height');
        return;
    }

    const styles = getComputedStyle(input);
    const fontSize = Number.parseFloat(styles.fontSize) || 16;
    const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.35;
    const padding = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
    const border = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
    const oneLine = lineHeight + padding + border;
    const twoLines = lineHeight * 2 + padding + border;

    input.style.setProperty('height', 'auto', 'important');
    const desired = Math.max(oneLine, Math.min(input.scrollHeight + border, twoLines));
    input.style.setProperty('height', `${Math.ceil(desired)}px`, 'important');
}

function directEntryDrawerContent(entry) {
    return entry.querySelector(':scope > form > .inline-drawer > .inline-drawer-content');
}

function isEntryDrawerOpen(entry) {
    const content = directEntryDrawerContent(entry);
    return !!content && getComputedStyle(content).display !== 'none';
}


function captureEntrySnapshot(entry) {
    if (!entry || entrySnapshots.has(entry)) return;

    const controls = [...entry.querySelectorAll('input, select, textarea')].map((element) => {
        if (element instanceof HTMLSelectElement) {
            return {
                element,
                type: 'select',
                selected: [...element.options].map((option) => option.selected),
            };
        }

        if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
            return {
                element,
                type: 'checked',
                checked: element.checked,
            };
        }

        return {
            element,
            type: 'value',
            value: element.value,
        };
    });

    entrySnapshots.set(entry, controls);
}

function restoreEntrySnapshot(entry) {
    const snapshot = entrySnapshots.get(entry);
    if (!snapshot) return;

    for (const item of snapshot) {
        const element = item.element;
        if (!element?.isConnected) continue;

        let changed = false;

        if (item.type === 'select' && element instanceof HTMLSelectElement) {
            [...element.options].forEach((option, index) => {
                const next = !!item.selected[index];
                if (option.selected !== next) changed = true;
                option.selected = next;
            });
        } else if (item.type === 'checked' && element instanceof HTMLInputElement) {
            changed = element.checked !== item.checked;
            element.checked = item.checked;
        } else if ('value' in element) {
            changed = element.value !== item.value;
            element.value = item.value;
        }

        if (changed) {
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

function clearEntrySnapshot(entry) {
    entrySnapshots.delete(entry);
}

function rememberListReturn(entry) {
    if (!popup || !entry) return;

    listReturnState = {
        uid: entry.getAttribute('uid') ?? '',
        scrollTop: popup.scrollTop,
        topOffset: entry.getBoundingClientRect().top - popup.getBoundingClientRect().top,
    };
}

function restoreListReturn() {
    if (!popup || !listReturnState) return;

    const state = listReturnState;
    listReturnState = null;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            popup.scrollTop = state.scrollTop;

            if (!state.uid) return;
            const safeUid = globalThis.CSS?.escape ? CSS.escape(state.uid) : state.uid.replace(/"/g, '\\"');
            const entry = list?.querySelector(`.world_entry[uid="${safeUid}"]`);
            if (!entry) return;

            const popupRect = popup.getBoundingClientRect();
            const entryRect = entry.getBoundingClientRect();
            const expectedTop = popupRect.top + state.topOffset;
            const delta = entryRect.top - expectedTop;

            if (Math.abs(delta) > 3) {
                popup.scrollTop += delta;
            }
        });
    });
}

function closeEntryDrawer(entry) {
    const toggle = entry?.querySelector(':scope > form > .inline-drawer > .inline-drawer-header .inline-drawer-toggle');
    if (!toggle) return;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function makeEditActions(entry) {
    if (!entry || entry.querySelector(':scope > .tt-wi-edit-actions')) return;

    const actions = document.createElement('div');
    actions.className = 'tt-wi-edit-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'tt-wi-edit-cancel';
    cancel.textContent = '取消';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'tt-wi-edit-confirm';
    confirm.textContent = '确定';

    actions.append(cancel, confirm);
    entry.appendChild(actions);

    const cleanup = entryCleanup.get(entry) ?? [];

    cleanup.push(on(cancel, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        restoreEntrySnapshot(entry);
        clearEntrySnapshot(entry);
        closeEntryDrawer(entry);
    }));

    cleanup.push(on(confirm, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        clearEntrySnapshot(entry);
        closeEntryDrawer(entry);
    }));

    cleanup.push(() => actions.remove());
    entryCleanup.set(entry, cleanup);
}

function syncActiveEntry(preferred = null) {
    if (!popup || !list) return;

    const entries = [...list.querySelectorAll(':scope > .world_entry')];
    const previousActive = activeEntry;

    let active = preferred && preferred.isConnected && isEntryDrawerOpen(preferred)
        ? preferred
        : entries.find((entry) => entry.classList.contains('tt-wi-active-entry') && isEntryDrawerOpen(entry))
            ?? entries.find(isEntryDrawerOpen)
            ?? null;

    for (const entry of entries) {
        entry.classList.toggle('tt-wi-entry-open', isEntryDrawerOpen(entry));
        entry.classList.toggle('tt-wi-active-entry', entry === active);
        requestAnimationFrame(() => syncCardTitleHeight(entry));
    }

    popup.classList.toggle('tt-wi-editing', !!active);
    activeEntry = active;

    if (active && active !== previousActive) {
        rememberListReturn(active);
        captureEntrySnapshot(active);
        makeEditActions(active);
    }

    if (!active) {
        if (previousActive) {
            clearEntrySnapshot(previousActive);
            restoreListReturn();
        }
        return;
    }

    const edit = active.querySelector('.world_entry_edit');
    if (edit) organizeEditor(active, edit);
}

function makeEntryToolbar(entry) {
    if (entry.querySelector(':scope > .tt-wi-entry-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'tt-wi-entry-toolbar';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'tt-wi-entry-back';
    back.setAttribute('aria-label', '返回世界书条目列表');
    back.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';

    const title = document.createElement('div');
    title.className = 'tt-wi-entry-toolbar-title';
    title.textContent = textValue(entry);

    toolbar.append(back, title);
    entry.prepend(toolbar);

    const cleanup = entryCleanup.get(entry) ?? [];
    cleanup.push(() => toolbar.remove());

    cleanup.push(on(back, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        clearEntrySnapshot(entry);
        closeEntryDrawer(entry);
    }));

    const comment = entry.querySelector('textarea[name="comment"]');
    if (comment) {
        const updateTitle = () => {
            title.textContent = textValue(entry);
            syncCardTitleHeight(entry);
        };
        cleanup.push(on(comment, 'input', updateTitle));
    }

    entryCleanup.set(entry, cleanup);
}


function makeAdvancedSection(edit) {
    let details = edit.querySelector(':scope > .tt-wi-advanced');
    if (details) return details;

    details = document.createElement('details');
    details.className = 'tt-wi-advanced';

    const summary = document.createElement('summary');
    summary.innerHTML = '<span><i class="fa-solid fa-gear"></i> 高级设置</span><i class="fa-solid fa-chevron-down tt-wi-details-chevron"></i>';

    const body = document.createElement('div');
    body.className = 'tt-wi-advanced-body';

    details.append(summary, body);
    edit.appendChild(details);
    return details;
}

function makeCommonSection(edit, contentBlock) {
    let common = edit.querySelector(':scope > .tt-wi-common');
    if (common) return common;

    common = document.createElement('section');
    common.className = 'tt-wi-common';

    const heading = document.createElement('div');
    heading.className = 'tt-wi-section-heading';
    heading.textContent = '常用参数';

    const body = document.createElement('div');
    body.className = 'tt-wi-common-body';

    common.append(heading, body);
    if (contentBlock?.nextSibling) {
        edit.insertBefore(common, contentBlock.nextSibling);
    } else {
        edit.appendChild(common);
    }
    return common;
}

function moveRecursionFlags(edit, advancedBody) {
    const names = ['excludeRecursion', 'preventRecursion', 'delay_until_recursion', 'ignoreBudget'];
    const flagBox = document.createElement('div');
    flagBox.className = 'tt-wi-advanced-flags';

    let count = 0;
    for (const name of names) {
        const input = edit.querySelector(`input[name="${name}"]`);
        const label = input?.closest('label.checkbox');
        if (!label) continue;
        move(label, flagBox);
        count++;
    }

    if (count) advancedBody.prepend(flagBox);
}



const FIELD_HELP = {
    position: {
        title: '注入位置：这条内容到底塞到哪里',
        html: `
            <p><b>它决定“放哪儿”，不是决定“怎么触发”。</b></p>
            <div class="tt-wi-help-row"><b>角色定义之前</b><span>放在角色描述 / 场景之前。位置更早，通常影响相对温和。</span></div>
            <div class="tt-wi-help-row"><b>角色定义之后</b><span>放在角色描述 / 场景之后，更靠近后面的提示词，通常影响更直接。</span></div>
            <div class="tt-wi-help-row"><b>示例消息前</b><span>把这条当“示例对话”处理，放在角色卡示例消息之前。适合示范说话方式、对话范例。</span></div>
            <div class="tt-wi-help-row"><b>示例消息后</b><span>同样按“示例对话”处理，只是放在示例消息之后，比“示例消息前”更靠后。</span></div>
            <div class="tt-wi-help-row"><b>作者注释之前 / 之后</b><span>插到 Author's Note 的开头 / 结尾。作者注释关闭时，这两种位置不会生效。</span></div>
            <div class="tt-wi-help-row"><b>@D ⚙️ 系统</b><span>插进聊天历史指定深度，并把这段当 <b>system</b> 消息。更像系统规则 / 背景说明。</span></div>
            <div class="tt-wi-help-row"><b>@D 👤 用户</b><span>同样插进聊天历史，但把这段当 <b>user</b> 消息，像用户曾经说过的话。</span></div>
            <div class="tt-wi-help-row"><b>@D 🤖 AI</b><span>同样插进聊天历史，但把这段当 <b>assistant</b> 消息，像模型自己曾经说过的话。</span></div>
            <div class="tt-wi-help-row"><b>➡️ 锚点 / Outlet</b><span>不自动塞进提示词。只有别处调用对应 <code>{{outlet::名称}}</code> 时才把内容取出来。</span></div>
            <p class="tt-wi-help-note"><b>和“顺序”的区别：</b>注入位置决定去哪个区域；顺序只负责多个世界书条目同时生效时谁更靠后。</p>
        `,
    },
    depth: {
        title: '注入深度：@D 模式下插到聊天历史多深',
        html: `
            <p>只有选择 <b>@D ⚙️ / @D 👤 / @D 🤖</b> 时才有用。</p>
            <div class="tt-wi-help-example"><b>例：</b>深度 0 = 放在聊天历史最底部 / 最近处；深度 1 = 往前一条；深度 2 = 再往前一条。</div>
            <p><b>别和高级设置里的“扫描深度”混淆：</b><br>注入深度 = 内容最终插在哪里；扫描深度 = 为了找触发词，往前检查多少条聊天。</p>
        `,
    },
    order: {
        title: '顺序：越大越靠后，通常影响更强',
        html: `
            <p>当多条世界书同时激活、而且处在可比较的插入区域时，用这个数字决定先后。</p>
            <div class="tt-wi-help-example"><b>例：</b>Order 100 会排在 Order 250 前面；250 更靠近上下文末端，通常更容易影响当前回复。</div>
            <p><b>注意：</b>它不是数学权重。250 不代表比 100 “强 2.5 倍”。它主要改变插入先后与预算竞争优先级。</p>
        `,
    },
    probability: {
        title: '激活概率：命中以后，这条最终进不进',
        html: `
            <p>先满足关键词 / 过滤条件，再看这个概率。</p>
            <div class="tt-wi-help-example"><b>例：</b>100% = 命中后每次都生效；50% = 命中后大约一半机会生效；20% = 大约五次里一次。</div>
            <p><b>它不控制“影响有多强”。</b>一旦成功注入，20% 和 100% 的同一段内容本身没有强弱差别。</p>
        `,
    },
    strategy: {
        title: '激活策略：这条靠什么方式进入上下文',
        html: `
            <div class="tt-wi-help-row"><b>🔵 常驻</b><span>不用等关键词，条目保持常驻参与注入。</span></div>
            <div class="tt-wi-help-row"><b>🟢 普通</b><span>靠关键词命中，再结合可选过滤器 / 角色过滤等条件决定是否触发。</span></div>
            <div class="tt-wi-help-row"><b>🔗 向量</b><span>允许 Vector Storage 根据语义相似度找这条；如果还写了关键词，关键词触发仍然可以继续工作。</span></div>
            <p class="tt-wi-help-note">禁用不是这里的第四项，仍然由条目自己的启用 / 禁用开关控制。</p>
        `,
    },
    characterFilter: {
        title: '绑定对象：限制这条世界书给谁用',
        html: `
            <p>它看的是“当前聊天角色是谁”，不是聊天里有没有出现某个词。</p>
            <div class="tt-wi-help-example"><b>例：</b>一条“冬天旧伤发作”的世界书绑定清月后，和清月聊天时可以触发；换成别的角色，即使同样聊到“下雪”，这条也可以被挡住。</div>
            <p><b>和关键词的区别：</b>关键词看聊天内容；绑定对象 / 角色过滤看当前角色或标签。</p>
        `,
    },
};

function closeFieldHelp() {
    helpOverlay?.remove();
    helpOverlay = null;
}

function openFieldHelp(key) {
    const info = FIELD_HELP[key];
    if (!info) return;

    closeFieldHelp();

    const overlay = document.createElement('div');
    overlay.className = 'tt-wi-help-overlay';

    const card = document.createElement('section');
    card.className = 'tt-wi-help-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', info.title);

    const header = document.createElement('div');
    header.className = 'tt-wi-help-header';

    const title = document.createElement('strong');
    title.textContent = info.title;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tt-wi-help-close';
    close.setAttribute('aria-label', '关闭说明');
    close.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    const body = document.createElement('div');
    body.className = 'tt-wi-help-body';
    body.innerHTML = info.html;

    header.append(title, close);
    card.append(header, body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    helpOverlay = overlay;

    const stop = (event) => event.stopPropagation();
    card.addEventListener('pointerdown', stop);
    card.addEventListener('click', stop);

    const dismiss = (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeFieldHelp();
    };

    close.addEventListener('click', dismiss);
    overlay.addEventListener('click', dismiss);
}

function addFieldHelpButton(label, key) {
    if (!label || label.querySelector(':scope > .tt-wi-help-button')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tt-wi-help-button';
    button.textContent = '!';
    button.setAttribute('aria-label', '查看说明');
    button.setAttribute('title', '查看说明');

    const open = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFieldHelp(key);
    };

    button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    button.addEventListener('click', open);
    label.appendChild(button);
}

function setPlainLabel(label, text) {
    if (!label) return;
    if (!label.dataset.ttWiOriginalHtml) {
        label.dataset.ttWiOriginalHtml = label.innerHTML;
    }
    label.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
    });
    label.insertAdjacentText('afterbegin', text);
}

function decorateCommonFieldHelp(entry) {
    const position = entry.querySelector('[name="PositionBlock"]');
    const depth = entry.querySelector('input[name="depth"]')?.closest('.world_entry_form_control');
    const order = entry.querySelector('input[name="order"]')?.closest('.world_entry_form_control');
    const probability = entry.querySelector('input[name="probability"]')?.closest('.world_entry_form_control');
    const strategy = entry.querySelector('.tt-wi-strategy-control');
    const characterFilter = entry.querySelector('.tt-wi-character-filter');

    const positionLabel = position?.querySelector(':scope > label');
    const depthLabel = depth?.querySelector(':scope > label');
    const orderLabel = order?.querySelector(':scope > label');
    const probabilityLabel = probability?.querySelector(':scope > label');
    const strategyLabel = strategy?.querySelector(':scope > label');
    const charFilterLabel = characterFilter?.querySelector('label');

    setPlainLabel(positionLabel, '注入位置');
    setPlainLabel(depthLabel, '注入深度（仅 @D）');
    setPlainLabel(orderLabel, '顺序（越大越靠后，通常影响更强）');
    setPlainLabel(probabilityLabel, '激活概率（命中后生效概率）');

    if (strategyLabel) {
        if (!strategyLabel.dataset.ttWiOriginalHtml) {
            strategyLabel.dataset.ttWiOriginalHtml = strategyLabel.innerHTML;
        }
        strategyLabel.innerHTML = '激活策略 <span class="tt-wi-field-note">（触发方式）</span>';
    }

    addFieldHelpButton(positionLabel, 'position');
    addFieldHelpButton(depthLabel, 'depth');
    addFieldHelpButton(orderLabel, 'order');
    addFieldHelpButton(probabilityLabel, 'probability');
    addFieldHelpButton(strategyLabel, 'strategy');

    if (charFilterLabel) {
        addFieldHelpButton(charFilterLabel, 'characterFilter');
    }
}

function restoreCommonFieldHelp(entry) {
    entry.querySelectorAll('[data-tt-wi-original-html]').forEach((label) => {
        label.innerHTML = label.dataset.ttWiOriginalHtml;
        delete label.dataset.ttWiOriginalHtml;
    });
}

function enhancePositionOptions(entry) {
    const select = entry.querySelector('select[name="position"]');
    if (!select || select.dataset.ttWiPositionLabels === '1') return;

    const labels = new Map([
        ['0:', '角色定义之前（放角色设定前）'],
        ['1:', '角色定义之后（放角色设定后，通常更靠后）'],
        ['5:', '示例消息前（当示例对话，放示例前）'],
        ['6:', '示例消息后（当示例对话，放示例后）'],
        ['2:', '作者注释之前（放 Author\'s Note 开头）'],
        ['3:', '作者注释之后（放 Author\'s Note 结尾）'],
        ['4:0', '@D ⚙️ 系统（按 system 消息插入聊天历史）'],
        ['4:1', '@D 👤 用户（按 user 消息插入聊天历史）'],
        ['4:2', '@D 🤖 AI（按 assistant 消息插入聊天历史）'],
        ['7:', '➡️ 锚点 / Outlet（不自动注入，等宏调用）'],
    ]);

    for (const option of select.options) {
        const key = `${option.value}:${option.dataset.role ?? ''}`;
        const label = labels.get(key);
        if (!label) continue;

        if (!option.dataset.ttWiOriginalText) {
            option.dataset.ttWiOriginalText = option.textContent ?? '';
        }
        option.textContent = label;
    }

    select.dataset.ttWiPositionLabels = '1';

    const cleanup = entryCleanup.get(entry) ?? [];
    cleanup.push(() => {
        for (const option of select.options) {
            if (option.dataset.ttWiOriginalText !== undefined) {
                option.textContent = option.dataset.ttWiOriginalText;
                delete option.dataset.ttWiOriginalText;
            }
        }
        delete select.dataset.ttWiPositionLabels;
    });
    entryCleanup.set(entry, cleanup);
}

function markCommonHeaderControls(entry) {
    const order = entry.querySelector('input[name="order"]')?.closest('.world_entry_form_control');
    const probability = entry.querySelector('input[name="probability"]')?.closest('.world_entry_form_control');
    const position = entry.querySelector('[name="PositionBlock"]');

    order?.classList.add('tt-wi-order-control');
    probability?.classList.add('tt-wi-probability-control');
    position?.classList.add('tt-wi-position-control');
}

function organizeEditor(entry, edit) {
    if (edit.dataset.ttWiOrganized === '1') return;
    edit.dataset.ttWiOrganized = '1';
    edit.classList.add('tt-wi-editor');

    makeEntryToolbar(entry);
    markCommonHeaderControls(entry);
    enhancePositionOptions(entry);
    decorateCommonFieldHelp(entry);

    const contentBlock = edit.querySelector('[name="contentAndCharFilterBlock"]');
    if (contentBlock) {
        contentBlock.classList.add('tt-wi-content-block');
        move(contentBlock, edit);
        edit.prepend(contentBlock);
    }

    const common = makeCommonSection(edit, contentBlock);
    const commonBody = common.querySelector('.tt-wi-common-body');

    const headerControls = entry.querySelector('.WIEnteryHeaderControls');
    if (headerControls) {
        headerControls.classList.add('tt-wi-common-header-controls');
        move(headerControls, commonBody);
    }

    const characterFilter = edit.querySelector('select[name="characterFilter"]');
    const characterFilterBlock = characterFilter?.closest('.flex4');
    if (characterFilterBlock) {
        characterFilterBlock.classList.add('tt-wi-character-filter');
        move(characterFilterBlock, commonBody);
        decorateCommonFieldHelp(entry);
    }

    const advanced = makeAdvancedSection(edit);
    const advancedBody = advanced.querySelector('.tt-wi-advanced-body');

    moveRecursionFlags(edit, advancedBody);

    const keywordBlock = edit.querySelector('[name="keywordsAndLogicBlock"]');
    if (keywordBlock) {
        keywordBlock.classList.add('tt-wi-advanced-keywords');
        move(keywordBlock, advancedBody);
    }

    const overridesBlock = edit.querySelector('[name="perEntryOverridesBlock"]');
    if (overridesBlock) {
        overridesBlock.classList.add('tt-wi-advanced-overrides');
        move(overridesBlock, advancedBody);
    }

    const groupRow = edit.querySelector('input[name="group"]')?.closest('.flex-container.wide100p.flexGap10');
    if (groupRow) {
        groupRow.classList.add('tt-wi-advanced-timing');
        move(groupRow, advancedBody);
    }

    const triggers = edit.querySelector('select[name="triggers"]');
    const filterRow = triggers?.closest('.flex-container.wide100p.flexGap10');
    if (filterRow) {
        filterRow.classList.add('tt-wi-advanced-filters');
        move(filterRow, advancedBody);
    }

    const bottomControls = edit.querySelector('[name="WIEntryBottomControls"]');
    if (bottomControls) {
        bottomControls.classList.add('tt-wi-advanced-bottom');
        move(bottomControls, advancedBody);
    }

    const firstRow = edit.querySelector(':scope > .flex-container.wide100p.alignitemscenter');
    if (firstRow) {
        const leftovers = [...firstRow.children].filter((node) => node.childElementCount || node.textContent.trim());
        if (leftovers.length) {
            firstRow.classList.add('tt-wi-advanced-leftovers');
            move(firstRow, advancedBody);
        }
    }

    const additional = edit.querySelector(':scope > .inline-drawer');
    if (additional) {
        additional.classList.add('tt-wi-additional-sources');
        const header = additional.querySelector(':scope > .inline-drawer-header strong');
        if (header) header.textContent = '额外匹配来源';
    }

    const contentLabel = contentBlock?.querySelector('label[for="content "] > small > span');
    if (contentLabel) contentLabel.classList.add('tt-wi-content-heading');

}



function enhanceStrategyOptions(entry) {
    const select = entry.querySelector('select[name="entryStateSelector"]');
    if (!select || select.dataset.ttWiStrategyLabels === '1') return;

    const labels = {
        constant: '🔵 常驻（始终注入）',
        normal: '🟢 普通（关键词触发）',
        vectorized: '🔗 向量（语义匹配）',
    };

    for (const option of select.options) {
        const value = String(option.value);
        if (!(value in labels)) continue;

        if (!option.dataset.ttWiOriginalText) {
            option.dataset.ttWiOriginalText = option.textContent ?? '';
        }
        option.textContent = labels[value];
    }

    select.dataset.ttWiStrategyLabels = '1';

    const cleanup = entryCleanup.get(entry) ?? [];
    cleanup.push(() => {
        for (const option of select.options) {
            if (option.dataset.ttWiOriginalText !== undefined) {
                option.textContent = option.dataset.ttWiOriginalText;
                delete option.dataset.ttWiOriginalText;
            }
        }
        delete select.dataset.ttWiStrategyLabels;
    });
    entryCleanup.set(entry, cleanup);
}

function makeListActionBar(entry) {
    if (entry.querySelector(':scope > form > .inline-drawer > .inline-drawer-header > .tt-wi-list-actions')) {
        return;
    }

    const header = entry.querySelector(':scope > form > .inline-drawer > .inline-drawer-header');
    const thin = header?.querySelector(':scope > .world_entry_thin_controls');
    const toggle = thin?.querySelector(':scope > .inline-drawer-toggle.inline-drawer-icon');
    const moveButton = header?.querySelector(':scope > .move_entry_button');
    const duplicateButton = header?.querySelector(':scope > .duplicate_entry_button');
    const deleteButton = header?.querySelector(':scope > .delete_entry_button');

    if (!header || !toggle) return;

    const actions = document.createElement('div');
    actions.className = 'tt-wi-list-actions';

    for (const node of [toggle, moveButton, duplicateButton, deleteButton]) {
        if (!node) continue;
        rememberMove(node);
        actions.appendChild(node);
    }

    header.appendChild(actions);

    const cleanup = entryCleanup.get(entry) ?? [];
    cleanup.push(() => {
        for (const node of [toggle, moveButton, duplicateButton, deleteButton]) {
            if (node && movedNodes.has(node)) restoreMovedNode(node);
        }
        actions.remove();
    });
    entryCleanup.set(entry, cleanup);
}

function syncDepthControl(entry) {
    const depthInput = entry.querySelector('input[name="depth"]');
    const control = depthInput?.closest('.world_entry_form_control');
    if (!depthInput || !control) return;

    const hidden = depthInput.disabled || depthInput.style.visibility === 'hidden';
    control.classList.toggle('tt-wi-depth-inactive', hidden);
}

function bindDepthVisibility(entry) {
    if (entry.dataset.ttWiDepthBound === '1') {
        syncDepthControl(entry);
        return;
    }

    const position = entry.querySelector('select[name="position"]');
    if (!position) return;

    entry.dataset.ttWiDepthBound = '1';

    const sync = () => requestAnimationFrame(() => syncDepthControl(entry));
    const cleanup = entryCleanup.get(entry) ?? [];
    cleanup.push(on(position, 'input', sync));
    cleanup.push(on(position, 'change', sync));
    cleanup.push(() => delete entry.dataset.ttWiDepthBound);
    entryCleanup.set(entry, cleanup);

    sync();
}

function decorateEntry(entry) {
    if (!(entry instanceof HTMLElement) || entry.dataset[WI_ENTRY_MARK] === '1') return;
    entry.dataset[WI_ENTRY_MARK] = '1';
    entry.classList.add('tt-wi-card');

    const cleanup = [];

    const stateSelect = entry.querySelector('select[name="entryStateSelector"]');
    const headerControls = entry.querySelector('.WIEnteryHeaderControls');
    if (stateSelect && headerControls && !entry.querySelector('.tt-wi-strategy-control')) {
        const strategy = document.createElement('div');
        strategy.className = 'world_entry_form_control wi-enter-footer-text tt-wi-strategy-control';

        const label = document.createElement('label');
        label.className = 'tt-wi-strategy-label';
        label.innerHTML = '激活策略 <span class="tt-wi-field-note">（触发方式）</span>';

        rememberMove(stateSelect);
        strategy.append(label, stateSelect);
        headerControls.appendChild(strategy);

        cleanup.push(() => {
            restoreMovedNode(stateSelect);
            strategy.remove();
        });
    }

    cleanup.push(on(entry, 'focusin', () => {
        if (entry.classList.contains('tt-wi-entry-open')) {
            entry.classList.add('tt-wi-active-entry');
        }
    }));

    entryCleanup.set(entry, cleanup);
    enhanceStrategyOptions(entry);
    enhancePositionOptions(entry);
    makeListActionBar(entry);
    bindDepthVisibility(entry);
    requestAnimationFrame(() => syncCardTitleHeight(entry));

    const edit = entry.querySelector('.world_entry_edit');
    if (edit) organizeEditor(entry, edit);
}

function decorateWorldPopup() {
    popup = document.getElementById('world_popup');
    list = document.getElementById('world_popup_entries_list');
    if (!popup || !list) return false;

    popup.classList.add(WI_MOBILE_CLASS);

    if (!popup.querySelector(':scope > .tt-wi-mobile-title')) {
        const title = document.createElement('div');
        title.className = 'tt-wi-mobile-title';
        title.textContent = '编辑世界书';
        const first = popup.querySelector(':scope > hr');
        first?.insertAdjacentElement('afterend', title);
        globalCleanup.push(() => title.remove());
    }

    const directBars = [...popup.querySelectorAll(':scope > .flex-container.alignitemscenter')];
    directBars[0]?.classList.add('tt-wi-bookbar');
    directBars[1]?.classList.add('tt-wi-listbar');

    for (const entry of list.querySelectorAll(':scope > .world_entry')) {
        decorateEntry(entry);
    }

    const drawerHandler = (event) => {
        const entry = event.target instanceof Element ? event.target.closest('.world_entry') : null;
        if (!entry || !list.contains(entry)) return;

        requestAnimationFrame(() => {
            decorateEntry(entry);
            const edit = entry.querySelector('.world_entry_edit');
            if (edit) organizeEditor(entry, edit);
            syncActiveEntry(isEntryDrawerOpen(entry) ? entry : null);
        });
    };

    list.addEventListener('inline-drawer-toggle', drawerHandler);
    globalCleanup.push(() => list?.removeEventListener('inline-drawer-toggle', drawerHandler));

    observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (!(node instanceof Element)) continue;

                if (node.matches('.world_entry')) decorateEntry(node);
                node.querySelectorAll?.('.world_entry').forEach(decorateEntry);

                const edit = node.matches('.world_entry_edit')
                    ? node
                    : node.querySelector?.('.world_entry_edit');
                if (edit) {
                    const entry = edit.closest('.world_entry');
                    if (entry) organizeEditor(entry, edit);
                }
            }
        }

        syncActiveEntry();
    });

    observer.observe(list, { childList: true, subtree: true });
    syncActiveEntry();
    return true;
}

export function initWorldInfoMobile() {
    if (initialized || !isTouchMobile()) return;
    initialized = true;

    if (decorateWorldPopup()) return;

    let attempts = 0;
    const timer = globalThis.setInterval(() => {
        attempts++;
        if (decorateWorldPopup() || attempts >= 80) {
            globalThis.clearInterval(timer);
        }
    }, 250);
    globalCleanup.push(() => globalThis.clearInterval(timer));
}

export function cleanupWorldInfoMobile() {
    if (!initialized) return;
    initialized = false;
    closeFieldHelp();
    activeEntry = null;
    listReturnState = null;

    observer?.disconnect();
    observer = null;

    if (popup) {
        popup.classList.remove(WI_MOBILE_CLASS, 'tt-wi-editing', 'tt-wi-bookbar', 'tt-wi-listbar');
    }

    if (list) {
        for (const entry of list.querySelectorAll('.world_entry')) {
            const cleanup = entryCleanup.get(entry) ?? [];
            cleanup.forEach((fn) => {
                try { fn(); } catch { /* ignore */ }
            });
            entryCleanup.delete(entry);

            entry.querySelectorAll('.tt-wi-editor [name], .tt-wi-editor .flex-container').forEach((node) => {
                if (movedNodes.has(node)) restoreMovedNode(node);
            });

            restoreCommonFieldHelp(entry);
            entry.classList.remove('tt-wi-card', 'tt-wi-entry-open', 'tt-wi-active-entry');
            delete entry.dataset[WI_ENTRY_MARK];

            const edit = entry.querySelector('.world_entry_edit');
            if (edit) {
                for (const node of [...edit.querySelectorAll('*')].reverse()) {
                    if (movedNodes.has(node)) restoreMovedNode(node);
                }
                edit.querySelectorAll(':scope > .tt-wi-common, :scope > .tt-wi-advanced').forEach((node) => node.remove());
                edit.classList.remove('tt-wi-editor');
                delete edit.dataset.ttWiOrganized;
            }
        }
    }

    for (const cleanup of globalCleanup.splice(0)) {
        try { cleanup(); } catch { /* ignore */ }
    }

    popup?.querySelectorAll('.tt-wi-mobile-title').forEach((node) => node.remove());
    popup?.querySelectorAll('.tt-wi-bookbar, .tt-wi-listbar').forEach((node) => {
        node.classList.remove('tt-wi-bookbar', 'tt-wi-listbar');
    });

    popup = null;
    list = null;
}
