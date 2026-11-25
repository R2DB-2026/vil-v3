// studio.js — teacher side: PDF / photos → anonymous case .md, case library, Bundle packing, class results.
/* global pdfjsLib */
import { ai } from './settings.js';
import { parseJSON } from './llm-core.js';
import { parseCase, checkCase, setMeta, LEVELS, PERSONAS, SECTIONS } from './case.js';
import { redact, highlight } from './redact.js';
import { packBundle, teacherZip } from './bundle.js';
import { mountInterview } from './interview-ui.js';
import { loadRules } from './engine.js';
import { libraryCases } from './data.js';
import { esc, store, download, modal } from './caps.js';

let view = null;
const sp = s => s === 'cat' ? 'แมว' : s === 'dog' ? 'สุนัข' : '?';
const rid = () => Math.random().toString(36).slice(2, 7);
const ls = { get: (k, d) => store.get(k, d), set: (k, v) => store.set(k, v) };

const st = {
  tab: 'pdf', repo: [], local: ls.get('vil.studio.local', {}), sel: ls.get('vil.studio.sel', []), warn: {},
  pack: ls.get('vil.studio.pack', { title: '', instructions: '', due: '', order: 'any', reveal: 'after-each', classCode: '', tasks: {} }),
  pdf: { files: [], mode: 'single', words: '', level: 'Intermediate', persona: '', emphasis: '', finalDx: '', perturb: false, imagesOk: false, busy: false, log: '' },
  filter: { q: '', species: '', level: '', status: '' }, results: [],
};
const saveLocal = () => ls.set('vil.studio.local', st.local);
const saveSel = () => { ls.set('vil.studio.sel', st.sel); const n = document.getElementById('selCount'); if (n) n.textContent = st.sel.length ? `(${st.sel.length})` : ''; };
const savePack = () => ls.set('vil.studio.pack', st.pack);

function allCases() {
  const m = new Map(st.repo.map(c => [c.id, { ...c, src: 'repo' }]));
  for (const md of Object.values(st.local)) { const c = parseCase(md); m.set(c.id, { ...c, src: m.has(c.id) ? 'แก้จากคลังตัวอย่าง' : 'สร้างในเครื่องนี้' }); }
  return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
}
const byId = id => allCases().find(c => c.id === id);

export function renderStudio(root) {
  st.repo = libraryCases();
  root.innerHTML = `<nav class="tabs" role="tablist" aria-label="เครื่องมืออาจารย์">
    <button role="tab" data-tab="pdf">1. สร้างเคสจาก PDF / รูปถ่าย</button>
    <button role="tab" data-tab="lib">2. คลังเคส</button>
    <button role="tab" data-tab="pack">3. แพ็ก Bundle <span id="selCount"></span></button>
    <button role="tab" data-tab="results">4. ตรวจผล</button>
  </nav><div id="sview"></div>`;
  view = root.querySelector('#sview');
  root.querySelectorAll('[role=tab]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
  saveSel();
  go(st.tab);
}

function go(tab) {
  st.tab = tab;
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  ({ pdf: tabPdf, lib: tabLib, pack: tabPack, results: tabResults })[tab]();
  window.scrollTo(0, 0);
}

function dropZone(el, accept, onFiles) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = true; inp.hidden = true; el.appendChild(inp);
  el.addEventListener('click', e => { if (e.target !== inp) inp.click(); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
  ['dragover', 'dragenter'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, () => el.classList.remove('over')));
  el.addEventListener('drop', e => { e.preventDefault(); onFiles([...e.dataTransfer.files]); });
  inp.addEventListener('change', () => { onFiles([...inp.files]); inp.value = ''; });
}

/* ---------------- 1. PDF / photos → case ---------------- */
// Many Thai PDFs store shifted tone marks/vowels in the Private Use Area (U+F700–F71A).
const THAI_PUA = { 0xF700: 0x0E10, 0xF701: 0x0E34, 0xF702: 0x0E35, 0xF703: 0x0E36, 0xF704: 0x0E37, 0xF705: 0x0E48, 0xF706: 0x0E49, 0xF707: 0x0E4A, 0xF708: 0x0E4B, 0xF709: 0x0E4C, 0xF70A: 0x0E48, 0xF70B: 0x0E49, 0xF70C: 0x0E4A, 0xF70D: 0x0E4B, 0xF70E: 0x0E4C, 0xF70F: 0x0E0D, 0xF710: 0x0E31, 0xF711: 0x0E4D, 0xF712: 0x0E47, 0xF713: 0x0E48, 0xF714: 0x0E49, 0xF715: 0x0E4A, 0xF716: 0x0E4B, 0xF717: 0x0E4C, 0xF718: 0x0E38, 0xF719: 0x0E39, 0xF71A: 0x0E3A };
const fixThai = t => t.replace(/[-]/g, c => String.fromCharCode(THAI_PUA[c.charCodeAt(0)] || 0))
  .replace(/([่-์])([ัิ-ฺ็])/g, '$2$1')
  .replace(/ +(?=[ัำ-ฺ็-๎])/g, '');

let pdfReady = null;
function ensurePdfjs() {
  if (pdfReady) return pdfReady;
  pdfReady = new Promise((res, rej) => {
    if (window.pdfjsLib) return res(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(pdfjsLib); };
    s.onerror = () => { pdfReady = null; rej(new Error('โหลดตัวอ่าน PDF ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่')); };
    document.head.appendChild(s);
  });
  return pdfReady;
}

const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('เปิดรูปนี้ไม่ได้ (ถ้าเป็น HEIC ให้แปลงเป็น JPG ก่อน)')); im.src = src; });
const fileToDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

async function readPdf(file) {
  const lib = await ensurePdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let line = '', lastY = null, lastEnd = null;
    for (const it of tc.items) {
      if (!it.str && !it.hasEOL) continue;
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
      if (lastY !== null && Math.abs(y - lastY) > h * 0.5) { text += line.trim() + '\n'; line = ''; lastEnd = null; }
      if (lastEnd !== null && x - lastEnd > h * 0.22 && !line.endsWith(' ')) line += ' ';
      line += it.str;
      if (it.hasEOL) { text += line.trim() + '\n'; line = ''; lastEnd = null; } else lastEnd = Math.max(lastEnd ?? -Infinity, x + it.width);
      lastY = y;
    }
    text += line.trim() + `\n\n--- หน้า ${p} ---\n\n`;
  }
  text = fixThai(text).replace(/[ \t]{2,}/g, ' ');
  const scanned = text.replace(/--- หน้า \d+ ---|\s/g, '').length < 40 * doc.numPages;
  const pages = [];
  if (scanned) for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
    const page = await doc.getPage(p), vp = page.getViewport({ scale: 1.6 });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    pages.push({ src: cv.toDataURL('image/jpeg', 0.85), rects: [] });
  }
  return { name: file.name, kind: scanned ? 'images' : 'text', pages: doc.numPages, raw: text, imgs: pages };
}

