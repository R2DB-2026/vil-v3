// Vercel serverless proxy: the API key lives in Vercel environment variables, never in the browser.
// GET  /api/llm  -> {ok, provider, label}           (lets the pages discover server mode)
// POST /api/llm  -> {text, usage}                    body: {tier:'fast'|'strong', system, messages, maxTokens, json}
//
// Environment variables (Vercel → Settings → Environment Variables):
//   LLM_PROVIDER   anthropic | openai | gemini | openrouter | orcarouter | custom
//   LLM_API_KEY    the provider key
//   MODEL_FAST     model for the pet owner (fast, cheap)
//   MODEL_STRONG   model for the examiner and case synthesis
//   LLM_BASE_URL   only for custom (or to override a provider's URL)
//   ACCESS_CODE    optional: callers must send header x-vil-code with this value
import { PROVIDERS, call } from '../src/llm-core.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const provider = process.env.LLM_PROVIDER;
  const configured = provider && process.env.LLM_API_KEY && process.env.MODEL_FAST && process.env.MODEL_STRONG;
  if (req.method === 'GET') {
    return res.status(200).json(configured ? { ok: true, provider, label: PROVIDERS[provider]?.label || provider, gated: !!process.env.ACCESS_CODE } : { ok: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!configured) return res.status(503).json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า LLM_PROVIDER / LLM_API_KEY / MODEL_FAST / MODEL_STRONG' });
  if (process.env.ACCESS_CODE && req.headers['x-vil-code'] !== process.env.ACCESS_CODE) return res.status(401).json({ error: 'รหัสเข้าใช้ไม่ถูกต้อง' });

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!Array.isArray(b.messages) || !b.messages.length) return res.status(400).json({ error: 'messages ว่าง' });
  try {
    const out = await call({
      provider, apiKey: process.env.LLM_API_KEY, baseUrl: process.env.LLM_BASE_URL || '',
      model: b.tier === 'strong' ? process.env.MODEL_STRONG : process.env.MODEL_FAST,
      system: String(b.system || '').slice(0, 200000), messages: b.messages,
      maxTokens: Math.min(Number(b.maxTokens) || 4000, 16000), json: !!b.json,
    });
    res.status(200).json(out);
  } catch (e) {
    res.status(e.status && e.status >= 400 ? e.status : 502).json({ error: e.message });
  }
}
