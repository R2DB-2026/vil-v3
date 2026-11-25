// board.js — leaderboard (top 30 consults) and the badge gallery.
// In a claude.ai artifact the board is shared through the db capability (board/<viewer id>);
// anywhere else it is kept in this browser.
import { CAPS, esc, store } from './caps.js';
import { BADGES, CATS, BADGE_BY_ID, badgesFor, badgeSvg } from './badges.js';

const HIST = 'vil.history.v1';
const levelTh = { Beginner: 'เริ่มต้น', Intermediate: 'กลาง', Advanced: 'ยาก' };
const sp = s => s === 'cat' ? 'แมว' : 'สุนัข';

export function recordFrom(c, S) {
  const sc = S.score || {};
  return {
    at: S.finished || Date.now(), caseId: c.id, patient: String(c.meta.patient || '').slice(0, 80), species: c.meta.species, level: c.meta.level,
    system: c.meta.system || '', urgency: c.meta.urgency || '', persona: c.persona || c.meta.persona || '', quota: c.quota, used: S.used, trust: S.trust,
    sc: sc.sc, raw: sc.raw, cap: sc.cap || null, total: sc.total ?? 0,
    unsafe: (S.report?.unsafe_advice || []).length, critical: (S.report?.critical_missed || []).length,
  };
}

export const myHistory = () => store.get(HIST, []);
export const myBadges = () => [...new Set(myHistory().flatMap(r => r.badges || []))];

async function myId() { try { return CAPS.user ? await CAPS.user.id() : null; } catch (_) { return null; } }

// Save a finished consult. Returns the badges newly earned with it.
export async function saveRecord(rec, name) {
  const H = myHistory();
  const before = new Set(H.flatMap(r => r.badges || []));
  H.push(rec);
  rec.badges = badgesFor(rec, H);
  rec.name = name || '';
  store.set(HIST, H.slice(-300));
  const fresh = rec.badges.filter(b => !before.has(b));
  if (CAPS.db) {
    const uid = await myId();
    if (uid) {
      try {
        const ref = CAPS.db.doc(`board/${uid}`);
        const all = myHistory();
        const top = [...all].sort((a, b) => b.total - a.total || b.at - a.at).slice(0, 10).map(({ name: _n, ...r }) => r);
        await ref.set({ records: top, badges: myBadges(), count: all.length, updated: Date.now() });
      } catch (_) { /* viewer may be read-only; local history still kept */ }
    }
  }
  return fresh;
}

/* ---------------- view ---------------- */
let unsub = null, shared = null, sharedState = 'idle';