async function readImage(file) {
  const src = await fileToDataUrl(file);
  await loadImg(src);
  return { name: file.name, kind: 'images', pages: 1, raw: '', imgs: [{ src, rects: [] }] };
}

function rerunRedact() {
  const words = st.pdf.words.split('\n');
  for (const f of st.pdf.files) if (f.kind === 'text' && !f.edited) { const r = redact(f.raw, words); f.text = r.text; f.counts = r.counts; f.total = r.total; }
}

// Draw black boxes on a photo/scan: drag on the image. Rects are stored in image pixels.
async function mountRedactor(holder, pg, onChange) {
  const im = await loadImg(pg.src);
  holder.innerHTML = `<div class="redactor"><canvas tabindex="0" aria-label="ลากบนรูปเพื่อระบายดำ"></canvas><div class="row"><button class="ghost" data-u>ย้อนกลับ</button><button class="ghost" data-c>ล้างทั้งหมด</button><span class="hint">${pg.rects.length} กรอบ</span></div></div>`;
  const cv = holder.querySelector('canvas'), ctx = cv.getContext('2d');
  const W = Math.min(im.width, 900), k = W / im.width;
  cv.width = W; cv.height = Math.round(im.height * k);
  let drag = null;
  const paint = () => {
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    ctx.fillStyle = '#000';
    for (const [x, y, w, h] of pg.rects) ctx.fillRect(x * k, y * k, w * k, h * k);
    if (drag) { ctx.strokeStyle = '#ff5a2a'; ctx.lineWidth = 2; ctx.strokeRect(drag.x, drag.y, drag.w, drag.h); }
    holder.querySelector('.hint').textContent = `${pg.rects.length} กรอบ`;
  };
  const pos = e => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * cv.width / b.width, y: (e.clientY - b.top) * cv.height / b.height }; };
  cv.addEventListener('pointerdown', e => { const p = pos(e); drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, w: 0, h: 0 }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!drag) return; const p = pos(e); drag.x = Math.min(drag.x0, p.x); drag.y = Math.min(drag.y0, p.y); drag.w = Math.abs(p.x - drag.x0); drag.h = Math.abs(p.y - drag.y0); paint(); });
  cv.addEventListener('pointerup', () => { if (drag && drag.w > 4 && drag.h > 4) pg.rects.push([drag.x / k, drag.y / k, drag.w / k, drag.h / k]); drag = null; paint(); onChange?.(); });
  holder.querySelector('[data-u]').addEventListener('click', () => { pg.rects.pop(); paint(); onChange?.(); });
  holder.querySelector('[data-c]').addEventListener('click', () => { pg.rects = []; paint(); onChange?.(); });
  paint();
}

