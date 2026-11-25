// llm-core.js — one call shape for every provider. Runs in the browser and in Node 18+ (Vercel).
// call({provider, apiKey, model, baseUrl, system, messages, maxTokens, json})
//   messages: [{role:'user'|'assistant', content: string | Part[]}]
//   Part: {type:'text', text} | {type:'image', mime, data /* base64 */}
// returns {text, usage}

export const PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)', short: 'Claude', base: 'https://api.anthropic.com/v1', keyHint: 'sk-ant-…', browser: true,
    desc: 'ภาษาไทยดี เล่นบทเจ้าของได้เป็นธรรมชาติ',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    steps: ['สมัครหรือเข้าสู่ระบบที่ Claude Console', 'เติมเครดิตในหน้า Billing (API คิดเงินแยกจากแพ็กเกจแชต)', 'ไปที่ API Keys กด Create Key แล้วคัดลอกมาวาง'],
    fast: 'claude-haiku-5-5', strong: 'claude-sonnet-5-5', models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  },
  openai: {
    label: 'ChatGPT (OpenAI)', short: 'ChatGPT', base: 'https://api.openai.com/v1', keyHint: 'sk-…', browser: true,
    desc: 'ใช้คีย์จาก OpenAI Platform (ไม่ใช่บัญชี ChatGPT Plus)',
    keyUrl: 'https://platform.openai.com/api-keys',
    steps: ['เข้าสู่ระบบที่ OpenAI Platform', 'เติมเครดิตในหน้า Billing', 'กด Create new secret key แล้วคัดลอกมาวาง (แสดงครั้งเดียว)'],
    fast: '', strong: '', models: [],
  },
  gemini: {
    label: 'Gemini (Google)', short: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta', keyHint: 'AIza…', browser: true,
    desc: 'สร้างคีย์ได้จาก Google AI Studio ด้วยบัญชี Google',
    keyUrl: 'https://aistudio.google.com/apikey',
    steps: ['เข้า Google AI Studio ด้วยบัญชี Google', 'กด Create API key แล้วเลือกโปรเจกต์', 'คัดลอกคีย์มาวาง'],
    fast: '', strong: '', models: [],
  },
  openrouter: {
    label: 'OpenRouter', short: 'OpenRouter', base: 'https://openrouter.ai/api/v1', keyHint: 'sk-or-…', browser: true,
    desc: 'คีย์เดียวใช้ได้หลายค่าย (Claude, GPT, Gemini, Llama ฯลฯ)',
    keyUrl: 'https://openrouter.ai/keys',
    steps: ['สมัครที่ openrouter.ai', 'เติมเครดิตที่หน้า Credits', 'ไปที่ Keys กด Create Key แล้วคัดลอกมาวาง', 'ชื่อรุ่นใช้รูปแบบ ค่าย/รุ่น เช่น anthropic/… กด "โหลดรายชื่อรุ่น" เพื่อเลือก'],
    fast: '', strong: '', models: [],
  },
  orcarouter: {
    label: 'OrcaRouter', short: 'OrcaRouter', base: 'https://api.orcarouter.ai/v1', keyHint: 'sk-orca-…', browser: false,
    desc: 'ตัวกลางเลือกรุ่นอัตโนมัติ ใช้รุ่น orcarouter/auto ได้',
    keyUrl: 'https://orcarouter.ai/console',
    steps: ['สมัครที่ orcarouter.ai', 'สร้างคีย์ในหน้า Console', 'คัดลอกคีย์ (ขึ้นต้นด้วย sk-orca-) มาวาง'],
    fast: 'orcarouter/auto', strong: 'orcarouter/auto', models: ['orcarouter/auto'],
  },
  custom: {
    label: 'อื่น ๆ (OpenAI-compatible)', short: 'อื่น ๆ', base: '', keyHint: 'ตามผู้ให้บริการ (LLM ในเครื่องใส่อะไรก็ได้)', browser: false,
    desc: 'LLM ในเครื่อง หรือผู้ให้บริการที่ใช้รูปแบบเดียวกับ OpenAI',
    keyUrl: '',
    steps: ['เลือกปุ่มลัดด้านล่างเพื่อเติม Base URL หรือพิมพ์เอง', 'ใส่คีย์ของผู้ให้บริการนั้น', 'กด "โหลดรายชื่อรุ่น" แล้วเลือกรุ่น'],
    presets: [['Ollama (ในเครื่อง)', 'http://localhost:11434/v1'], ['LM Studio (ในเครื่อง)', 'http://localhost:1234/v1'], ['Groq', 'https://api.groq.com/openai/v1'], ['DeepSeek', 'https://api.deepseek.com/v1'], ['Together AI', 'https://api.together.xyz/v1']],
    fast: '', strong: '', models: [],
  },
};

const OPENAI_STYLE = new Set(['openai', 'openrouter', 'orcarouter', 'custom']);

export class LLMError extends Error {
  constructor(message, status, detail) { super(message); this.status = status; this.detail = detail; }
}

const textOf = c => typeof c === 'string' ? c : c.filter(p => p.type === 'text').map(p => p.text).join('\n');
const parts = c => typeof c === 'string' ? [{ type: 'text', text: c }] : c;