export function renderBoard(root) {
  let filter = store.get('vil.board.filter', 'all');
  const draw = async () => {
    const local = myHistory();
    let rows;
    if (CAPS.db && shared) rows = shared.flatMap(d => (d.records || []).map(r => ({ ...r, uid: d.uid })));
    else rows = local.map(r => ({ ...r, uid: 'me' }));
    rows = rows.filter(r => filter === 'all' || r.level === filter).sort((a, b) => b.total - a.total || a.at - b.at).slice(0, 30);
    let names = {};
    if (CAPS.user && CAPS.db) {
      const ids = [...new Set(rows.map(r => r.uid))];
      try { const ps = await CAPS.user.profiles(ids); for (const id of ids) names[id] = ps?.[id]?.name || ''; } catch (_) {}
    }
    const me = await myId();
    const mine = new Set(myBadges());
    const myName = store.get('vil.student', {}).name || '';
    root.innerHTML = `
    <section class="sheet"><div class="row between">
      <div><h1>Leaderboard</h1><p class="hint">${CAPS.db ? 'อันดับรวมของทุกคนที่ฝึกในหน้านี้' : 'อันดับในเบราว์เซอร์นี้ (นำไปวางบน claude.ai เพื่อให้ทั้งห้องเห็นอันดับร่วมกัน)'} · 30 อันดับแรก</p></div>
      <div class="tabs" role="tablist" style="margin:0">${[['all', 'ทุกระดับ'], ['Beginner', 'เริ่มต้น'], ['Intermediate', 'กลาง'], ['Advanced', 'ยาก']].map(([v, l]) => `<button role="tab" data-f="${v}" aria-selected="${filter === v}">${l}</button>`).join('')}</div>
    </div>
    ${CAPS.db && sharedState === 'loading' ? '<p class="wait"><span class="dot"></span>กำลังโหลดอันดับ…</p>' : ''}
    ${CAPS.db && sharedState === 'slow' ? '<p class="hint">ยังโหลดอันดับรวมไม่ได้ แสดงข้อมูลเท่าที่มี</p>' : ''}
    <div class="scroll"><table class="board stack"><thead><tr><th>#</th><th>ผู้ฝึก</th><th>เคส</th><th>คะแนน</th><th>Badge จากเคสนี้</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${(r.uid === me || r.uid === 'me') ? 'me' : ''}">
      <td data-l="#"><span class="rank r${i + 1}">${i + 1}</span></td>
      <td data-l="ผู้ฝึก">${esc(r.uid === 'me' ? (r.name || myName || 'ฉัน') : (names[r.uid] || 'ผู้ฝึก'))}${r.uid === me ? ' <span class="tag">ฉัน</span>' : ''}</td>
      <td data-l="เคส">${esc(r.patient)}<br><span class="hint">${sp(r.species)} · ${levelTh[r.level] || esc(r.level)} · ใช้ ${r.used}/${r.quota} turn</span></td>
      <td data-l="คะแนน"><b class="score-n">${r.total}</b>${r.cap ? ` <span class="tag warn">cap ${r.cap}</span>` : ''}</td>
      <td data-l="Badge"><span class="brow">${(r.badges || []).filter(b => BADGE_BY_ID[b]).slice(0, 6).map(b => badgeSvg(b, 30)).join('')}${(r.badges || []).length > 6 ? `<span class="hint">+${r.badges.length - 6}</span>` : ''}</span></td></tr>`).join('') ||
      '<tr><td colspan="5" class="hint">ยังไม่มีใครทำเคสจบ ไปที่หน้า "ฝึกซักประวัติ" แล้วเริ่มเคสแรก</td></tr>'}
    </tbody></table></div></section>
    <section class="sheet"><div class="row between"><h2>Badge ของฉัน</h2><span class="tag">${mine.size}/${BADGES.length}</span></div>
      <p class="hint">ได้ badge จากการทำเคสจบในหน้าฝึก ยิ่งทำหลายสาขาและหลายแบบเจ้าของ ยิ่งได้มาก</p>
      ${Object.entries(CATS).map(([k, t]) => `<h3 style="margin-top:16px">${t}</h3><div class="bgrid">${BADGES.filter(b => b.cat === k).map(b => `<div class="bitem ${mine.has(b.id) ? '' : 'locked'}">${badgeSvg(b.id, 44, mine.has(b.id))}<div><b>${esc(b.name)}</b><br><span class="hint">${esc(b.how)}</span></div></div>`).join('')}</div>`).join('')}
    </section>`;
    root.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; store.set('vil.board.filter', filter); draw(); }));
  };
  if (CAPS.db && !unsub) {
    sharedState = 'loading';
    const timer = setTimeout(() => { if (sharedState === 'loading') { sharedState = 'slow'; draw(); } }, 10000);
    unsub = CAPS.db.collection('board').onSnapshot(snap => {
      shared = snap.docs.filter(d => d.exists).map(d => ({ uid: d.id, ...d.data() }));
      if (!snap.metadata.fromCache) { clearTimeout(timer); sharedState = 'ok'; }
      if (document.getElementById('boardRoot') === root) draw();
    }, () => { clearTimeout(timer); sharedState = 'slow'; if (document.getElementById('boardRoot') === root) draw(); });
  }
  root.id = 'boardRoot';
  draw();
}

// A small celebratory note shown after a report when badges were earned.
export function badgeToast(ids) {
  if (!ids.length) return;
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<b>ได้ badge ใหม่ ${ids.length} อัน</b><div class="brow">${ids.map(id => `<span class="bitem">${badgeSvg(id, 34)}<span>${esc(BADGE_BY_ID[id].name)}</span></span>`).join('')}</div>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 6000); setTimeout(() => t.remove(), 6800);
}
