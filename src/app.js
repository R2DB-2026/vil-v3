// app.js — one-page shell: header, home, and the #practice / #studio / #board views.
import { initCaps, IN_ARTIFACT, store } from './caps.js';
import { openSettings, detectServer, settleDefault, aiLabel, aiReady } from './settings.js';
import { loadExtraCases } from './data.js';
import { renderPractice } from './practice.js';
import { renderStudio } from './studio.js';
import { renderBoard, myBadges } from './board.js';
import { BADGES } from './badges.js';

const main = document.getElementById('main');
const ROUTES = { '': home, practice: renderPractice, studio: studioRoute, board: renderBoard };

function studioRoute(root) {
  renderStudio(root);
  if (!store.get('vil.tips.seen')) root.querySelector('#tips')?.click();
}

function route() {
  const r = (location.hash || '').replace(/^#/, '');
  const fn = ROUTES[r] || home;
  document.querySelectorAll('[data-nav]').forEach(a => a.setAttribute('aria-current', a.dataset.nav === r ? 'page' : 'false'));
  main.innerHTML = '';
  fn(main);
  window.scrollTo(0, 0);
}

function pill() {
  const p = document.getElementById('aiPill');
  p.textContent = aiLabel();
  p.classList.toggle('warn', !aiReady());
}

function home(root) {
  const n = myBadges().length;
  root.innerHTML = `
  <section class="hero">
    <div>
      <h1>ฝึกซักประวัติกับเจ้าของสัตว์ที่ AI เล่นบท</h1>
      <p>ถามได้ภายในโควตา 10, 20 หรือ 30 คำถามตามระดับ แล้วรับคะแนน 100 คะแนน คำวิจารณ์รายคำถาม และหลักการที่เอาไปใช้ต่อได้</p>
      ${aiReady() ? '' : `<div class="setup"><b>เริ่มที่นี่:</b> ตั้งค่า AI ก่อนใช้งาน <button class="pri" id="setupBtn">ตั้งค่า AI</button></div>`}
    </div>
    <svg class="hero-art" viewBox="0 0 320 220" role="img" aria-label="บทสนทนาระหว่างสัตวแพทย์กับเจ้าของสัตว์">
      <rect x="18" y="26" width="196" height="64" rx="18" class="bub-o"/><path d="M48 90 40 108 70 90z" class="bub-o"/>
      <rect x="40" y="44" width="140" height="10" rx="5" class="ln"/><rect x="40" y="62" width="96" height="10" rx="5" class="ln"/>
      <rect x="110" y="112" width="192" height="64" rx="18" class="bub-s"/><path d="M272 176 280 194 250 176z" class="bub-s"/>
      <rect x="132" y="130" width="148" height="10" rx="5" class="ln2"/><rect x="132" y="148" width="104" height="10" rx="5" class="ln2"/>
      <g class="meter">${Array.from({ length: 10 }, (_, i) => `<rect x="${24 + i * 18}" y="200" width="14" height="10" rx="3" class="${i < 6 ? 'u' : i < 8 ? 'l' : ''}"/>`).join('')}</g>
    </svg>
  </section>
  <div class="roles">
    <a class="sheet role" href="#practice"><span class="tag">นักศึกษา</span><h2>ฝึกซักประวัติ</h2><p>เปิดไฟล์งานที่อาจารย์ส่งให้ หรือฝึกเองจากคลังเคสตัวอย่าง 10 เคส (สุนัข 5 แมว 5)</p><span class="go">ไปหน้าฝึก →</span></a>
    <a class="sheet role" href="#studio"><span class="tag">อาจารย์</span><h2>Studio</h2><p>สร้างเคสจาก PDF หรือรูปถ่ายเวชระเบียน จัดคลัง แพ็กงานเป็น Bundle และตรวจผลทั้งห้อง</p><span class="go">ไป Studio →</span></a>
    <a class="sheet role" href="#board"><span class="tag">ทุกคน</span><h2>Leaderboard</h2><p>30 อันดับคะแนนสูงสุด และ badge ${BADGES.length} แบบตามสาขาและทักษะ${n ? ` · คุณได้แล้ว ${n} อัน` : ''}</p><span class="go">ดูอันดับ →</span></a>
  </div>
  <p class="note">ข้อมูลเคส ค่าแล็บ และภาพถ่ายรังสีในคลังตัวอย่างเป็นค่าจำลองเพื่อการสอน รอคณาจารย์ตรวจทาน${IN_ARTIFACT ? '' : ' · หน้านี้เปิดได้ทั้งจากไฟล์ในเครื่อง, GitHub Pages และ Vercel'}</p>`;
  root.querySelector('#setupBtn')?.addEventListener('click', openSettings);
}

document.getElementById('aiBtn').addEventListener('click', openSettings);
document.addEventListener('vil:ai-changed', () => { pill(); if (!location.hash) route(); });
window.addEventListener('hashchange', route);

pill();
route();
(async () => {
  await Promise.all([initCaps(), detectServer(), loadExtraCases()]);
  settleDefault();
  pill();
  if (!location.hash || location.hash === '#board') route();
})();
