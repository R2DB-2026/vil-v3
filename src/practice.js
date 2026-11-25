// practice.js — student side: open a .vilpack.zip (or the sample library), work through the tasks, export results.
import { readBundle, unlockBundle } from './bundle.js';
import { mountInterview } from './interview-ui.js';
import { libraryCases } from './data.js';
import { esc, store, download } from './caps.js';
import { recordFrom, saveRecord, badgeToast } from './board.js';

const sp = s => s === 'cat' ? 'แมว' : 'สุนัข';
const levelTh = { Beginner: 'เริ่มต้น', Intermediate: 'กลาง', Advanced: 'ยาก' };
let B = null, pending = null, app = null;

export function renderPractice(root) { app = root; B ? taskList() : start(); }

function dropZone(el, onFile) {
  const inp = el.querySelector('input[type=file]');
  el.addEventListener('click', e => { if (e.target !== inp) inp.click(); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
  ['dragover', 'dragenter'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, () => el.classList.remove('over')));
  el.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
  inp.addEventListener('change', () => { if (inp.files[0]) onFile(inp.files[0]); inp.value = ''; });
}

function start() {
  const cases = libraryCases();
  app.innerHTML = `
  <section class="sheet">
    <h1>ฝึกซักประวัติ</h1>
    <div class="two" style="margin-top:12px">
      <div>
        <h3>มีงานจากอาจารย์</h3>
        <p class="hint">วางไฟล์ .vilpack.zip ที่อาจารย์ส่งให้ ไม่ต้องแตกไฟล์</p>
        <div class="drop" tabindex="0" role="button" aria-label="เลือกไฟล์งาน zip"><svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 26V8m0 0-7 7m7-7 7 7M8 28v4h24v-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><b>ลากไฟล์ zip มาวาง</b><span>หรือกดเพื่อเลือกไฟล์</span><input type="file" accept=".zip,application/zip" hidden></div>
        <p class="status" id="err" aria-live="polite"></p>
      </div>
      <div>
        <h3>ฝึกเอง</h3>
        <p class="hint">เลือกเคสจากคลังตัวอย่างด้านล่าง ผลจะขึ้น Leaderboard ด้วย</p>
        <div class="levels">${['Beginner', 'Intermediate', 'Advanced'].map(l => `<div class="lv"><b>${levelTh[l]}</b><span class="hint">${cases.filter(c => c.meta.level === l).length} เคส · ${cases.find(c => c.meta.level === l)?.quota || ''} turn</span></div>`).join('')}</div>
      </div>
    </div>
  </section>
  <section class="sheet"><h2>คลังเคสตัวอย่าง</h2><div class="grid" style="margin-top:12px">
    ${cases.map((c, i) => `<button class="card" data-lib="${i}"><span class="row"><span class="tag">${levelTh[c.meta.level] || esc(c.meta.level)} · ${c.quota} turn</span><span class="tag">${sp(c.meta.species)}</span></span><b>${esc(c.meta.patient)}</b><span class="quote">${esc(c.meta.opening)}</span></button>`).join('')}
  </div></section>`;
  dropZone(app.querySelector('.drop'), openZip);
  app.querySelectorAll('[data-lib]').forEach(b => b.addEventListener('click', () => freePractice(cases[+b.dataset.lib])));
}

async function openZip(f) {
  const err = app.querySelector('#err');
  if (!window.JSZip) { err.textContent = 'โหลดตัวเปิด zip ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วรีเฟรช'; return; }
  try { pending = await readBundle(f); unlockForm(); } catch (e) { err.textContent = e.message; }
}

function unlockForm() {
  const m = pending.manifest, last = store.get('vil.student', {});
  app.innerHTML = `<section class="sheet" style="max-width:560px;margin:0 auto">
    <h1>${esc(m.title)}</h1>
    ${m.instructions ? `<p>${esc(m.instructions)}</p>` : ''}
    <p class="hint">${m.tasks.length} เคส${m.due ? ` · ส่งภายใน ${esc(m.due)}` : ''}</p>
    <form id="uf">
      <label for="sn">ชื่อ-นามสกุล</label><input id="sn" required value="${esc(last.name || '')}" autocomplete="name">
      <label for="si">รหัสนักศึกษา</label><input id="si" required value="${esc(last.id || '')}">
      <label for="sc">รหัสห้อง <span class="hint">อาจารย์เป็นคนให้</span></label><input id="sc" required autocomplete="off">
      <div class="row" style="margin-top:16px"><button class="pri" type="submit">เปิดงาน</button><button type="button" id="cancel">ยกเลิก</button></div>
      <p class="status" id="ue" aria-live="polite"></p>
    </form></section>`;
  app.querySelector('#cancel').addEventListener('click', start);
  app.querySelector('#uf').addEventListener('submit', async e => {
    e.preventDefault();
    const name = app.querySelector('#sn').value.trim(), id = app.querySelector('#si').value.trim(), code = app.querySelector('#sc').value;
    app.querySelector('#ue').textContent = 'กำลังเปิด…';
    try {
      const tasks = await unlockBundle(pending, code);
      store.set('vil.student', { name, id });
      const key = `vil.prog.${m.id}.${id}`;
      B = { manifest: m, tasks, key, student: { name, id }, prog: store.get(key, {}) };
      taskList();
    } catch (er) { app.querySelector('#ue').textContent = er.message; }
  });
}

const tp = id => (B.prog[id] ||= { attempts: [], current: null });
const done = id => tp(id).attempts.length > 0;
const best = id => Math.max(...tp(id).attempts.map(a => a.score?.total ?? 0));
const saveProg = () => store.set(B.key, B.prog);

function taskList() {
  const m = B.manifest, all = B.tasks.every(t => done(t.id));
  app.innerHTML = `<section class="sheet"><div class="row between"><div><h1>${esc(m.title)}</h1><p class="hint">${esc(B.student.name)} · ${esc(B.student.id)}${m.due ? ` · ส่งภายใน ${esc(m.due)}` : ''}</p></div>
    <div class="row"><button class="pri" id="exp" ${B.tasks.some(t => done(t.id)) ? '' : 'disabled'}>ดาวน์โหลดผลเพื่อส่งอาจารย์</button><button id="close">ปิดงานนี้</button></div></div>
    ${m.instructions ? `<p>${esc(m.instructions)}</p>` : ''}
    <p class="hint">ทำแล้ว ${B.tasks.filter(t => done(t.id)).length} จาก ${B.tasks.length} เคส ${all ? '· ครบแล้ว ดาวน์โหลดผลส่งได้เลย' : ''}</p></section>
  <div class="grid" style="margin-top:16px">${B.tasks.map((t, i) => {
    const p = tp(t.id), locked = m.order === 'sequence' && i > 0 && !done(B.tasks[i - 1].id);
    const left = t.attempts ? t.attempts - p.attempts.length : Infinity;
    const status = p.current ? 'กำลังทำ' : done(t.id) ? `เสร็จ · ดีที่สุด ${best(t.id)}/100` : 'ยังไม่เริ่ม';
    return `<div class="sheet card"><span class="row"><span class="tag">งาน ${i + 1}</span><span class="tag">${levelTh[t.card.level] || esc(t.card.level)} · ${t.card.quota} turn</span><span class="tag">${sp(t.card.species)}</span></span>
      <b>${esc(t.card.patient)}</b><span class="quote">${esc(t.card.opening)}</span>
      ${t.brief ? `<span class="brief">${esc(t.brief)}</span>` : ''}
      <span class="hint">${status}${t.attempts ? ` · ทำได้อีก ${Math.max(0, left)} ครั้ง` : ''}</span>
      <span class="row">${locked ? '<span class="hint">ทำงานก่อนหน้าให้เสร็จก่อน</span>' :
        p.current ? `<button class="pri" data-go="${t.id}">ทำต่อ</button>` :
        left > 0 ? `<button class="pri" data-new="${t.id}">${done(t.id) ? 'ทำอีกครั้ง' : 'เริ่ม'}</button>` : ''}
      ${done(t.id) ? `<button data-rep="${t.id}">ดูรายงานล่าสุด</button>` : ''}</span></div>`;
  }).join('')}</div>`;
  app.querySelector('#close').addEventListener('click', () => { B = null; start(); });
  app.querySelector('#exp').addEventListener('click', exportResults);
  app.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => { tp(b.dataset.new).current = null; run(b.dataset.new); }));
  app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => run(b.dataset.go)));
  app.querySelectorAll('[data-rep]').forEach(b => b.addEventListener('click', () => { const p = tp(b.dataset.rep); run(b.dataset.rep, p.attempts[p.attempts.length - 1]); }));
}

