// 切角色自动挂世界书（v1.15.7）：
// 选完角色回到聊天，这个角色绑了世界书 → 世界书面板的编辑框自动换成这本（不弹面板）；
// 角色卡里自带世界书但还没导入 → 照酒馆官方「导入并绑定」的做法导进来并绑上；没有世界书 → 不管。
// 世界书面板标题下面加一行：当前角色的世界书是哪本。
// 以前每次重启编辑框都是空的，用户以为世界书掉了，每次手动点角色卡上的绿地球。

const BANNER_ID = 'tt-char-world-banner';
const ctx = () => globalThis.SillyTavern?.getContext?.();

let chatListener = null;
let bannerTimer = null;

function currentCharacter() {
    const context = ctx();
    const chid = context?.characterId;
    if (chid === undefined || chid === null || chid === '' || context?.groupId) return null;
    const character = context.characters?.[chid];
    return character ? { context, chid, character } : null;
}

function worldNames(context) {
    return context.getWorldInfoNames?.() || [];
}

// 编辑框换成这本：选项的值就是它在世界书列表里的序号
function showInEditor(name, names) {
    const select = document.getElementById('world_editor_select');
    const index = names.indexOf(name);
    if (!select || index < 0) return;
    if (select.selectedOptions[0]?.textContent === name) return;
    const $ = globalThis.jQuery;
    if ($) $(select).val(String(index)).trigger('change');
}

function markLinked(name) {
    const input = document.getElementById('character_world');
    if (input) input.value = name;
    document.querySelectorAll('#set_character_world, #world_button').forEach((el) => el.classList.add('world_set'));
}

// 跟官方 importEmbeddedWorldInfo 一样：书名用卡里写的，没写就「角色名's Lorebook」
async function importEmbedded({ context, chid, character }) {
    const bookName = character.data.character_book.name || `${character.name}'s Lorebook`;
    const names = worldNames(context);
    // 同名的已经有了就直接绑，不再导一遍，免得盖掉用户改过的条目
    if (!names.includes(bookName)) {
        const converted = context.convertCharacterBook(character.data.character_book);
        await context.saveWorldInfo(bookName, converted, true);
        await context.updateWorldInfoList();
    }
    await context.writeExtensionField(chid, 'world', bookName);
    markLinked(bookName);
    globalThis.toastr?.success?.(`「${bookName}」已经挂到「${character.name}」上了`, '世界书');
    return bookName;
}

// 排队一个一个来：打开酒馆时自己跑的那遍和酒馆发的「聊天换了」挨得很近，同时跑会把卡里的书导两遍、弹两次提示
let chain = Promise.resolve();
function onChatChanged() {
    chain = chain.then(attachWorld);
    return chain;
}

async function attachWorld() {
    try {
        const found = currentCharacter();
        if (!found) return;
        const { context, character } = found;
        let world = character.data?.extensions?.world;
        if (!(world && worldNames(context).includes(world))) {
            if (!character.data?.character_book) return;
            world = await importEmbedded(found);
        }
        showInEditor(world, worldNames(context));
    } catch (error) {
        console.error('[酒馆拓展] 自动挂世界书失败', error);
        globalThis.toastr?.warning?.('自动挂世界书没成功，可以点角色卡上的地球手动挂：' + (error?.message || error), '世界书');
    } finally {
        renderBanner();
    }
}

function renderBanner() {
    const anchor = document.getElementById('WI_panel_pin_div')?.closest('.flex-container');
    if (!anchor) return false;
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
        banner = document.createElement('div');
        banner.id = BANNER_ID;
        anchor.after(banner);
    }
    const found = currentCharacter();
    const world = found?.character.data?.extensions?.world;
    const linked = found && world && worldNames(found.context).includes(world);
    const text = !found ? '' : linked
        ? `当前角色的世界书：${world}（跟这个角色聊天时自动生效）`
        : '当前角色没有绑世界书';
    if (banner.textContent !== text) banner.textContent = text;
    banner.hidden = !text;
    return true;
}

export function initCharWorld() {
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    if (!chatListener && context?.eventSource?.on && types?.CHAT_CHANGED) {
        chatListener = () => onChatChanged();
        context.eventSource.on(types.CHAT_CHANGED, chatListener);
    }
    clearInterval(bannerTimer);
    if (renderBanner()) { onChatChanged(); return; }
    let tries = 0;
    bannerTimer = setInterval(() => {
        if (renderBanner() || ++tries > 60) { clearInterval(bannerTimer); onChatChanged(); }
    }, 500);
}

export function cleanupCharWorld() {
    const context = ctx();
    const types = context?.eventTypes ?? context?.event_types;
    if (chatListener && types?.CHAT_CHANGED) {
        try { context.eventSource.removeListener?.(types.CHAT_CHANGED, chatListener); } catch { /* ignore */ }
    }
    chatListener = null;
    clearInterval(bannerTimer);
    document.getElementById(BANNER_ID)?.remove();
}

// 给电脑上的自测脚本用
export const __test = { onChatChanged, renderBanner };
