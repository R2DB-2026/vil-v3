// settings.js — the "ตั้งค่า AI" panel (no-code friendly) and ai(): the one call every page uses.
import { PROVIDERS, call, listModels, LLMError } from './llm-core.js';
import { CAPS, IN_ARTIFACT, esc, store, modal } from './caps.js';

const KEY_CFG = 'vil.ai.cfg.v2', KEY_SECRET = 'vil.ai.key.v2';
let server = null;
let cfg = load();

function load() {
  const c = { provider: '', baseUrl: '', modelFast: '', modelStrong: '', remember: false, accessCode: '', ...(store.get(KEY_CFG, {}) || {}) };
  let k = ''; try { k = localStorage.getItem(KEY_SECRET) || sessionStorage.getItem(KEY_SECRET) || ''; } catch (_) {}
  c.apiKey = k;
  return c;
}
function save() {
  const { apiKey, ...rest } = cfg;
  store.set(KEY_CFG, rest);
  try {
    if (cfg.remember) { localStorage.setItem(KEY_SECRET, apiKey || ''); sessionStorage.removeItem(KEY_SECRET); }
    else { sessionStorage.setItem(KEY_SECRET, apiKey || ''); localStorage.removeItem(KEY_SECRET); }
  } catch (_) {}
  document.dispatchEvent(new CustomEvent('vil:ai-changed'));
}

export async function detectServer() {
  if (IN_ARTIFACT || location.protocol === 'file:') return null;
  try { const r = await fetch('api/llm'); if (r.ok) { const j = await r.json(); if (j.ok) server = j; } } catch (_) {}
  return server;
}

// Pick a sensible default once we know what this copy can do.
export function settleDefault() {
  if (!cfg.provider) { cfg.provider = CAPS.sample ? 'here' : server ? 'server' : ''; save(); }
  if (cfg.provider === 'here' && !CAPS.sample) cfg.provider = server ? 'server' : '';
  document.dispatchEvent(new CustomEvent('vil:ai-changed'));
}

export function aiReady() {
  if (cfg.provider === 'here') return !!CAPS.sample;
  if (cfg.provider === 'server') return !!server;
  if (!PROVIDERS[cfg.provider]) return false;
  return !!(cfg.apiKey && cfg.modelFast && cfg.modelStrong && (cfg.provider !== 'custom' || cfg.baseUrl));
}
export function aiLabel() {
  if (cfg.provider === 'here') return CAPS.sample ? 'AI: Claude ในหน้านี้' : 'AI: ยังไม่ได้ตั้งค่า';
  if (cfg.provider === 'server') return server ? `AI: เซิร์ฟเวอร์ (${server.label || server.provider})` : 'AI: ยังไม่ได้ตั้งค่า';
  return aiReady() ? `AI: ${PROVIDERS[cfg.provider].short} · ${cfg.modelFast}` : 'AI: ยังไม่ได้ตั้งค่า';
}

const b64ToBlob = (b64, mime) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };

async function viaSample(tier, req) {
  const s = CAPS.sample;
  const images = [];
  const flat = req.messages.map(m => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    const text = m.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
    m.content.filter(p => p.type === 'image').forEach(p => images.push(b64ToBlob(p.data, p.mime)));
    return { role: m.role, content: text };
  });
  if (req.system) flat[0] = { ...flat[0], content: `${req.system}\n\n---\n\n${flat[0].content}` };
  const opts = { modelTier: tier === 'strong' ? 'complex' : 'default', cache: false };
  if (images.length) {
    const lim = await s.limits?.().catch(() => null);
    if (!lim?.images) throw new LLMError('Claude ในหน้านี้ยังรับรูปไม่ได้ ลองใช้ไฟล์ PDF ที่มีตัวอักษร หรือใช้ API key ของผู้ให้บริการ', 0);
    opts.images = images.slice(0, lim.maxImages || images.length);
  }
  try {
    const r = await s(flat.length === 1 ? flat[0].content : flat, opts);
    return { text: r.text };
  } catch (e) {
    throw new LLMError(e?.code === 'rate_limited' ? 'มีคนใช้เยอะ รอสักครู่แล้วลองใหม่' : e?.code === 'not_granted' ? 'ยังไม่ได้อนุญาตให้หน้านี้ใช้ Claude' : (e?.message || 'Claude ตอบไม่ได้'), 0);
  }
}

