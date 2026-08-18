'use strict';

// Answer-generation backends. Each provider exposes the same three operations
// (stream, complete, listModels) so main.js can stay provider-agnostic.

const PROVIDERS = {
  xai: {
    id: 'xai',
    label: 'xAI (Grok)',
    short: 'xAI',
    defaultModel: 'grok-4.20-0309-non-reasoning',
    keyHint: 'If blank, the xAI transcription key above is used. Get a key at console.x.ai.',
    keyPlaceholder: 'Paste xAI key for answers…',
    fallbackModels: [
      'grok-4.20-0309-non-reasoning',
      'grok-4.3',
      'grok-4.6',
      'grok-4.5',
      'grok-4.20-0309-reasoning',
      'grok-4.20-multi-agent-0309',
      'grok-build-0.1',
    ],
    style: 'openai',
    chatUrl: 'https://api.x.ai/v1/chat/completions',
    modelsUrl: 'https://api.x.ai/v1/models',
    warmUrl: 'https://api.x.ai/v1/models',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    short: 'Anthropic',
    defaultModel: 'claude-haiku-4-5',
    keyHint: 'Get a key at console.anthropic.com.',
    keyPlaceholder: 'Paste Anthropic key (sk-ant-…)…',
    fallbackModels: [
      'claude-haiku-4-5',
      'claude-sonnet-5',
      'claude-sonnet-4-6',
      'claude-opus-5',
      'claude-fable-5',
    ],
    style: 'anthropic',
    chatUrl: 'https://api.anthropic.com/v1/messages',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    warmUrl: 'https://api.anthropic.com/v1/models',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    short: 'OpenAI',
    defaultModel: 'gpt-4o',
    keyHint: 'Get a key at platform.openai.com/api-keys.',
    keyPlaceholder: 'Paste OpenAI key (sk-…)…',
    fallbackModels: [
      'gpt-4o',
      'gpt-4.1',
      'gpt-5.6-luna',
      'gpt-5.4',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
    ],
    style: 'openai',
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    modelsUrl: 'https://api.openai.com/v1/models',
    warmUrl: 'https://api.openai.com/v1/models',
  },
};

const PROVIDER_ORDER = ['xai', 'anthropic', 'openai'];

function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.xai;
}

function providerList() {
  return PROVIDER_ORDER.map((id) => {
    const p = PROVIDERS[id];
    return {
      id: p.id,
      label: p.label,
      short: p.short,
      defaultModel: p.defaultModel,
      keyHint: p.keyHint,
      keyPlaceholder: p.keyPlaceholder,
      fallbackModels: p.fallbackModels.slice(),
    };
  });
}

function authHeaders(provider, apiKey) {
  if (provider.style === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

function parseDataUrl(url) {
  const m = String(url || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

function splitSystemMessages(messages) {
  const system = [];
  const rest = [];
  for (const m of messages || []) {
    if (m.role === 'system') {
      if (typeof m.content === 'string') system.push(m.content);
      else if (Array.isArray(m.content)) {
        system.push(m.content.map((p) => p.text || '').filter(Boolean).join('\n'));
      }
    } else {
      rest.push(m);
    }
  }
  return { system: system.filter(Boolean).join('\n\n'), messages: rest };
}

function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content || '');
  const parts = [];
  for (const part of content) {
    if (!part) continue;
    if (part.type === 'text' && part.text) parts.push({ type: 'text', text: part.text });
    else if (part.type === 'image_url') {
      const parsed = parseDataUrl(part.image_url && part.image_url.url);
      if (parsed) {
        parts.push({
          type: 'image',
          source: { type: 'base64', media_type: parsed.mime || 'image/png', data: parsed.data },
        });
      }
    }
  }
  return parts.length ? parts : '';
}

function toAnthropicBody(model, messages, { stream, maxTokens }) {
  const split = splitSystemMessages(messages);
  const body = {
    model,
    max_tokens: maxTokens || 16384,
    stream: !!stream,
    messages: split.messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: toAnthropicContent(m.content),
    })),
  };
  if (split.system) body.system = split.system;
  return body;
}

function toOpenAiInputContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content || '');
  const parts = [];
  for (const part of content) {
    if (!part) continue;
    if (part.type === 'text' && part.text) parts.push({ type: 'input_text', text: part.text });
    else if (part.type === 'image_url') {
      const url = part.image_url && part.image_url.url;
      if (url) parts.push({ type: 'input_image', image_url: url });
    }
  }
  return parts.length ? parts : '';
}

function toOpenAiResponsesBody(model, messages, { stream, maxTokens }) {
  const split = splitSystemMessages(messages);
  const body = {
    model,
    stream: !!stream,
    input: split.messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.role === 'assistant' && typeof m.content === 'string'
        ? m.content
        : toOpenAiInputContent(m.content),
    })),
  };
  if (split.system) body.instructions = split.system;
  if (maxTokens) body.max_output_tokens = maxTokens;
  return body;
}