// Flatten a page with its black boxes into a JPEG (base64), longest side ≤ 1600 px.
async function flatten(pg) {
  const im = await loadImg(pg.src);
  const k = Math.min(1, 1600 / Math.max(im.width, im.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
  const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0, cv.width, cv.height); ctx.fillStyle = '#000';
  for (const [x, y, w, h] of pg.rects) ctx.fillRect(x * k, y * k, w * k, h * k);
  return cv.toDataURL('image/jpeg', 0.8).split(',')[1];
}

const TIPS = `
  <div class="row between"><h2>เคล็ดลับการสร้างเคสจากเวชระเบียน</h2><button class="ghost" data-close aria-label="ปิด">✕</button></div>
  <p class="hint">เวชระเบียนคือแรงบันดาลใจ ไม่ต้องครบทุกส่วน AI จะคงโรคและข้อมูลสำคัญไว้ให้ใกล้ของจริงที่สุด แล้วเติมส่วนที่ขาดให้สอดคล้องกับโรค</p>
  <div class="tips">
    <div><h3>1. สิ่งที่ควรมีในไฟล์</h3><ul>
      <li><b>Final diagnosis ที่ยืนยันแล้ว</b> ถ้าไม่มีในไฟล์ ให้พิมพ์ในช่อง "Final diagnosis" ระบบจะยึดตามนั้น</li>
      <li>สิ่งที่เจ้าของเล่า และไทม์ไลน์ของอาการ</li>
      <li>ผลตรวจร่างกาย แล็บพร้อมค่าอ้างอิง และผลภาพวินิจฉัย</li>
      <li>การรักษาและผลลัพธ์ (ช่วยให้เฉลยสมจริง)</li>
      <li>ขาดบางส่วนได้ ระบบจะระบุในเฉลยว่าส่วนไหนแต่งเพิ่ม</li></ul></div>
    <div><h3>2. ถ้าเป็นรูปถ่าย</h3><ul>
      <li>ถ่ายตรง แสงพอ ตัวหนังสืออ่านออก หน้าละ 1 รูป ไม่เกิน 6 รูปต่อเคส</li>
      <li><b>ลากกรอบบนรูปเพื่อระบายดำ</b> ชื่อ เบอร์โทร HN ที่อยู่ ก่อนกดสร้าง</li>
      <li>รูป HEIC จาก iPhone ให้แปลงเป็น JPG ก่อน (หรือตั้งกล้องเป็น Most Compatible)</li></ul></div>
    <div><h3>3. เลือกรูปแบบ</h3><ul>
      <li><b>1 ไฟล์ = 1 เคส</b>: ได้เคสใกล้ของจริงที่สุด</li>
      <li><b>หลายไฟล์โรคเดียวกัน = 1 เคสผสม</b>: ปลอดภัยกว่า เหมาะกับโรคหายากที่คนอาจจำได้</li></ul></div>
    <div><h3>4. ความเป็นส่วนตัว</h3><ul>
      <li>PDF ที่มีตัวอักษร ระบบปิดข้อมูลให้อัตโนมัติ แต่ต้องตรวจด้วยตาทุกครั้ง และเติมคำที่ต้องปิดเองได้</li>
      <li>ขออนุญาตคณะหรือเจ้าของข้อมูลก่อนใช้เวชระเบียนจริง</li></ul></div>
    <div><h3>5. หลังได้เคส</h3><ul>
      <li>อ่าน "ข้อสังเกตจาก AI ผู้ตรวจ" โดยเฉพาะ Final diagnosis ตรงหรือไม่</li>
      <li>อ่านเฉลย (E) และ Critical miss (F) แล้วกด "ทดลองคุย" 1 รอบ</li>
      <li>พอใจแล้วกด "ทำเครื่องหมายว่าตรวจแล้ว" จึงค่อยแพ็กให้นักศึกษา</li></ul></div>
  </div>
  <div class="row" style="margin-top:16px"><button class="pri" data-close autofocus>เข้าใจแล้ว</button></div>`;
const showTips = () => modal(TIPS, { wide: true, onClose: () => store.set('vil.tips.seen', 1) });

function tabPdf() {
  const P = st.pdf;
  const hasImg = P.files.some(f => f.kind === 'images');
  view.innerHTML = `
  <section class="sheet"><div class="row between"><h2>สร้างเคสใหม่จากเวชระเบียนจริง</h2><button id="tips">เคล็ดลับ</button></div>
    <p class="hint">รับไฟล์ PDF และรูปถ่ายเวชระเบียน (JPG, PNG) อ่านในเบราว์เซอร์นี้เท่านั้น สิ่งที่ส่งให้ AI คือข้อความหรือรูปที่ปิดข้อมูลส่วนตัวแล้ว</p>
    <div class="drop drop-xl" id="pdrop" tabindex="0" role="button" aria-label="เลือกไฟล์ PDF หรือรูปถ่าย">
      <svg width="48" height="48" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 26V8m0 0-7 7m7-7 7 7M8 28v4h24v-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <b>ลากไฟล์ PDF หรือรูปถ่ายมาวางที่นี่</b><span>หรือกดเพื่อเลือกไฟล์ · หลายไฟล์ได้ · มือถือกดแล้วถ่ายรูปได้เลย</span></div>
    ${P.log ? `<p class="status">${esc(P.log)}</p>` : ''}
  </section>
  ${P.files.length ? `
  <section class="sheet"><h2>ตรวจการปิดข้อมูลส่วนตัว</h2>
    <div class="two"><div>
      <label>รูปแบบ</label>
      <div class="seg"><label><input type="radio" name="mode" value="single" ${P.mode === 'single' ? 'checked' : ''}> 1 ไฟล์ = 1 เคส <span class="hint">ใกล้ของจริงที่สุด</span></label>
      <label><input type="radio" name="mode" value="composite" ${P.mode === 'composite' ? 'checked' : ''}> ทุกไฟล์ (โรคเดียวกัน) = 1 เคสผสม <span class="hint">ปลอดภัยกว่า</span></label></div>
    </div><div>
      <label for="pw">คำที่ต้องปิดเพิ่ม <span class="hint">บรรทัดละคำ เช่น ชื่อเล่นเจ้าของ ชื่อหมู่บ้าน (ใช้กับไฟล์ที่เป็นตัวอักษร)</span></label>
      <textarea id="pw">${esc(P.words)}</textarea>
    </div></div>
    ${P.files.map((f, i) => `<div class="fileblock">
      <div class="row between"><b>${esc(f.name)}</b><span class="row"><span class="tag">${f.pages} หน้า</span>${f.kind === 'images' ? `<span class="tag warn">รูปภาพ · ระบายดำเอง</span>` : `<span class="tag">ปิดอัตโนมัติ ${f.total} จุด</span>`}<button class="ghost" data-rm="${i}">เอาออก</button></span></div>
      ${f.kind === 'images' ? `<p class="hint">ลากเป็นกรอบบนรูปเพื่อระบายดำชื่อ เบอร์โทร HN และที่อยู่ ส่วนที่ดำจะไม่ถูกส่งให้ AI</p>${f.imgs.map((_, j) => `<div class="rd" data-f="${i}" data-p="${j}"></div>`).join('')}${f.pages > f.imgs.length ? `<p class="note">ส่งเฉพาะ ${f.imgs.length} หน้าแรก</p>` : ''}` :
        `<p class="hint">${Object.entries(f.counts || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || 'ไม่พบข้อมูลที่ต้องปิดตามรูปแบบ ตรวจด้วยตาอีกครั้ง'}</p>
        <details><summary>ดูจุดที่ปิด</summary><div class="preview">${highlight(esc(f.text))}</div></details>
        <label for="pt${i}">ข้อความที่จะส่งให้ AI <span class="hint">แก้เองได้</span></label><textarea id="pt${i}" data-pt="${i}" class="code" style="min-height:180px">${esc(f.text)}</textarea>`}
    </div>`).join('')}
    ${hasImg ? `<label class="check" style="margin-top:14px"><input type="checkbox" id="imgok" ${P.imagesOk ? 'checked' : ''}> ฉันระบายดำข้อมูลระบุตัวตนในรูปทุกรูปแล้ว</label>` : ''}
  </section>
  <section class="sheet"><h2>ตั้งค่าเคส</h2>
    <label for="pdx">Final diagnosis ที่ยืนยันแล้ว <span class="hint">แนะนำให้ใส่ ระบบจะยึดโรคนี้เป็นเฉลย</span></label>
    <input id="pdx" value="${esc(P.finalDx)}" placeholder="เช่น Pyometra (closed-cervix) หรือ Feline lower urinary tract obstruction">
    <div class="two"><div><label for="plv">ระดับ</label><select id="plv">${Object.keys(LEVELS).map(l => `<option ${l === P.level ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label for="pps">บุคลิกเจ้าของ</label><select id="pps"><option value="">ให้ AI เลือกให้เหมาะกับเคส</option>${PERSONAS.map(p => `<option ${p === P.persona ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
    <label for="pem">จุดสอนที่อยากเน้น <span class="hint">ไม่บังคับ เช่น "ให้มีตัวลวงเรื่องยาคนที่เจ้าของให้เอง"</span></label><textarea id="pem">${esc(P.emphasis)}</textarea>
    <label class="check"><input type="checkbox" id="ppt" ${P.perturb ? 'checked' : ''}> ขยับค่าแล็บเล็กน้อย (ไม่เกิน ±5%) เพื่อไม่ให้ย้อนรอยเคสจริงได้</label>
    <div class="row" style="margin-top:16px"><button class="pri" id="gen" ${P.busy ? 'disabled' : ''}>สร้างเคส ${P.mode === 'composite' ? '1 เคสผสม' : P.files.length + ' เคส'}</button><span class="wait" ${P.busy ? '' : 'hidden'}><span class="dot"></span><span id="glog">${esc(P.log)}</span></span></div>
  </section>` : ''}`;
  view.querySelector('#tips').addEventListener('click', showTips);
  dropZone(view.querySelector('#pdrop'), '.pdf,application/pdf,image/*', async files => {
    P.log = 'กำลังอ่านไฟล์…'; tabPdf();
    const errs = [];
    for (const f of files) {
      try {
        if (/pdf$/i.test(f.name) || f.type === 'application/pdf') P.files.push(await readPdf(f));
        else if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)) P.files.push(await readImage(f));
        else errs.push(`${f.name}: รับเฉพาะ PDF หรือรูปภาพ`);
      } catch (e) { errs.push(`${f.name}: ${e.message}`); }
    }
    rerunRedact(); P.log = errs.join(' · '); tabPdf();
  });
  if (!P.files.length) return;
  view.querySelectorAll('.rd').forEach(h => mountRedactor(h, P.files[+h.dataset.f].imgs[+h.dataset.p]));
  view.querySelectorAll('[name=mode]').forEach(r => r.addEventListener('change', () => { P.mode = r.value; tabPdf(); }));
  let tmr;
  view.querySelector('#pw').addEventListener('input', e => { P.words = e.target.value; clearTimeout(tmr); tmr = setTimeout(() => { P.files.forEach(f => f.edited = false); rerunRedact(); tabPdf(); const w = view.querySelector('#pw'); w.focus(); w.setSelectionRange(w.value.length, w.value.length); }, 800); });
  view.querySelectorAll('[data-pt]').forEach(t => t.addEventListener('input', () => { const f = P.files[t.dataset.pt]; f.text = t.value; f.edited = true; }));
  view.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { P.files.splice(+b.dataset.rm, 1); tabPdf(); }));
  view.querySelector('#imgok')?.addEventListener('change', e => { P.imagesOk = e.target.checked; });
  view.querySelector('#pdx').addEventListener('input', e => { P.finalDx = e.target.value; });
  view.querySelector('#plv').addEventListener('change', e => { P.level = e.target.value; });
  view.querySelector('#pps').addEventListener('change', e => { P.persona = e.target.value; });
  view.querySelector('#pem').addEventListener('input', e => { P.emphasis = e.target.value; });
  view.querySelector('#ppt').addEventListener('change', e => { P.perturb = e.target.checked; });
  view.querySelector('#gen').addEventListener('click', generate);
}

function inlineNote(t) { const s = document.createElement('p'); s.className = 'cap'; s.textContent = t; view.prepend(s); s.scrollIntoView({ block: 'center' }); setTimeout(() => s.remove(), 6000); }

async function generate() {
  const P = st.pdf;
  if (P.files.some(f => f.kind === 'images') && !P.imagesOk) { inlineNote('ติ๊กยืนยันว่าระบายดำข้อมูลในรูปแล้ว ก่อนกดสร้างเคส'); return; }
  P.busy = true; P.log = 'เตรียมข้อมูล…'; tabPdf();
  const setLog = t => { P.log = t; const g = document.getElementById('glog'); if (g) g.textContent = t; };
  const groups = P.mode === 'composite' ? [P.files] : P.files.map(f => [f]);
  const made = [];
  try {
    const template = st.repo.find(c => c.id === '04-dog-pyometra')?.md || st.repo[0]?.md || '';
    const R = await loadRules();
    for (const [gi, g] of groups.entries()) {
      setLog(`กำลังเขียนเคส ${gi + 1}/${groups.length} (ใช้เวลา 1-2 นาที)…`);
      let md = await synthesize(g, template, R.owner);
      const c0 = parseCase(md);
      const id = `gen-${c0.meta.species || 'case'}-${String(c0.meta.title || 'case').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'case'}-${rid()}`;
      md = setMeta(setMeta(setMeta(setMeta(md, 'id', id), 'status', 'draft'), 'source', g.length > 1 ? 'composite' : 'single'), 'source_count', g.length);
      setLog(`กำลังให้ AI ตรวจเคส ${gi + 1}/${groups.length} ซ้ำ…`);
      st.warn[id] = await reviewCase(md).catch(e => ({ error: e.message }));
      st.local[id] = md; saveLocal(); made.push(id);
    }
    P.busy = false; P.log = `สร้างแล้ว ${made.length} เคส (เป็น draft อยู่ในคลัง)`;
    editor(made[0], 'pdf');
  } catch (e) { P.busy = false; P.log = 'สร้างไม่สำเร็จ: ' + e.message; tabPdf(); }
}

async function synthesize(files, template, ownerRules) {
  const P = st.pdf;
  const system = `คุณคือผู้ช่วยอาจารย์สัตวแพทย์ ทำหน้าที่ใช้เวชระเบียนจริงเป็นแรงบันดาลใจ สร้าง "เคสฝึกซักประวัติ" สำหรับระบบที่ AI เล่นเป็นเจ้าของสัตว์

หลักสำคัญ
1. ใกล้ของจริงที่สุด: เวชระเบียนอาจไม่ครบ ให้คง final diagnosis, สปีชีส์, อาการเด่น, ไทม์ไลน์ และผลตรวจที่นำไปสู่การวินิจฉัย ให้ตรงกับเวชระเบียนมากที่สุด ห้ามเปลี่ยนโรค ส่วนที่ขาดให้เติมเท่าที่จำเป็นและต้องสอดคล้องกับโรคทางคลินิก
2. ใน ## E. ให้เพิ่มหัวข้อย่อย "ที่มาของเคส" แยกว่ารายละเอียดใดมาจากเวชระเบียน และรายละเอียดใดแต่งเพิ่ม
3. ไม่ระบุตัวตน: ห้ามมีชื่อคน ชื่อสัตว์จริง ชื่อคลินิก เบอร์ ที่อยู่ เลข HN วันที่จริง ให้แต่งชื่อสัตว์และเจ้าของใหม่ ใช้เวลาแบบสัมพัทธ์ ปัดอายุ/น้ำหนักเป็นค่าใกล้เคียง ข้อมูลที่หายากจนอาจย้อนรอยได้ ให้เปลี่ยนเป็นรายละเอียดที่ให้คุณค่าการเรียนเท่ากัน
4. เขียนจากมุมเจ้าของ: บล็อก B คือสิ่งที่เจ้าของรู้ เป็นคำพูดภาษาชาวบ้าน ติดป้าย V/T/S/U ทุกแถว ใส่ตัวลวง (red herring) ที่สมจริงอย่างน้อย 1 จุด
5. ทำตามรูปแบบไฟล์ตัวอย่างทุกหัวข้อ: frontmatter ครบ (id, title = ชื่อโรคภาษาอังกฤษ, species เป็น dog หรือ cat, system เป็นภาษาไทย, level, quota, urgency เป็น low/medium/high/critical, persona, status, version, patient, opening) และหัวข้อ ## A. ถึง ## H.
6. ตาราง D ต้องมี 3 คอลัมน์: รายการ | ผล | ค่าอ้างอิงตัวอย่าง / หมายเหตุ ใช้ค่าจากเวชระเบียนเมื่อมี
7. บล็อก F ต้องมีบรรทัดที่ขึ้นต้นด้วย "- Critical miss:" อย่างน้อย 1 ข้อ และบรรทัด Safety
8. ตอบเป็นไฟล์ markdown ไฟล์เดียว เริ่มด้วย --- ห้ามมีข้อความอื่นก่อนหรือหลัง

ความหมายของป้ายและกติกาเจ้าของ:
${ownerRules}

ไฟล์ตัวอย่าง (ใช้เป็นแม่แบบรูปแบบเท่านั้น ห้ามลอกเนื้อหา):
${template}`;
  const content = [{ type: 'text', text: `ตั้งค่า: ระดับ ${P.level} (โควตา ${LEVELS[P.level]} turn) · บุคลิกเจ้าของ: ${P.persona || 'เลือกให้เหมาะกับเคส'}
${P.finalDx ? `Final diagnosis ที่อาจารย์ยืนยัน (ต้องใช้ตามนี้ทุกตัวอักษรใน ## E.): ${P.finalDx}` : 'Final diagnosis: ใช้ตามที่ระบุในเวชระเบียน ถ้าไม่ชัดให้เลือกโรคที่หลักฐานในเวชระเบียนสนับสนุนมากที่สุด และระบุใน "ที่มาของเคส" ว่าอนุมานเอง'}
${P.emphasis ? `จุดที่อาจารย์อยากเน้น: ${P.emphasis}` : ''}${P.perturb ? '\nให้ขยับค่าแล็บทุกตัวเล็กน้อยไม่เกิน ±5% โดยยังแปลผลได้เหมือนเดิม' : ''}
${files.length > 1 ? `รวม ${files.length} เวชระเบียนของโรคเดียวกันเป็นเคสผสม 1 เคส ห้ามยกรายละเอียดเฉพาะตัวของรายใดรายหนึ่งมาทั้งก้อน` : 'สร้าง 1 เคสจากเวชระเบียนนี้'}` }];
  for (const [i, f] of files.entries()) {
    content.push({ type: 'text', text: `\n=== เวชระเบียน ${i + 1} (ปิดข้อมูลส่วนตัวแล้ว) ===\n${f.kind === 'images' ? `(รูปถ่าย/ภาพสแกน ${f.imgs.length} หน้า ดูรูปที่แนบ)` : f.text}` });
    if (f.kind === 'images') for (const pg of f.imgs) content.push({ type: 'image', mime: 'image/jpeg', data: await flatten(pg) });
  }
  const r = await ai('strong', { system, messages: [{ role: 'user', content }], maxTokens: 12000 });
  let md = String(r.text || '').replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
  const k = md.indexOf('---'); if (k > 0) md = md.slice(k);
  if (!md.startsWith('---')) throw new Error('AI ไม่ได้ตอบเป็นไฟล์เคส ลองอีกครั้งหรือเปลี่ยนรุ่นโมเดล');
  return md + '\n';
}

async function reviewCase(md) {
  const P = st.pdf;
  const r = await ai('strong', {
    system: 'คุณคืออาจารย์สัตวแพทย์ผู้ตรวจเคสฝึกก่อนใช้สอน ตรวจอย่างเข้มงวดและตอบเป็น JSON เท่านั้น',
    messages: [{ role: 'user', content: `ตรวจไฟล์เคสนี้ แล้วตอบ JSON: {"final_dx":"โรคที่เคสนี้ใช้เป็นเฉลย","dx_match":"ตรงกับ Final diagnosis ที่อาจารย์ใส่หรือไม่ อธิบายสั้น (ถ้าอาจารย์ไม่ได้ใส่ ให้ประเมินว่าหลักฐานในเคสสนับสนุนโรคนี้แค่ไหน)","pii":["ข้อมูลที่อาจระบุตัวตนได้ที่ยังหลงเหลือ"],"consistency":["จุดที่ผลตรวจ/อาการ/ไทม์ไลน์ขัดกับโรคหรือขัดกันเอง"],"teaching":["จุดที่ควรปรับเพื่อการสอน"]} ถ้าไม่มีให้เป็น array ว่าง\n\nFinal diagnosis ที่อาจารย์ใส่: ${P.finalDx || '(ไม่ได้ใส่)'}\n\n${md}` }],
    maxTokens: 2000, json: true,
  });
  return parseJSON(r.text);
}

/* ---------------- 2. library ---------------- */
function tabLib() {
  const F = st.filter;
  const cases = allCases().filter(c => (!F.species || c.meta.species === F.species) && (!F.level || c.meta.level === F.level) && (!F.status || (c.meta.status || 'draft') === F.status) &&
    (!F.q || (c.id + ' ' + c.meta.patient + ' ' + c.meta.title + ' ' + (c.meta.system || '')).toLowerCase().includes(F.q.toLowerCase())));
  view.innerHTML = `
  <section class="sheet"><div class="row between"><h2>คลังเคส <span class="hint">${allCases().length} เคส</span></h2>
    <div class="row"><button id="dlsel" ${st.sel.length ? '' : 'disabled'}>ดาวน์โหลดที่เลือกเป็น .md</button><button class="pri" id="topack" ${st.sel.length ? '' : 'disabled'}>แพ็กที่เลือก (${st.sel.length}) →</button></div></div>
    <div class="row" style="margin-top:12px">
      <input id="fq" placeholder="ค้นหา ชื่อ โรค ระบบ" value="${esc(F.q)}" style="flex:2 1 200px">
      <select id="fs" style="flex:1 1 120px"><option value="">ทุกสปีชีส์</option><option value="dog" ${F.species === 'dog' ? 'selected' : ''}>สุนัข</option><option value="cat" ${F.species === 'cat' ? 'selected' : ''}>แมว</option></select>
      <select id="fl" style="flex:1 1 140px"><option value="">ทุกระดับ</option>${Object.keys(LEVELS).map(l => `<option ${F.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="ft" style="flex:1 1 140px"><option value="">ทุกสถานะ</option><option value="draft" ${F.status === 'draft' ? 'selected' : ''}>draft</option><option value="reviewed" ${F.status === 'reviewed' ? 'selected' : ''}>ตรวจแล้ว</option></select>
    </div>
    <div class="drop" id="mdrop" tabindex="0" role="button" style="margin-top:12px;padding:14px"><b>วางไฟล์เคส .md เพื่อเพิ่มเข้าคลัง</b></div>
    <div class="scroll" style="margin-top:12px"><table class="stack"><thead><tr><th>เลือก</th><th>เคส</th><th>ผู้ป่วย</th><th>ระดับ</th><th>สถานะ</th><th></th></tr></thead><tbody>
    ${cases.map(c => `<tr><td data-l="เลือก"><input type="checkbox" data-sel="${esc(c.id)}" ${st.sel.includes(c.id) ? 'checked' : ''} aria-label="เลือก ${esc(c.id)}"></td>
      <td data-l="เคส"><b>${esc(c.meta.title || c.id)}</b><br><span class="hint">${esc(c.id)} · ${c.src === 'repo' ? 'คลังตัวอย่าง' : esc(c.src)}</span></td>
      <td data-l="ผู้ป่วย">${sp(c.meta.species)} · ${esc(c.meta.patient)}</td>
      <td data-l="ระดับ">${esc(c.meta.level)} · ${c.quota}</td>
      <td data-l="สถานะ">${(c.meta.status || 'draft') === 'reviewed' ? `<span class="tag ok">ตรวจแล้ว</span>` : '<span class="tag warn">draft</span>'}${checkCase(c).length ? ` <span class="tag warn">${checkCase(c).length} จุดต้องแก้</span>` : ''}</td>
      <td><span class="row"><button data-edit="${esc(c.id)}">เปิด</button><button data-try="${esc(c.id)}">ทดลองคุย</button></span></td></tr>`).join('') || '<tr><td colspan="6" class="hint">ไม่พบเคส</td></tr>'}
    </tbody></table></div>
    <p class="note">เคสที่สร้างหรือแก้ในหน้านี้เก็บในเบราว์เซอร์นี้ ดาวน์โหลด .md ไปใส่โฟลเดอร์ cases/ ใน GitHub (และเพิ่มชื่อไฟล์ใน cases/index.json) เพื่อให้ทุกเครื่องเห็น</p>
  </section>`;
  const rf = () => { const p = document.activeElement?.id; tabLib(); if (p) { const el = document.getElementById(p); el?.focus(); if (el?.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); } };
  view.querySelector('#fq').addEventListener('input', e => { F.q = e.target.value; rf(); });
  view.querySelector('#fs').addEventListener('change', e => { F.species = e.target.value; tabLib(); });
  view.querySelector('#fl').addEventListener('change', e => { F.level = e.target.value; tabLib(); });
  view.querySelector('#ft').addEventListener('change', e => { F.status = e.target.value; tabLib(); });
  view.querySelectorAll('[data-sel]').forEach(x => x.addEventListener('change', () => { const id = x.dataset.sel; st.sel = x.checked ? [...new Set([...st.sel, id])] : st.sel.filter(s => s !== id); saveSel(); tabLib(); }));
  view.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editor(b.dataset.edit, 'lib')));
  view.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => testRun(b.dataset.try, 'lib')));
  view.querySelector('#topack').addEventListener('click', () => go('pack'));
  view.querySelector('#dlsel').addEventListener('click', async () => download(await teacherZip(st.sel.map(byId).filter(Boolean)), 'cases-selected.zip'));
  dropZone(view.querySelector('#mdrop'), '.md,text/markdown', async files => {
    for (const f of files.filter(f => /\.md$/i.test(f.name))) { const md = await f.text(); const c = parseCase(md, f.name); st.local[c.id] = md; }
    saveLocal(); tabLib();
  });
}

/* ---------------- editor ---------------- */
function editor(id, back) {
  const c = byId(id); if (!c) return go(back);
  let md = c.md;
  const w = st.warn[id];
  const draw = () => {
    const cc = parseCase(md), issues = checkCase(cc);
    view.querySelector('#side').innerHTML = `
      <div class="sheet"><span class="tag">${sp(cc.meta.species)} · ${esc(cc.meta.level)} · ${cc.quota} turn</span> ${(cc.meta.status || 'draft') === 'reviewed' ? `<span class="tag ok">ตรวจแล้ว${cc.meta.reviewed_by ? ' · ' + esc(cc.meta.reviewed_by) : ''}</span>` : '<span class="tag warn">draft</span>'}
        <p><b>${esc(cc.meta.patient)}</b></p><p class="quote">${esc(cc.meta.opening)}</p></div>
      <div class="sheet"><h3>ตรวจรูปแบบไฟล์</h3>${issues.length ? `<ul>${issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="hint">ครบทุกหัวข้อ</p>'}
        <p class="hint">${Object.keys(SECTIONS).map(k => `${k}${cc.sections[k] ? '✓' : '✗'}`).join(' ')} · แล็บ ${cc.labs.length} รายการ</p></div>
      ${w ? `<div class="sheet"><h3>ข้อสังเกตจาก AI ผู้ตรวจ</h3>${w.error ? `<p class="hint">ตรวจไม่สำเร็จ: ${esc(w.error)}</p>` :
        (w.final_dx ? `<p><b>Final diagnosis ในเคส:</b> ${esc(w.final_dx)}</p><p class="hint">${esc(w.dx_match || '')}</p>` : '') + [['pii', 'ข้อมูลที่อาจระบุตัวตน'], ['consistency', 'ความสอดคล้องทางคลินิก'], ['teaching', 'การสอน']].map(([k, t]) => `<p><b>${t}</b></p>${(w[k] || []).length ? `<ul>${w[k].map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="hint">ไม่พบ</p>'}`).join('')}</div>` : ''}`;
  };
  view.innerHTML = `<div class="row between" style="margin-bottom:12px"><h2>แก้ไขเคส <span class="hint">${esc(id)}</span></h2><button id="eback">← กลับ</button></div>
  <div class="two"><section class="sheet"><label for="emd" style="margin-top:0">ไฟล์เคส (.md)</label><textarea id="emd" class="code">${esc(md)}</textarea>
    <div class="row" style="margin-top:12px"><button class="pri" id="esave">บันทึก</button><button id="edl">ดาวน์โหลด .md</button><button id="etry">ทดลองคุยเป็นนักศึกษา</button>${c.src !== 'repo' ? '<button class="warn" id="edel">ลบจากเครื่องนี้</button>' : ''}</div>
    <div class="row" style="margin-top:12px"><input id="erev" placeholder="ชื่ออาจารย์ผู้ตรวจ" style="flex:1 1 200px"><button id="eok">ทำเครื่องหมายว่าตรวจแล้ว</button></div>
    <p class="status" id="est" aria-live="polite"></p></section>
  <aside id="side"></aside></div>`;
  draw();
  const ta = view.querySelector('#emd'), status = t => { view.querySelector('#est').textContent = t; };
  let tm; ta.addEventListener('input', () => { md = ta.value; clearTimeout(tm); tm = setTimeout(draw, 400); });
  const persist = () => { const cc = parseCase(md); if (cc.id !== id) delete st.local[id]; st.local[cc.id] = md; saveLocal(); if (cc.id !== id) { st.sel = st.sel.map(s => s === id ? cc.id : s); saveSel(); id = cc.id; } return cc; };
  view.querySelector('#eback').addEventListener('click', () => go(back));
  view.querySelector('#esave').addEventListener('click', () => { persist(); status('บันทึกในเครื่องนี้แล้ว'); });
  view.querySelector('#edl').addEventListener('click', () => { const cc = persist(); download(new Blob([md], { type: 'text/markdown' }), cc.id + '.md'); });
  view.querySelector('#etry').addEventListener('click', () => { persist(); testRun(id, 'edit'); });
  view.querySelector('#eok').addEventListener('click', () => {
    const who = view.querySelector('#erev').value.trim(); if (!who) { status('ใส่ชื่อผู้ตรวจก่อน'); return; }
    md = setMeta(setMeta(md, 'status', 'reviewed'), 'reviewed_by', who); ta.value = md; persist(); draw(); status('ทำเครื่องหมายแล้ว และบันทึกแล้ว');
  });
  view.querySelector('#edel')?.addEventListener('click', () => { delete st.local[id]; saveLocal(); st.sel = st.sel.filter(s => s !== id); saveSel(); go('lib'); });
}

function testRun(id, back) {
  const c = byId(id);
  view.innerHTML = `<div class="row between" style="margin-bottom:12px"><h2>ทดลองคุย <span class="hint">${esc(c.meta.title || id)} · ไม่บันทึกผล</span></h2></div><div id="iv"></div>`;
  mountInterview(view.querySelector('#iv'), c, { onExit: () => back === 'edit' ? editor(id, 'lib') : go(back), exitLabel: 'กลับไปหน้าเคส', onRetry: () => testRun(id, back) });
}

/* ---------------- 3. pack ---------------- */
function tabPack() {
  const K = st.pack;
  const tasks = st.sel.map(byId).filter(Boolean);
  const drafts = tasks.filter(c => (c.meta.status || 'draft') !== 'reviewed');
  view.innerHTML = `
  <section class="sheet"><h2>ข้อมูลชุดงาน</h2>
    <div class="two"><div><label for="kt">ชื่องาน</label><input id="kt" data-k="title" value="${esc(K.title)}" placeholder="เช่น อายุรศาสตร์ ปี 5 สัปดาห์ 3"></div>
    <div><label for="kd">ส่งภายใน <span class="hint">แสดงอย่างเดียว</span></label><input id="kd" data-k="due" type="date" value="${esc(K.due)}"></div></div>
    <label for="ki">คำชี้แจงถึงนักศึกษา</label><textarea id="ki" data-k="instructions">${esc(K.instructions)}</textarea>
    <div class="two"><div><label for="ko">ลำดับ</label><select id="ko" data-k="order"><option value="any" ${K.order === 'any' ? 'selected' : ''}>ทำเคสไหนก่อนก็ได้</option><option value="sequence" ${K.order === 'sequence' ? 'selected' : ''}>ต้องทำตามลำดับ</option></select></div>
    <div><label for="kr">เปิดเฉลย</label><select id="kr" data-k="reveal"><option value="after-each" ${K.reveal === 'after-each' ? 'selected' : ''}>หลังจบแต่ละเคส</option><option value="after-all" ${K.reveal === 'after-all' ? 'selected' : ''}>หลังทำครบทุกเคส</option></select></div></div>
    <label for="kc">รหัสห้อง <span class="hint">นักศึกษาต้องใช้เปิดไฟล์ บอกในห้องหรือ LMS แยกจากไฟล์</span></label>
    <div class="row"><input id="kc" data-k="classCode" value="${esc(K.classCode)}" style="flex:1" autocomplete="off"><button id="kgen">สุ่มรหัส</button></div>
  </section>
  <section class="sheet"><div class="row between"><h2>งานในชุด <span class="hint">${tasks.length} เคส</span></h2><button id="kadd">+ เลือกเคสเพิ่มจากคลัง</button></div>
    ${drafts.length ? `<p class="cap" style="margin-top:12px"><strong>${drafts.length} เคสยังเป็น draft</strong> ยังไม่มีอาจารย์ตรวจ ควรตรวจก่อนแจกนักศึกษา</p>` : ''}
    ${tasks.map((c, i) => { const t = K.tasks[c.id] || {}; return `<div style="padding:14px 0;border-bottom:1px solid var(--line)">
      <div class="row between"><b>${i + 1}. ${esc(c.meta.title || c.id)} <span class="hint">${sp(c.meta.species)} · ${esc(c.meta.patient)}</span></b>
        <span class="row"><button class="ghost" data-up="${i}" ${i ? '' : 'disabled'} aria-label="เลื่อนขึ้น">↑</button><button class="ghost" data-dn="${i}" ${i < tasks.length - 1 ? '' : 'disabled'} aria-label="เลื่อนลง">↓</button><button class="ghost" data-x="${esc(c.id)}">เอาออก</button></span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:10px">
        <div><label for="q${i}">โควตา turn</label><input id="q${i}" type="number" min="3" max="60" data-t="${esc(c.id)}" data-f="quota" value="${esc(t.quota || c.quota)}"></div>
        <div><label for="p${i}">บุคลิกเจ้าของ</label><select id="p${i}" data-t="${esc(c.id)}" data-f="persona"><option value="">ตามเคส (${esc(c.meta.persona || '-')})</option>${PERSONAS.map(p => `<option ${t.persona === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div><label for="a${i}">ทำได้กี่ครั้ง</label><select id="a${i}" data-t="${esc(c.id)}" data-f="attempts">${[[0, 'ไม่จำกัด'], [1, '1'], [2, '2'], [3, '3']].map(([v, l]) => `<option value="${v}" ${Number(t.attempts || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <label for="b${i}">โจทย์เพิ่ม <span class="hint">AI อาจารย์จะประเมินข้อนี้ด้วย</span></label><input id="b${i}" data-t="${esc(c.id)}" data-f="brief" value="${esc(t.brief || '')}" placeholder="เช่น ใช้ teach-back อย่างน้อย 1 ครั้ง"></div>`; }).join('') || '<p class="hint">ยังไม่ได้เลือกเคส ไปที่แท็บคลังเคสแล้วติ๊กเลือก</p>'}
  </section>
  <section class="sheet row"><button class="pri" id="kbuild" ${tasks.length ? '' : 'disabled'}>สร้างไฟล์ .vilpack.zip</button><button id="kteach" ${tasks.length ? '' : 'disabled'}>ดาวน์โหลดฉบับอาจารย์ (.md)</button><span class="status" id="kst" aria-live="polite"></span></section>`;
  view.querySelectorAll('[data-k]').forEach(x => x.addEventListener('input', () => { K[x.dataset.k] = x.value; savePack(); }));
  view.querySelectorAll('[data-t]').forEach(x => x.addEventListener('input', () => { (K.tasks[x.dataset.t] ||= {})[x.dataset.f] = x.value; savePack(); }));
  view.querySelector('#kgen').addEventListener('click', () => { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; K.classCode = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => a[b % a.length]).join(''); savePack(); tabPack(); });
  view.querySelector('#kadd').addEventListener('click', () => go('lib'));
  const mv = (i, d) => { const s = st.sel.filter(id => byId(id)); [s[i], s[i + d]] = [s[i + d], s[i]]; st.sel = s; saveSel(); tabPack(); };
  view.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => mv(+b.dataset.up, -1)));
  view.querySelectorAll('[data-dn]').forEach(b => b.addEventListener('click', () => mv(+b.dataset.dn, 1)));
  view.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => { st.sel = st.sel.filter(s => s !== b.dataset.x); saveSel(); tabPack(); }));
  const kst = t => { view.querySelector('#kst').textContent = t; };
  view.querySelector('#kteach').addEventListener('click', async () => download(await teacherZip(tasks), (K.title || 'bundle') + '-teacher.zip'));
  view.querySelector('#kbuild').addEventListener('click', async () => {
    try {
      kst('กำลังแพ็ก…');
      const { blob, manifest } = await packBundle({ ...K, tasks: tasks.map(c => ({ case: c, ...(K.tasks[c.id] || {}) })) });
      const name = (K.title || 'bundle').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 50) + '.vilpack.zip';
      download(blob, name);
      kst(`สร้าง ${name} แล้ว (${manifest.tasks.length} เคส) ส่งไฟล์ให้นักศึกษา และบอกรหัสห้อง ${K.classCode} แยกต่างหาก`);
    } catch (e) { kst('แพ็กไม่สำเร็จ: ' + e.message); }
  });
}

/* ---------------- 4. results ---------------- */
function tabResults() {
  const R = st.results;
  const tasks = [...new Map(R.flatMap(r => r.results.map(t => [t.task, t.patient]))).entries()];
  const bestOf = t => t?.attempts?.length ? t.attempts.reduce((a, b) => (b.score?.total ?? 0) > (a.score?.total ?? 0) ? b : a) : null;
  const miss = {}, crit = {};
  R.forEach(r => r.results.forEach(t => { const b = bestOf(t); b?.missed?.forEach(m => miss[m] = (miss[m] || 0) + 1); b?.critical_missed?.forEach(m => crit[m] = (crit[m] || 0) + 1); }));
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10);
  view.innerHTML = `
  <section class="sheet"><h2>ตรวจผลทั้งห้อง</h2><p class="hint">วางไฟล์ .vilresult.json ที่นักศึกษาส่งมา (หลายไฟล์พร้อมกันได้) ไฟล์อยู่ในเบราว์เซอร์นี้เท่านั้น</p>
    <div class="drop" id="rdrop" tabindex="0" role="button"><b>วางไฟล์ผลที่นี่</b></div></section>
  ${R.length ? `<section class="sheet"><div class="row between"><h2>คะแนนดีที่สุดรายเคส <span class="hint">${R.length} คน</span></h2><span class="row"><button id="csv">ดาวน์โหลด CSV</button><button id="clr">ล้าง</button></span></div>
    <div class="scroll"><table><thead><tr><th>รหัส</th><th>ชื่อ</th>${tasks.map(([id, p], i) => `<th title="${esc(p)}">งาน ${i + 1}</th>`).join('')}</tr></thead><tbody>
    ${R.map(r => `<tr><td>${esc(r.student.id)}</td><td>${esc(r.student.name)}</td>${tasks.map(([id]) => { const b = bestOf(r.results.find(t => t.task === id)); return `<td>${b ? `${b.score?.total ?? '-'}${b.score?.cap ? ` <span class="tag warn">cap ${b.score.cap}</span>` : ''}` : '<span class="hint">—</span>'}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div><p class="note">cap = ถูก Safety Gate จำกัดคะแนน</p></section>
  <div class="two"><section class="sheet"><h2>Critical miss ที่เจอบ่อย</h2>${top(crit).length ? `<ol>${top(crit).map(([k, v]) => `<li>${esc(k)} <span class="hint">${v} คน</span></li>`).join('')}</ol>` : '<p class="hint">ไม่มี</p>'}</section>
  <section class="sheet"><h2>เรื่องที่ไม่ได้ถามบ่อยที่สุด</h2>${top(miss).length ? `<ol>${top(miss).map(([k, v]) => `<li>${esc(k)} <span class="hint">${v} คน</span></li>`).join('')}</ol>` : '<p class="hint">ไม่มี</p>'}</section></div>` : ''}`;
  dropZone(view.querySelector('#rdrop'), '.json,application/json', async files => {
    for (const f of files) { try { const j = JSON.parse(await f.text()); if (j.format === 'vilresult/1') { st.results = st.results.filter(r => !(r.student.id === j.student.id && r.bundle.id === j.bundle.id)); st.results.push(j); } } catch (_) {} }
    tabResults();
  });
  view.querySelector('#clr')?.addEventListener('click', () => { st.results = []; tabResults(); });
  view.querySelector('#csv')?.addEventListener('click', () => {
    const rows = [['student_id', 'name', ...tasks.flatMap(([id]) => [`${id}_score`, `${id}_cap`, `${id}_attempts`])]];
    R.forEach(r => rows.push([r.student.id, r.student.name, ...tasks.flatMap(([id]) => { const t = r.results.find(x => x.task === id), b = bestOf(t); return [b?.score?.total ?? '', b?.score?.cap ?? '', t?.attempts?.length ?? 0]; })]));
    download(new Blob(['﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }), 'results.csv');
  });
}

