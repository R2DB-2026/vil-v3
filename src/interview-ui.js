// interview-ui.js — one consult: chat with the owner → record & tests → report. Used by practice and studio's test run.
import { FIELDS, DOMAINS, MAX, newSession, ownerReply, assess, scoreOf, transcript } from './engine.js';
import { aiReady } from './settings.js';

import { esc } from './caps.js';
const list = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');

// opts: {session, save(S), onExit(), exitLabel, reveal:true|false}
export function mountInterview(root, c, opts = {}) {
  let S = opts.session || newSession(c), busy = false;
  const save = () => opts.save?.(S);
  const $ = s => root.querySelector(s);

  function view(v) { S.stage = v === 'chat' && S.stage !== 'chat' ? S.stage : v; save(); (v === 'chat' ? chat : v === 'report' ? report : record)(); window.scrollTo(0, 0); }

  /* ---------- chat ---------- */
  function chat() {
    root.innerHTML = `<div class="consult">
      <div class="sheet">
        ${c.brief ? `<div class="brief"><b>โจทย์จากอาจารย์:</b> ${esc(c.brief)}</div>` : ''}
        <div class="chat" aria-live="polite"></div>
        <form class="compose"><textarea aria-label="คำถามถึงเจ้าของ" placeholder="พิมพ์คำถามถึงเจ้าของ แล้วกด Enter (Shift+Enter ขึ้นบรรทัดใหม่)"></textarea><button class="pri" type="submit">ส่ง</button></form>
      </div>
      <aside class="side">
        <div class="sheet"><span class="tag">${esc(c.meta.level)} · ${c.meta.species === 'cat' ? 'แมว' : 'สุนัข'}</span><b style="display:block;margin-top:8px">${esc(c.meta.patient)}</b></div>
        <div class="sheet"><div class="hint">ใช้ไปแล้ว</div><div><span class="big used">0</span> <span class="hint">/ ${c.quota} turn</span></div><div class="meter"></div><div class="hint mnote"></div></div>
        <button class="warn end">${S.stage === 'chat' ? 'จบการซักประวัติ' : 'ไปที่บันทึกประวัติ'}</button>
        ${opts.onExit ? `<button class="ghost exit">${esc(opts.exitLabel || 'กลับ')}</button>` : ''}
      </aside></div>`;
    const ta = $('textarea');
    $('form').addEventListener('submit', e => { e.preventDefault(); send(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    $('.end').addEventListener('click', () => view('record'));
    $('.exit')?.addEventListener('click', () => opts.onExit());
    paintChat();
  }
  function paintChat() {
    const box = $('.chat'); if (!box) return;
    box.innerHTML = S.msgs.map(m => m.r === 'sys' ? `<div class="msg sys">${esc(m.t)}</div>` :
      `<div class="msg ${m.r}"><span class="who">${m.r === 'o' ? 'เจ้าของ' : `คุณ · ${m.k ? `นับ ${m.k} turn` : 'ไม่นับ turn'}`}</span>${esc(m.t)}</div>`).join('') +
      (busy ? '<div class="msg sys wait"><span class="dot"></span>เจ้าของกำลังตอบ…</div>' : '');
    box.scrollTop = 1e9;
    const left = c.quota - S.used, n = Math.max(c.quota, S.used);
    $('.used').textContent = S.used;
    const mt = $('.meter'); mt.style.gridTemplateColumns = `repeat(${Math.min(n, 15)},1fr)`;
    mt.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < S.used ? (left <= 3 ? 'l' : 'u') : ''}"></i>`).join('');
    const note = $('.mnote');
    note.textContent = !aiReady() ? 'ยังไม่ได้ตั้งค่า AI กด "ตั้งค่า AI" ด้านบน' : left <= 0 ? 'ครบโควตาแล้ว ไปขั้นบันทึกประวัติ' : left <= 3 ? `เหลืออีก ${left} turn เลือกคำถามที่สำคัญที่สุด` : 'ทักทาย สะท้อนความรู้สึก และสรุปทวน ไม่นับ turn';
    note.style.color = left <= 3 || !aiReady() ? 'var(--coral)' : '';
    const off = left <= 0 || S.stage !== 'chat' || busy;
    $('textarea').disabled = $('.compose button').disabled = off;
  }
  async function send() {
    const ta = $('textarea'), q = ta.value.trim();
    if (!q || busy) return;
    S.msgs.push({ r: 's', t: q, k: 0 }); ta.value = ''; busy = true; paintChat();
    try {
      const r = await ownerReply(c, S, q);
      const m = S.msgs[S.msgs.length - 1]; m.k = r.turns; S.used += r.turns; S.trust = r.trust;
      S.msgs.push({ r: 'o', t: r.reply });
      if (S.used >= c.quota) S.msgs.push({ r: 'sys', t: 'ครบโควตาแล้ว กด "จบการซักประวัติ" เพื่อไปบันทึกประวัติ' });
    } catch (err) {
      S.msgs.pop(); ta.value = q;
      S.msgs.push({ r: 'sys', t: 'ส่งไม่สำเร็จ: ' + err.message });
    }
    busy = false; save(); paintChat(); $('textarea')?.focus();
  }

  /* ---------- record & tests ---------- */
  function record() {
    if (S.stage === 'chat') S.stage = 'record';
    root.innerHTML = `<div class="two">
      <section class="sheet"><h2>บันทึกประวัติ</h2><p class="hint">เขียนจากสิ่งที่เจ้าของพูดจริงเท่านั้น แปลภาษาชาวบ้านเป็นศัพท์คลินิก ข้อมูลที่ไม่ได้ถามใส่ในข้อ 5</p>
        ${FIELDS.map(([k, l, h]) => `<label for="f_${k}">${l} ${h ? `<span class="hint">${h}</span>` : ''}</label><textarea id="f_${k}" data-f="${k}">${esc(S.form[k] || '')}</textarea>`).join('')}</section>
      <div>
        <section class="sheet"><h2>ขอตรวจเพิ่ม</h2><p class="hint">ตรวจร่างกายได้ 1 ครั้ง และสั่งแล็บ/ภาพวินิจฉัยได้ไม่เกิน 3 รายการ ต้องบอกว่าตรวจเพื่อแยกโรคอะไร</p>
          <button class="pe" ${S.pe ? 'disabled' : ''}>ตรวจร่างกายเบื้องต้น</button>
          <p style="white-space:pre-wrap">${S.pe ? esc(c.sections.C) : ''}</p>
          <div class="labs">${c.labs.map((l, i) => `<div class="lab"><input type="checkbox" id="lb${i}" data-i="${i}" ${S.labs[i] !== undefined ? 'checked' : ''} ${S.ordered.length ? 'disabled' : ''}><label for="lb${i}" style="margin:0;font-weight:500">${esc(l.name)}</label>
            <input type="text" data-r="${i}" placeholder="ตรวจเพื่อแยกโรคอะไร" value="${esc(S.labs[i] || '')}" ${S.labs[i] === undefined || S.ordered.length ? 'hidden' : ''}></div>`).join('')}</div>
          <div class="row" style="margin-top:12px"><button class="pri order">ส่งตรวจ (<span class="lc">0</span>/3)</button></div>
          <div class="lout scroll" style="margin-top:12px"></div></section>
        <section class="sheet"><h3>สรุปหลังเห็นผลตรวจ</h3>
          <label for="f_final">Differential สุดท้าย 3 อันดับ พร้อมเหตุผลที่ปรับจากผลตรวจ</label><textarea id="f_final" data-f="final">${esc(S.form.final || '')}</textarea>
          <div class="row" style="margin-top:14px"><button class="pri go">ส่งให้ AI อาจารย์ประเมิน</button><button class="back">ดูบทสนทนา</button></div>
          <p class="wait" hidden><span class="dot"></span><span class="wmsg"></span></p></section>
      </div></div>`;
    paintLabs();
    root.querySelectorAll('[data-f]').forEach(t => t.addEventListener('input', () => { S.form[t.dataset.f] = t.value; save(); }));
    root.querySelectorAll('[data-r]').forEach(t => t.addEventListener('input', () => { S.labs[t.dataset.r] = t.value; save(); paintLabs(); }));
    root.querySelectorAll('[data-i]').forEach(t => t.addEventListener('change', () => {
      const i = t.dataset.i;
      if (t.checked) { if (Object.keys(S.labs).length >= 3) { t.checked = false; return; } S.labs[i] = ''; } else delete S.labs[i];
      save(); record();
    }));
    $('.pe').addEventListener('click', () => { S.pe = true; save(); record(); });
    $('.order').addEventListener('click', () => { S.ordered = Object.keys(S.labs).map(Number); save(); record(); });
    $('.back').addEventListener('click', () => chat());
    $('.go').addEventListener('click', go);
  }
  function paintLabs() {
    const n = Object.keys(S.labs).length;
    $('.lc').textContent = n;
    $('.order').disabled = !!S.ordered.length || !n || Object.values(S.labs).some(v => !String(v).trim());
    $('.lout').innerHTML = S.ordered.length ? `<table class="stack"><thead><tr><th>รายการ</th><th>ผล</th><th>ค่าอ้างอิงตัวอย่าง</th></tr></thead><tbody>${S.ordered.map(i => `<tr><td data-l="รายการ">${esc(c.labs[i].name)}</td><td data-l="ผล"><b>${esc(c.labs[i].result)}</b></td><td data-l="ค่าอ้างอิง">${esc(c.labs[i].ref)}</td></tr>`).join('')}</tbody></table><p class="note">แปลผลเอง แล้วปรับ differential ด้านล่าง</p>` : '';
  }
  async function go() {
    if (busy) return;
    busy = true; $('.go').disabled = true; $('.wait').hidden = false;
    const msg = t => { const w = $('.wmsg'); if (w) w.textContent = t; };
    try {
      S.report = await assess(c, S, msg);
      S.score = scoreOf(S.report); S.stage = 'report'; S.finished = Date.now(); save();
      busy = false; opts.onDone?.(S); report();
    } catch (err) { msg('ประเมินไม่สำเร็จ: ' + err.message + ' กดส่งอีกครั้ง'); busy = false; $('.go').disabled = false; }
  }

  /* ---------- report ---------- */
  function report() {
    const r = S.report, { sc, raw, cap, total } = S.score || scoreOf(r);
    const band = p => p >= .9 ? 'ยอดเยี่ยม' : p >= .7 ? 'ดี' : p >= .4 ? 'พอใช้' : 'ต้องพัฒนา';
    const C = 2 * Math.PI * 56, T = r.takeaways || {}, reveal = typeof opts.reveal === 'function' ? opts.reveal() : opts.reveal !== false;
    root.innerHTML = `
    <section class="sheet"><div class="verdict">
      <svg class="ring" viewBox="0 0 132 132" role="img" aria-label="คะแนนรวม ${total} จาก 100"><circle cx="66" cy="66" r="56" fill="none" stroke="var(--line)" stroke-width="12"/><circle cx="66" cy="66" r="56" fill="none" stroke="${cap ? 'var(--coral)' : 'var(--teal)'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C * total / 100} ${C}" transform="rotate(-90 66 66)"/><text x="66" y="74" text-anchor="middle" font-size="34" font-weight="700" fill="currentColor">${total}</text></svg>
      <div><span class="tag">${esc(c.meta.level)} · ใช้ ${S.used}/${c.quota} turn</span><h2 style="margin-top:8px">${esc(r.summary || '')}</h2>
      ${cap ? `<div class="cap" style="margin-top:12px"><strong>Safety Gate จำกัดคะแนนไว้ที่ ${cap}</strong> (คะแนนตามเกณฑ์ ${raw})<ul>${list((r.critical_missed || []).map(x => 'ไม่ได้ถาม: ' + x))}${list((r.unsafe_advice || []).map(x => 'คำแนะนำไม่ปลอดภัย: ' + x))}</ul></div>` : '<p class="hint">ผ่าน Safety Gate</p>'}
      ${c.brief && r.brief_met ? `<p class="brief"><b>โจทย์จากอาจารย์:</b> ${esc(r.brief_met)}</p>` : ''}</div></div></section>
    <section class="sheet"><h2>คะแนน 8 ด้าน</h2>${DOMAINS.map((d, i) => `<div class="score"><span><b>${i + 1}. ${d}</b> <span class="hint">${band(sc[i] / MAX[i])}</span></span><b>${sc[i]}/${MAX[i]}</b><div class="bar"><b style="width:${sc[i] / MAX[i] * 100}%"></b></div><span class="hint" style="grid-column:1/-1">${esc(r.domains?.[i]?.comment || '')} ${r.domains?.[i]?.evidence ? `<i>(${esc(r.domains[i].evidence)})</i>` : ''}</span></div>`).join('')}</section>
    ${reveal ? `<section class="sheet"><h2>เฉลย: ${esc(r.reveal?.diagnosis || '')}</h2><p>${esc(r.reveal?.story || '')}</p><p><b>ตัวลวงในเคส:</b> ${esc(r.reveal?.traps || '')}</p></section>` : '<section class="sheet"><p class="hint">อาจารย์ตั้งให้เปิดเฉลยหลังทำครบทุกเคส</p></section>'}
    <section class="sheet"><h2>ไล่ดูรายคำถาม</h2><div class="scroll"><table class="stack"><thead><tr><th>turn</th><th>คำถาม</th><th>ประเภท</th><th>ได้ข้อมูล</th><th>ความเห็น</th></tr></thead><tbody>${(r.questions || []).map(x => `<tr><td>${esc(x.turn)}</td><td>${esc(x.q)}</td><td>${esc(x.type)}</td><td>${esc(x.got)}</td><td>${esc(x.note)}</td></tr>`).join('')}</tbody></table></div></section>
    <div class="two">
      <section class="sheet"><h2>สิ่งที่ยังไม่ได้ถาม</h2>${(r.missed || []).map(m => `<p><b>${esc(m.item)}</b><br><span class="hint">${esc(m.why)}</span><br>ลองถามว่า: “${esc(m.sample)}”</p>`).join('') || '<p class="hint">ไม่มีข้อสำคัญที่พลาด</p>'}</section>
      <section class="sheet"><h2>ถ้าเจ้าของพูดได้</h2><p class="quote" style="font-size:17px;color:var(--ink)">${esc(r.owner_voice || '')}</p><p class="hint">สถานะความไว้ใจตอนจบ: ${S.trust}</p>
        <h3 style="margin-top:16px">การบันทึก</h3>${(r.record_issues || []).map(x => `<p><s>${esc(x.wrote)}</s><br><span class="hint">${esc(x.issue)}</span><br>→ ${esc(x.better)}</p>`).join('') || '<p class="hint">บันทึกตรงกับบทสนทนา</p>'}</section>
    </div>
    ${(r.mi_coaching || []).length ? `<section class="sheet"><h2>ลองพูดใหม่แบบ MI</h2>${r.mi_coaching.map(x => `<p><span class="hint">คุณพูดว่า</span> “${esc(x.said)}”<br><b>ลองพูดว่า</b> “${esc(x.try)}”<br><span class="hint">${esc(x.why)}</span></p>`).join('')}</section>` : ''}
    <section class="sheet"><h2>3 ข้อที่เอากลับไปใช้</h2><ol><li><b>ด้านคลินิก:</b> ${esc(T.clinical)}</li><li><b>ด้านการสื่อสาร:</b> ${esc(T.communication)}</li><li><b>ด้านวิธีคิด:</b> ${esc(T.thinking)}</li></ol>${r.principles?.length ? `<p class="hint">หลักการที่เกี่ยวข้อง: ${esc(r.principles.join(' · '))}</p>` : ''}</section>
    <div class="two">
      <section class="sheet"><h2>คำถามชวนคิด</h2><p class="hint">ลองตอบเองก่อนไปเคสถัดไป</p><ol>${list(r.socratic)}</ol></section>
      <section class="sheet"><h2>ฝึกต่อ</h2><ul>${list(r.prescription)}</ul></section>
    </div>
    <section class="sheet row">${opts.onExit ? `<button class="pri exit">${esc(opts.exitLabel || 'กลับ')}</button>` : ''}${opts.onRetry ? '<button class="retry">ทำเคสนี้ใหม่</button>' : ''}<button class="copy">คัดลอกรายงาน</button><button class="see">ดูบทสนทนา</button><span class="hint copied"></span></section>`;
    $('.exit')?.addEventListener('click', () => opts.onExit());
    $('.see').addEventListener('click', () => chat());
    $('.retry')?.addEventListener('click', () => opts.onRetry());
    $('.copy').addEventListener('click', async () => {
      const txt = `คะแนน ${total}/100${cap ? ` (Safety Gate จำกัดที่ ${cap})` : ''}\n` + DOMAINS.map((d, i) => `${i + 1}. ${d}: ${sc[i]}/${MAX[i]}`).join('\n') + `\n\nสิ่งที่ยังไม่ได้ถาม:\n${(r.missed || []).map(m => '- ' + m.item).join('\n')}\n\nบทสนทนา:\n${transcript(S, true)}`;
      try { await navigator.clipboard.writeText(txt); $('.copied').textContent = 'คัดลอกแล้ว'; } catch (_) { $('.copied').textContent = 'คัดลอกไม่ได้'; }
    });
  }

  document.addEventListener('vil:ai-changed', () => { if ($('.chat')) paintChat(); });
  S.stage === 'report' && S.report ? report() : S.stage === 'chat' ? chat() : record();
  return { get session() { return S; } };
}