async function readSseLines(res, onLine) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) onLine(line);
  }
  if (buffer) onLine(buffer);
}

function parseSseData(line) {
  const t = String(line || '').trim();
  if (!t.startsWith('data:')) return null;
  const payload = t.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try { return JSON.parse(payload); } catch { return null; }
}

function deltaFromOpenAi(json) {
  const choice = json && json.choices && json.choices[0];
  if (!choice) return '';
  const delta = choice.delta || {};
  if (typeof delta.content === 'string') return delta.content;
  if (Array.isArray(delta.content)) {
    return delta.content.map((p) => (p && (p.text || p.content)) || '').join('');
  }
  return '';
}

function deltaFromAnthropic(json) {
  if (!json || json.type !== 'content_block_delta') return '';
  const d = json.delta || {};
  if (d.type === 'text_delta') return d.text || '';
  return '';
}

function deltaFromOpenAiResponses(json) {
  if (!json) return '';
  if (json.type === 'response.output_text.delta') {
    return typeof json.delta === 'string' ? json.delta : '';
  }
  if (json.type === 'response.content_part.delta' && json.delta) {
    if (typeof json.delta === 'string') return json.delta;
    if (typeof json.delta.text === 'string') return json.delta.text;
  }
  return deltaFromOpenAi(json);
}

function textFromOpenAi(data) {
  if (data && typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const items = (data && data.output) || [];
  let out = '';
  for (const item of items) {
    const parts = (item && item.content) || [];
    for (const p of parts) {
      if (p && (p.type === 'output_text' || p.type === 'text') && p.text) out += p.text;
    }
  }
  if (out.trim()) return out.trim();
  return ((data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
}

function textFromAnthropic(data) {
  const blocks = (data && data.content) || [];
  return blocks.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('').trim();
}

function isGpt5(model) {
  return /^gpt-5/i.test(String(model || ''));
}

function isXaiReasoningModel(model) {
  const s = String(model || '');
  return /grok-4\.6|grok-4\.5|grok-4\.20-multi-agent|grok-4\.20-0309-reasoning/.test(s);
}

function openaiChatBody(model, messages, { stream, maxTokens }) {
  const body = { model, messages, stream: !!stream };
  if (maxTokens) {
    if (isGpt5(model)) body.max_completion_tokens = maxTokens;
    else body.max_tokens = maxTokens;
  }
  // GPT-5.x defaults to medium reasoning and holds visible tokens until
  // thinking finishes. Interview answers need first-token speed.
  if (isGpt5(model)) body.reasoning_effort = 'none';
  return body;
}

function xaiChatBody(model, messages, { stream, maxTokens }) {
  const body = { model, messages, stream: !!stream };
  if (maxTokens) body.max_tokens = maxTokens;
  if (isXaiReasoningModel(model)) body.reasoning_effort = 'low';
  return body;
}

function streamAttempts(p, model, messages, apiKey) {
  if (p.style === 'anthropic') {
    return [{
      url: p.chatUrl,
      body: toAnthropicBody(model, messages, { stream: true, maxTokens: 16384 }),
      takeDelta: deltaFromAnthropic,
    }];
  }
  if (p.id === 'openai') {
    return [
      {
        url: 'https://api.openai.com/v1/chat/completions',
        body: openaiChatBody(model, messages, { stream: true }),
        takeDelta: (json) => deltaFromOpenAi(json) || deltaFromOpenAiResponses(json),
      },
      {
        url: 'https://api.openai.com/v1/responses',
        body: { ...toOpenAiResponsesBody(model, messages, { stream: true }), reasoning: { effort: 'none' } },
        takeDelta: (json) => deltaFromOpenAiResponses(json) || deltaFromOpenAi(json),
      },
    ];
  }
  return [{
    url: p.chatUrl,
    body: xaiChatBody(model, messages, { stream: true }),
    takeDelta: deltaFromOpenAi,
  }];
}

async function throwIfNotOk(res) {
  if (res.ok) return;
  let text = '';
  try { text = await res.text(); } catch {}
  const err = new Error(text.slice(0, 400) || `HTTP ${res.status}`);
  err.status = res.status;
  err.body = text;
  throw err;
}

async function streamChat({ provider, apiKey, model, messages, signal, onDelta }) {
  const p = typeof provider === 'string' ? getProvider(provider) : provider;
  const attempts = streamAttempts(p, model, messages, apiKey);
  let lastErr = null;

  for (let i = 0; i < attempts.length; i++) {
    const { url, body, takeDelta } = attempts[i];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(p, apiKey),
        body: JSON.stringify(body),
        signal,
      });
      await throwIfNotOk(res);
      await readSseLines(res, (line) => {
        const json = parseSseData(line);
        if (!json) return;
        const delta = takeDelta(json);
        if (delta && onDelta) onDelta(delta);
      });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      lastErr = e;
      if (i === attempts.length - 1) throw e;
    }
  }
  if (lastErr) throw lastErr;
}

