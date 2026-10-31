// OpenCode 会话标记补丁（v1.18.41）：发往 opencode.ai 的请求自动补上 x-opencode-session。
// 起因（用户 2026-10-31）：Command Code 到期，MVU 额外模型改走 OpenCode Go 的 deepseek-v4.1-flash 过渡（「先用 Open Code 吧，凑合凑合」）。
// OpenCode 从 2026-09 起要求每个请求带 x-opencode-session，不带就回 400 MissingSessionID（10-31 实测：带上 200，不带 400）。
// MVU「自定义」只能填地址、钥匙、模型；酒馆助手还会把它改成 openai 来源 + reverse_proxy 发出去，额外请求头整个丢掉。
// 所以在页面 fetch 这一层，盯 /api/backends/chat-completions/generate：
// - custom 来源、地址是 opencode.ai：请求头里没有标记就补一条
// - openai 来源、reverse_proxy 是 opencode.ai（MVU / 酒馆助手那条路）：改成 custom 来源，地址、模型照搬，钥匙放进 Authorization，再补标记
// 别的请求一个字节都不动。钥匙用的是请求里本来就有的，代码里不存任何钥匙。

import { vlog } from './var-log.js';

const GENERATE = /\/api\/backends\/chat-completions\/generate/;
const OPENCODE = /(^|\/\/)([\w-]+\.)*opencode\.ai(\/|$)/i;
const HEADER = 'x-opencode-session';

let original = null;
let sessionId = '';
let logged = new Set();

function session() {
    if (sessionId) return sessionId;
    try { sessionId = sessionStorage.getItem('tt-opencode-session') || ''; } catch { /* 读不到就现生成 */ }
    if (!sessionId) {
        sessionId = `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        try { sessionStorage.setItem('tt-opencode-session', sessionId); } catch { /* 存不下也能用 */ }
    }
    return sessionId;
}

// custom_include_headers 可能是 YAML 字符串、JSON 字符串或对象；统一成对象再改
function headerMap(value) {
    if (!value) return {};
    if (typeof value === 'object') return { ...value };
    const text = String(value).trim();
    if (!text) return {};
    try { const j = JSON.parse(text); if (j && typeof j === 'object') return j; } catch { /* 不是 JSON，按 YAML 一行一条读 */ }
    const map = {};
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([^:#]+?)\s*:\s*(.*?)\s*$/);
        if (m) map[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return map;
}

const hasSession = (map) => Object.keys(map).some((k) => k.toLowerCase() === HEADER);

function patch(body) {
    const source = body.chat_completion_source;
    if (source === 'custom' && OPENCODE.test(body.custom_url || '')) {
        const headers = headerMap(body.custom_include_headers);
        if (hasSession(headers)) return null;
        headers[HEADER] = session();
        return { ...body, custom_include_headers: headers };
    }
    if (source === 'openai' && OPENCODE.test(body.reverse_proxy || '')) {
        const headers = headerMap(body.custom_include_headers);
        if (body.proxy_password && !Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')) {
            headers.Authorization = `Bearer ${body.proxy_password}`;
        }
        if (!hasSession(headers)) headers[HEADER] = session();
        const next = { ...body, chat_completion_source: 'custom', custom_url: body.reverse_proxy, custom_model: body.model, custom_include_headers: headers };
        delete next.reverse_proxy;
        delete next.proxy_password;
        return next;
    }
    return null;
}

function wrapped(input, init) {
    try {
        const url = typeof input === 'string' ? input : input?.url;
        if (GENERATE.test(url || '') && init && typeof init.body === 'string') {
            const body = JSON.parse(init.body);
            const next = patch(body);
            if (next) {
                const key = `${body.chat_completion_source}|${next.custom_model || next.model}`;
                if (!logged.has(key)) {
                    logged.add(key);
                    vlog('OpenCode', `补上会话标记：${body.chat_completion_source === 'openai' ? '酒馆助手 / MVU 那条路（改成自定义来源）' : '自定义来源'}，模型 ${next.custom_model || next.model}`);
                }
                return original.call(this, input, { ...init, body: JSON.stringify(next) });
            }
        }
    } catch (error) {
        console.warn('[酒馆拓展] OpenCode 补丁没处理这条请求，照原样发', error);
    }
    return original.apply(this, arguments);
}

export function initOpencodeSession() {
    if (original) return;
    original = window.fetch;
    window.fetch = wrapped;
}

export function cleanupOpencodeSession() {
    if (original && window.fetch === wrapped) window.fetch = original;
    original = null;
    logged = new Set();
}

// 给电脑上的自测脚本用
export const __test = { patch, headerMap };
