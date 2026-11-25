// bundle.js — pack selected cases into a .vilpack.zip and open it again.
// Case files inside are AES-GCM encrypted with a key derived from the class code (PBKDF2).
// This stops anyone reading the answer key by unzipping; it does not stop a student who
// knows the class code and inspects the page in dev tools. For a hard lock, grade on a server.
/* global JSZip */
import { parseCase, cardOf } from './case.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ITER = 200000;

async function keyFrom(code, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(code).trim()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), data: b64(ct) };
}
async function open(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
  return JSON.parse(dec.decode(pt));
}
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');

// opts: {title, instructions, due, order:'any'|'sequence', reveal:'after-each'|'after-all', classCode, tasks:[{case, quota, persona, brief, attempts}]}
export async function packBundle(opts) {
  if (!opts.classCode || String(opts.classCode).trim().length < 4) throw new Error('รหัสห้องต้องยาวอย่างน้อย 4 ตัวอักษร');
  if (!opts.tasks.length) throw new Error('ยังไม่ได้เลือกเคส');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await keyFrom(opts.classCode, salt);
  const zip = new JSZip();
  const tasks = [];
  for (const [i, t] of opts.tasks.entries()) {
    const id = `t${i + 1}`;
    const card = { ...cardOf(t.case), quota: Number(t.quota) || t.case.quota, persona: t.persona || t.case.meta.persona || '' };
    zip.file(`cases/${id}.vilcase`, JSON.stringify(await seal(key, { md: t.case.md, quota: card.quota, persona: card.persona, brief: t.brief || '' })));
    tasks.push({ id, file: `cases/${id}.vilcase`, brief: t.brief || '', attempts: Number(t.attempts) || 0, card });
  }
  const manifest = {
    format: 'vilpack/1', id: rid(), title: opts.title || 'ชุดฝึกซักประวัติ', instructions: opts.instructions || '', due: opts.due || '',
    order: opts.order || 'any', reveal: opts.reveal || 'after-each', created: new Date().toISOString(),
    kdf: { name: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt) }, check: await seal(key, { ok: 'vilpack' }), tasks,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('README.txt', `${manifest.title}\n\nวิธีใช้: เปิดหน้า "ฝึกซักประวัติ" ของ Vet Interview Lab แล้วลากไฟล์ zip นี้ใส่ ใส่รหัสห้องที่อาจารย์ให้ ไม่ต้องแตกไฟล์\nมี ${tasks.length} เคส${manifest.due ? ` ส่งภายใน ${manifest.due}` : ''}\n`);
  return { blob: await zip.generateAsync({ type: 'blob' }), manifest };
}

export async function teacherZip(cases, title = 'cases') {
  const zip = new JSZip();
  for (const c of cases) zip.file(`${c.id}.md`, c.md);
  return zip.generateAsync({ type: 'blob' });
}

export async function readBundle(file) {
  const zip = await JSZip.loadAsync(file);
  const mf = zip.file('manifest.json');
  if (!mf) throw new Error('ไม่ใช่ไฟล์ Bundle ของ Vet Interview Lab (ไม่มี manifest.json)');
  const manifest = JSON.parse(await mf.async('string'));
  if (manifest.format !== 'vilpack/1') throw new Error('รูปแบบ Bundle ไม่รองรับ: ' + manifest.format);
  const files = {};
  for (const t of manifest.tasks) files[t.id] = JSON.parse(await zip.file(t.file).async('string'));
  return { manifest, files };
}

export async function unlockBundle({ manifest, files }, classCode) {
  const key = await keyFrom(classCode, unb64(manifest.kdf.salt));
  try { await open(key, manifest.check); } catch (_) { throw new Error('รหัสห้องไม่ถูกต้อง'); }
  const out = [];
  for (const t of manifest.tasks) {
    const box = await open(key, files[t.id]);
    const c = parseCase(box.md, t.id + '.md');
    c.quota = box.quota || c.quota; c.persona = box.persona; c.brief = box.brief;
    out.push({ ...t, case: c });
  }
  return out;
}