async function completeChat({ provider, apiKey, model, messages, maxTokens, signal }) {
  const p = typeof provider === 'string' ? getProvider(provider) : provider;
  let url;
  let body;
  if (p.style === 'anthropic') {
    url = p.chatUrl;
    body = toAnthropicBody(model, messages, { stream: false, maxTokens: maxTokens || 16 });
  } else if (p.id === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    body = openaiChatBody(model, messages, { stream: false, maxTokens: maxTokens || 16 });
  } else {
    url = p.chatUrl;
    body = xaiChatBody(model, messages, { stream: false, maxTokens: maxTokens || 16 });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(p, apiKey),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) return '';
  const data = await res.json();
  if (p.style === 'anthropic') return textFromAnthropic(data);
  return textFromOpenAi(data);
}

function isChatModelId(provider, id) {
  const s = String(id || '').toLowerCase();
  if (!s) return false;
  if (provider.id === 'xai') {
    if (!s.startsWith('grok-')) return false;
    return !/imagine|voice|tts|stt|image|video/.test(s);
  }
  if (provider.id === 'openai') {
    if (!/^gpt-5|^gpt-4/.test(s)) return false;
    return !/realtime|transcribe|tts|audio|image|search|moderation|instruct/.test(s);
  }
  if (provider.id === 'anthropic') return s.startsWith('claude-');
  return true;
}

async function listModels({ provider, apiKey }) {
  const p = typeof provider === 'string' ? getProvider(provider) : provider;
  if (!apiKey) return null;
  try {
    let ids = [];
    if (p.style === 'anthropic') {
      const r = await fetch(p.modelsUrl, { headers: authHeaders(p, apiKey) });
      if (!r.ok) return null;
      const data = await r.json();
      ids = (data.data || data.models || [])
        .map((m) => (typeof m === 'string' ? m : m.id))
        .filter(Boolean);
    } else {
      const r = await fetch(p.modelsUrl, { headers: authHeaders(p, apiKey) });
      if (!r.ok) return null;
      const data = await r.json();
      ids = (data.data || data.models || [])
        .map((m) => (typeof m === 'string' ? m : m.id))
        .filter(Boolean);
    }
    ids = ids.filter((id) => isChatModelId(p, id));
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

function extractApiErrorMessage(body) {
  const text = String(body || '');
  if (!text) return '';
  try {
    const data = JSON.parse(text);
    const err = data.error || data;
    if (err && typeof err.message === 'string' && err.message.trim()) return err.message.trim();
  } catch {}
  return '';
}

function friendlyAnswerError(provider, status, body) {
  const name = (provider && provider.label) || 'API';
  const detail = extractApiErrorMessage(body);
  if (detail && (status === 400 || status === 403 || status === 404)) {
    return `${name}: ${detail}`;
  }
  switch (status) {
    case 400: return `${name} rejected the answer request (400). Check the model in Settings → API keys.`;
    case 401:
    case 403: return `${name} rejected your answer key (${status}). Set/verify the key in Settings → API keys → Answer generation.`;
    case 429: return `${name} rate limit / out of credits (429). Try again shortly.`;
    default:  return `${name} answer request failed (${status || 'unknown'}).`;
  }
}

function modelAbbr(providerId, modelId) {
  const id = String(modelId || '');
  const p = providerId || 'xai';
  if (p === 'xai') {
    return id.replace('grok-', 'G').replace(/\.\d+$/, '').replace(/-.*/, '').slice(0, 4) || 'xAI';
  }
  if (p === 'anthropic') {
    if (/fable/i.test(id)) return 'CF';
    if (/opus/i.test(id)) return 'CO';
    if (/sonnet/i.test(id)) return 'CS';
    if (/haiku/i.test(id)) return 'CH';
    return 'Cl';
  }
  if (p === 'openai') {
    if (/luna/i.test(id)) return 'Lun';
    if (/terra/i.test(id)) return 'Ter';
    if (/sol/i.test(id)) return 'Sol';
    if (/gpt-4o/i.test(id)) return '4o';
    if (/gpt-4\.1/i.test(id)) return '4.1';
    return 'GPT';
  }
  return 'M';
}

module.exports = {
  PROVIDERS,
  PROVIDER_ORDER,
  getProvider,
  providerList,
  streamChat,
  completeChat,
  listModels,
  friendlyAnswerError,
  modelAbbr,
};