function baseOf(cfg) {
  const b = (cfg.baseUrl || PROVIDERS[cfg.provider]?.base || '').replace(/\/+$/, '');
  if (!b) throw new LLMError('ยังไม่ได้ใส่ Base URL', 0);
  return b;
}

async function post(url, headers, body) {
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch (e) {
    throw new LLMError('เชื่อมต่อไม่ได้ (เครือข่ายหรือ CORS) ลองใช้โหมดเซิร์ฟเวอร์ Vercel', 0, String(e));
  }
  const raw = await r.text();
  let j = null; try { j = JSON.parse(raw); } catch (_) {}
  if (!r.ok) {
    const msg = j?.error?.message || j?.error?.type || j?.message || raw.slice(0, 300);
    throw new LLMError(`${r.status}: ${msg}`, r.status, j || raw);
  }
  return j;
}

function toOpenAI(cfg) {
  const msgs = [];
  if (cfg.system) msgs.push({ role: 'system', content: cfg.system });
  for (const m of cfg.messages) {
    const p = parts(m.content);
    if (p.every(x => x.type === 'text')) msgs.push({ role: m.role, content: textOf(p) });
    else msgs.push({ role: m.role, content: p.map(x => x.type === 'text' ? { type: 'text', text: x.text } : { type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}` } }) });
  }
  const body = { model: cfg.model, messages: msgs };
  if (cfg.provider === 'openai') body.max_completion_tokens = cfg.maxTokens || 4000; else body.max_tokens = cfg.maxTokens || 4000;
  if (cfg.json && cfg.provider === 'openai') body.response_format = { type: 'json_object' };
  return body;
}

function toAnthropic(cfg) {
  return {
    model: cfg.model, max_tokens: cfg.maxTokens || 4000, system: cfg.system || undefined,
    messages: cfg.messages.map(m => ({ role: m.role, content: parts(m.content).map(x => x.type === 'text' ? { type: 'text', text: x.text } : { type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } }) })),
  };
}

function toGemini(cfg) {
  const body = {
    contents: cfg.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: parts(m.content).map(x => x.type === 'text' ? { text: x.text } : { inlineData: { mimeType: x.mime, data: x.data } }) })),
    generationConfig: { maxOutputTokens: cfg.maxTokens || 4000 },
  };
  if (cfg.system) body.systemInstruction = { parts: [{ text: cfg.system }] };
  if (cfg.json) body.generationConfig.responseMimeType = 'application/json';
  return body;
}

export async function call(cfg) {
  if (!cfg.model) throw new LLMError('ยังไม่ได้เลือกรุ่นโมเดล', 0);
  if (!cfg.apiKey) throw new LLMError('ยังไม่ได้ใส่ API key', 0);
  const base = baseOf(cfg);
  if (cfg.provider === 'anthropic') {
    const j = await post(`${base}/messages`, { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, toAnthropic(cfg));
    return { text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), usage: j.usage };
  }
  if (cfg.provider === 'gemini') {
    const j = await post(`${base}/models/${encodeURIComponent(cfg.model)}:generateContent`, { 'x-goog-api-key': cfg.apiKey }, toGemini(cfg));
    const c = j.candidates?.[0];
    if (!c) throw new LLMError('Gemini ไม่ส่งคำตอบ: ' + (j.promptFeedback?.blockReason || 'ไม่ทราบสาเหตุ'), 200, j);
    return { text: (c.content?.parts || []).map(p => p.text || '').join(''), usage: j.usageMetadata };
  }
  if (OPENAI_STYLE.has(cfg.provider)) {
    const h = { authorization: `Bearer ${cfg.apiKey}` };
    if (cfg.provider === 'openrouter') { h['X-Title'] = 'Vet Interview Lab'; if (typeof location !== 'undefined') h['HTTP-Referer'] = location.origin; }
    const j = await post(`${base}/chat/completions`, h, toOpenAI(cfg));
    const msg = j.choices?.[0]?.message;
    const t = typeof msg?.content === 'string' ? msg.content : (msg?.content || []).map(p => p.text || '').join('');
    return { text: t || '', usage: j.usage };
  }
  throw new LLMError('ไม่รู้จักผู้ให้บริการ ' + cfg.provider, 0);
}

export async function listModels(cfg) {
  const base = baseOf(cfg);
  let url, headers = {};
  if (cfg.provider === 'anthropic') { url = `${base}/models?limit=100`; headers = { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }; }
  else if (cfg.provider === 'gemini') { url = `${base}/models?pageSize=200`; headers = { 'x-goog-api-key': cfg.apiKey }; }
  else { url = `${base}/models`; if (cfg.apiKey) headers = { authorization: `Bearer ${cfg.apiKey}` }; }
  const r = await fetch(url, { headers });
  if (!r.ok) throw new LLMError(`${r.status}: โหลดรายชื่อรุ่นไม่ได้`, r.status);
  const j = await r.json();
  if (cfg.provider === 'gemini') return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  return (j.data || []).map(m => m.id).sort();
}

// Pull the first JSON object out of a model reply (handles ```json fences and chatter around it).
export function parseJSON(t) {
  const s = String(t || '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new LLMError('AI ไม่ได้ตอบเป็น JSON', 0, s.slice(0, 400));
  return JSON.parse(s.slice(a, b + 1));
}
