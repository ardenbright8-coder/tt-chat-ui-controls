const WI_MOBILE_CLASS = 'tt-wi-mobile';
const WI_ENTRY_MARK = 'ttWiMobile';

let observer = null;
let popup = null;
let list = null;
let initialized = false;
let globalCleanup = [];
const entryCleanup = new WeakMap();
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

function syncActiveEntry(preferred = null) {
    if (!popup || !list) return;

    const entries = [...list.querySelectorAll(':scope > .world_entry')];
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

    if (!active) {
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

        const toggle = entry.querySelector(':scope > form > .inline-drawer > .inline-drawer-header .inline-drawer-toggle');
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
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

function organizeEditor(entry, edit) {
    if (edit.dataset.ttWiOrganized === '1') return;
    edit.dataset.ttWiOrganized = '1';
    edit.classList.add('tt-wi-editor');

    makeEntryToolbar(entry);

    const contentBlock = edit.querySelector('[name="contentAndCharFilterBlock"]');
    if (contentBlock) {
        contentBlock.classList.add('tt-wi-content-block');
        move(contentBlock, edit);
        edit.prepend(contentBlock);
    }

    const common = makeCommonSection(edit, contentBlock);
    const commonBody = common.querySelector('.tt-wi-common-body');

    const characterFilter = edit.querySelector('select[name="characterFilter"]');
    const characterFilterBlock = characterFilter?.closest('.flex4');
    if (characterFilterBlock) {
        characterFilterBlock.classList.add('tt-wi-character-filter');
        move(characterFilterBlock, commonBody);
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
        label.textContent = '激活策略';

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