function run(id, view) {
  const t = B.tasks.find(x => x.id === id), p = tp(id);
  app.innerHTML = `<div class="row between" style="margin-bottom:12px"><h2>งาน ${B.tasks.indexOf(t) + 1}</h2><span class="hint">${esc(B.manifest.title)}</span></div><div id="iv"></div>`;
  mountInterview(app.querySelector('#iv'), t.case, {
    session: view || p.current || undefined,
    reveal: () => B.manifest.reveal !== 'after-all' || B.tasks.every(x => done(x.id)),
    save: S => {
      if (view) return;
      if (S.stage === 'report' && S.report) { if (!p.attempts.includes(S)) p.attempts.push(S); p.current = null; }
      else p.current = S;
      saveProg();
    },
    onDone: async S => { if (!view) badgeToast(await saveRecord(recordFrom(t.case, S), B.student.name)); },
    onExit: taskList, exitLabel: 'กลับไปหน้ารายการงาน',
  });
}

function exportResults() {
  const m = B.manifest;
  const out = {
    format: 'vilresult/1', bundle: { id: m.id, title: m.title }, student: B.student, exported: new Date().toISOString(),
    results: B.tasks.map(t => ({
      task: t.id, case: t.case.id, patient: t.card.patient,
      attempts: tp(t.id).attempts.map(a => ({ started: a.started, finished: a.finished, used: a.used, quota: t.case.quota, score: a.score, critical_missed: a.report?.critical_missed || [], unsafe_advice: a.report?.unsafe_advice || [], missed: (a.report?.missed || []).map(x => x.item), trust: a.trust, transcript: a.msgs, form: a.form, ordered: a.ordered.map(i => t.case.labs[i]?.name) })),
    })),
  };
  download(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), `${B.student.id}-${m.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.vilresult.json`);
}

function freePractice(c) {
  const key = 'vil.free.' + c.id;
  app.innerHTML = `<div class="row between" style="margin-bottom:12px"><h2>ฝึกเอง</h2><span class="hint">${esc(c.meta.patient)}</span></div><div id="iv"></div>`;
  mountInterview(app.querySelector('#iv'), c, {
    session: store.get(key) || undefined,
    save: S => store.set(key, S),
    onDone: async S => badgeToast(await saveRecord(recordFrom(c, S), store.get('vil.student', {}).name)),
    onRetry: () => { store.del(key); freePractice(c); },
    onExit: start, exitLabel: 'กลับไปเลือกเคส',
  });
}