// tier: 'fast' (เจ้าของสัตว์) | 'strong' (อาจารย์ประเมิน, สร้างเคส)
export async function ai(tier, req) {
  if (cfg.provider === 'here') { if (!CAPS.sample) throw new LLMError('หน้านี้ใช้ Claude ในตัวไม่ได้ กด "ตั้งค่า AI" เพื่อเลือกผู้ให้บริการ', 0); return viaSample(tier, req); }
  if (cfg.provider === 'server') {
    if (!server) throw new LLMError('ไม่พบ AI ของเซิร์ฟเวอร์', 0);
    let r; try { r = await fetch('api/llm', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vil-code': cfg.accessCode || '' }, body: JSON.stringify({ tier, ...req }) }); }
    catch (_) { throw new LLMError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 0); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new LLMError(j.error || `เซิร์ฟเวอร์ตอบ ${r.status}`, r.status);
    return j;
  }
  if (!aiReady()) throw new LLMError('ยังไม่ได้ตั้งค่า AI กดปุ่ม "ตั้งค่า AI" ด้านบน', 0);
  return call({ provider: cfg.provider, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: tier === 'strong' ? cfg.modelStrong : cfg.modelFast, ...req });
}

/* ---------------- the panel ---------------- */
export function openSettings() {
  let models = [], status = '', showKey = false;
  const m = modal('<div id="aiPanel"></div>', { wide: true, onClose: save });
  const root = m.el.querySelector('#aiPanel');

  const card = (id, title, desc, extra = '') => `<label class="pcard ${cfg.provider === id ? 'on' : ''}"><input type="radio" name="prov" value="${id}" ${cfg.provider === id ? 'checked' : ''}><span><b>${title}</b>${extra}<br><span class="hint">${desc}</span></span></label>`;

  const render = () => {
    const P = PROVIDERS[cfg.provider];
    const byok = !!P;
    const sugg = [...new Set([...(P?.models || []), ...models])].map(x => `<option value="${esc(x)}">`).join('');
    root.innerHTML = `
      <div class="row between"><h2 id="aiT">ตั้งค่า AI</h2><button class="ghost" data-close aria-label="ปิด">✕</button></div>
      <p class="hint">ขั้นที่ 1 เลือกว่าจะใช้ AI ของใคร</p>
      <div class="pgrid" role="radiogroup" aria-labelledby="aiT">
        ${CAPS.sample ? card('here', 'Claude ในหน้านี้', 'ใช้ได้ทันที ไม่ต้องมีคีย์ (เฉพาะตอนเปิดใน claude.ai)', ' <span class="tag ok">แนะนำ</span>') : ''}
        ${server ? card('server', 'AI ของเซิร์ฟเวอร์', `ผู้ดูแลตั้งคีย์ไว้แล้ว (${esc(server.label || server.provider)})`, ' <span class="tag ok">ไม่ต้องมีคีย์</span>') : ''}
        ${Object.entries(PROVIDERS).map(([k, v]) => card(k, v.label, v.desc)).join('')}
      </div>
      ${cfg.provider === 'server' && server?.gated ? `<label for="aiCode">รหัสเข้าใช้ <span class="hint">ขอจากผู้ดูแล</span></label><input id="aiCode" data-k="accessCode" value="${esc(cfg.accessCode)}" autocomplete="off">` : ''}
      ${byok ? `
      ${IN_ARTIFACT ? '<p class="cap" style="margin-top:14px"><strong>หมายเหตุ:</strong> หน้าใน claude.ai เรียกเว็บของผู้ให้บริการอื่นไม่ได้ ตั้งค่าไว้ได้ แต่จะใช้งานได้เมื่อนำไฟล์ไปเปิดในเครื่อง หรือวางบน GitHub / Vercel</p>' : ''}
      <div class="guide">
        <p class="hint" style="margin:0">ขั้นที่ 2 ขอ API key จาก ${esc(P.short)}</p>
        <ol>${P.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        ${P.keyUrl ? `<a class="btnlink" href="${esc(P.keyUrl)}" target="_blank" rel="noopener">เปิดหน้าขอคีย์ ↗</a>` : ''}
      </div>
      <label for="aiBase">Base URL ${cfg.provider === 'custom' ? '<span class="hint">ที่อยู่ API ของผู้ให้บริการ ลงท้ายด้วย /v1</span>' : '<span class="hint">ค่ามาตรฐาน ไม่ต้องแก้</span>'}</label>
      <input id="aiBase" data-k="baseUrl" value="${esc(cfg.baseUrl || P.base)}" ${cfg.provider === 'custom' ? '' : 'readonly'} placeholder="https://…/v1">
      ${P.presets ? `<div class="row" style="margin-top:8px">${P.presets.map(([n, u]) => `<button class="chip" data-preset="${esc(u)}">${esc(n)}</button>`).join('')}</div>` : ''}
      <label for="aiKey">ขั้นที่ 3 วาง API key</label>
      <div class="row"><input id="aiKey" data-k="apiKey" type="${showKey ? 'text' : 'password'}" value="${esc(cfg.apiKey)}" placeholder="${esc(P.keyHint)}" autocomplete="off" style="flex:1"><button class="ghost" data-x="peek">${showKey ? 'ซ่อน' : 'แสดง'}</button></div>
      <label class="check"><input type="checkbox" data-k="remember" ${cfg.remember ? 'checked' : ''}> จำคีย์ไว้ในเบราว์เซอร์นี้ <span class="hint">อย่าติ๊กบนเครื่องสาธารณะ</span></label>
      <p class="hint">คีย์ถูกส่งจากเบราว์เซอร์ตรงไปที่ ${esc(P.short)} เท่านั้น</p>
      <p class="hint" style="margin-top:14px">ขั้นที่ 4 เลือกรุ่นโมเดล ${P.models.length ? '' : '(กด "โหลดรายชื่อรุ่น" หลังใส่คีย์)'}</p>
      <datalist id="aiModels">${sugg}</datalist>
      <div class="two">
        <div><label for="aiFast">สำหรับเจ้าของสัตว์ <span class="hint">รุ่นเร็ว ถูก</span></label><input id="aiFast" data-k="modelFast" list="aiModels" value="${esc(cfg.modelFast)}"></div>
        <div><label for="aiStrong">สำหรับอาจารย์และสร้างเคส <span class="hint">รุ่นคิดลึก</span></label><input id="aiStrong" data-k="modelStrong" list="aiModels" value="${esc(cfg.modelStrong)}"></div>
      </div>` : ''}
      <div class="row" style="margin-top:16px">
        ${byok ? '<button data-x="models">โหลดรายชื่อรุ่น</button>' : ''}
        <button data-x="test" ${cfg.provider ? '' : 'disabled'}>ทดสอบการเชื่อมต่อ</button>
        <button class="pri" data-close>บันทึก</button>
      </div>
      <p class="status" aria-live="polite">${esc(status)}</p>`;
  };
  const setStatus = t => { status = t; const s = root.querySelector('.status'); if (s) s.textContent = t; };

  root.addEventListener('change', e => {
    if (e.target.name === 'prov') {
      const p = e.target.value; cfg.provider = p; models = []; status = '';
      const P = PROVIDERS[p];
      if (P) { cfg.baseUrl = p === 'custom' ? '' : P.base; cfg.modelFast = P.fast || ''; cfg.modelStrong = P.strong || ''; }
      save(); render();
    }
  });
  root.addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    cfg[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
    save();
  });
  root.addEventListener('click', async e => {
    const pre = e.target.closest('[data-preset]');
    if (pre) { cfg.baseUrl = pre.dataset.preset; save(); render(); return; }
    const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
    if (x === 'peek') { showKey = !showKey; render(); }
    if (x === 'models') {
      setStatus('กำลังโหลดรายชื่อรุ่น…');
      try { models = await listModels({ ...cfg, baseUrl: cfg.baseUrl || PROVIDERS[cfg.provider].base }); render(); setStatus(`พบ ${models.length} รุ่น คลิกช่องรุ่นแล้วเลือกจากรายการ`); }
      catch (err) { setStatus('โหลดไม่ได้: ' + (IN_ARTIFACT ? 'หน้าใน claude.ai เรียกเว็บอื่นไม่ได้' : err.message)); }
    }
    if (x === 'test') {
      setStatus('กำลังทดสอบ…');
      try {
        const t0 = performance.now();
        const r = await ai('fast', { system: 'Reply with exactly: OK', messages: [{ role: 'user', content: 'ping' }], maxTokens: 20 });
        setStatus(`เชื่อมต่อได้ ตอบใน ${((performance.now() - t0) / 1000).toFixed(1)} วินาที: "${String(r.text).trim().slice(0, 40)}"`);
      } catch (err) { setStatus('ไม่ผ่าน: ' + err.message); }
    }
  });
  render();
}
