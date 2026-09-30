// Chinese names for the built-in extensions in the extension manager.
// The host lists each extension as .extension_block[data-name="<folder>"],
// built-ins by their folder name. Only the displayed text is changed; the
// toggles, update buttons and saved settings keep using the original names.

const BUILT_IN = {
    'agent-system': ['智能体系统', '让 AI 分步骤调用工具来完成任务（TauriTavern）'],
    'assets': ['素材下载', '下载官方提供的角色、背景、音乐等素材'],
    'attachments': ['资料库（聊天附件）', '管理上传给聊天的文件和资料，可配合向量存储检索'],
    'caption': ['图片识别描述', '让 AI 看懂并描述你发送的图片'],
    'code-render': ['代码渲染', '把消息里含 HTML/脚本的代码块显示成可交互界面，如状态栏、前端卡'],
    'connection-manager': ['连接配置', '保存 API、模型、预设的组合，一键切换'],
    'data-migration': ['数据迁移', '导入电脑版酒馆的数据压缩包，或导出当前数据（TauriTavern）'],
    'expressions': ['角色表情', '按对话情绪自动切换角色立绘'],
    'gallery': ['图库', '查看角色的图片相册'],
    'mcp-manager': ['MCP 工具', '连接外部 MCP 工具服务，给 AI 调用'],
    'memory': ['对话总结', '自动总结长对话，节省上下文'],
    'quick-reply': ['快速回复', '输入框上方的一键快捷按钮和脚本'],
    'regex': ['正则替换', '用正则规则自动改写消息文字'],
    'stable-diffusion': ['图片生成', '调用绘图接口生成插图'],
    'tauritavern-version': ['TauriTavern 版本', '查看应用版本、切换更新渠道'],
    'token-counter': ['词符计数', '统计一段文字占多少词符（token）'],
    'translate': ['聊天翻译', '自动翻译聊天消息'],
    'tts': ['语音朗读', '把消息用语音读出来（TTS）'],
    'vectors': ['向量存储', '按语义检索聊天记录和资料，做长期记忆'],
};

let observer = null;
let scheduled = false;

function translateBlock(block) {
    if (block.dataset.ttZh === '1') return;
    const entry = BUILT_IN[block.dataset.name];
    if (!entry) return;
    const name = block.querySelector('.extension_name');
    if (!name) return;
    const [zh, desc] = entry;
    const english = name.textContent.trim();
    block.dataset.ttZh = '1';
    name.textContent = zh;

    const en = document.createElement('span');
    en.className = 'tt-ext-en';
    en.textContent = english;
    name.after(en);

    const status = name.parentElement;
    const note = document.createElement('div');
    note.className = 'tt-ext-desc';
    note.textContent = desc;
    // Keep the host's "可选模块" line directly under the name, then the description.
    const modules = status?.querySelector(':scope > .extension_modules');
    if (modules) modules.after(note);
    else status?.appendChild(note);
}

function translateAll() {
    scheduled = false;
    document.querySelectorAll('.extensions_info .extension_block[data-name]').forEach(translateBlock);
}

function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(translateAll);
}

export function initExtensionNamesZh() {
    if (observer) return;
    observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.matches?.('.extensions_info, .extension_block') || node.querySelector?.('.extension_block')) {
                    schedule();
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
}

export function cleanupExtensionNamesZh() {
    observer?.disconnect();
    observer = null;
    document.querySelectorAll('.extension_block[data-tt-zh="1"]').forEach((block) => {
        const en = block.querySelector('.tt-ext-en');
        const name = block.querySelector('.extension_name');
        if (name && en) name.textContent = en.textContent;
        en?.remove();
        block.querySelector('.tt-ext-desc')?.remove();
        delete block.dataset.ttZh;
    });
}
