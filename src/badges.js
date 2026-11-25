// badges.js — 43 specialty and skill badges, earned from finished consults.
// A record: {total, raw, cap, sc:[8], used, quota, level, species, system, urgency, persona, caseId, at}
const pct = (r, i, max) => (r.sc?.[i] ?? 0) / max;
const sysHas = (r, ...ws) => ws.some(w => String(r.system || '').toLowerCase().includes(w.toLowerCase()));
const spec = (id, name, code, words, note) => ({ id, name, code, cat: 'spec', how: `ได้ 80+ ในเคส${note}`, test: (r) => r.total >= 80 && sysHas(r, ...words) });

export const CATS = { spec: 'สาขาเฉพาะทาง', skill: 'ทักษะซักประวัติ', safe: 'ความปลอดภัย', persona: 'รับมือเจ้าของ', path: 'เส้นทางการฝึก' };

export const BADGES = [
  // สาขาเฉพาะทาง (14)
  spec('gi', 'Gut Detective', 'GI', ['GI', 'ทางเดินอาหาร'], 'ระบบทางเดินอาหาร'),
  spec('uro', 'Flow Keeper', 'UR', ['ปัสสาวะ', 'uro'], 'ระบบทางเดินปัสสาวะ'),
  spec('repro', 'Repro Ready', 'RP', ['สืบพันธุ์', 'repro'], 'ระบบสืบพันธุ์'),
  spec('renal', 'Kidney Keeper', 'KD', ['ไต', 'renal'], 'โรคไต'),
  spec('endo', 'Hormone Hunter', 'EN', ['ต่อมไร้ท่อ', 'endo'], 'ต่อมไร้ท่อ'),
  spec('hemo', 'Blood Reader', 'HM', ['เลือด', 'เห็บ', 'hemat'], 'โลหิตวิทยาและโรคจากเห็บ'),
  spec('cardio', 'Heart Listener', 'CV', ['หัวใจ', 'cardio'], 'หัวใจ'),
  spec('resp', 'Breath Watcher', 'RS', ['หายใจ', 'resp'], 'ทางเดินหายใจ'),
  spec('tox', 'Toxin Tracer', 'TX', ['พิษ', 'tox'], 'พิษวิทยา'),
  spec('infect', 'Bug Buster', 'ID', ['ติดเชื้อ', 'infect'], 'โรคติดเชื้อ'),
  spec('neuro', 'Neuro Navigator', 'NE', ['ประสาท', 'neuro'], 'ระบบประสาท'),
  spec('derm', 'Skin Sleuth', 'DM', ['ผิวหนัง', 'derm'], 'ผิวหนัง'),
  spec('ortho', 'Bone & Joint', 'OR', ['กระดูก', 'ข้อ', 'ortho'], 'กระดูกและข้อ'),
  spec('abd', 'Belly Mapper', 'AB', ['ช่องท้อง', 'ช่องอก', 'abdom'], 'ช่องท้องและช่องอก'),
  // ทักษะซักประวัติ (9)
  { id: 'opener', name: 'Open Door', code: 'OD', cat: 'skill', how: 'ด้านเปิดการสนทนาได้ 9/10 ขึ้นไป', test: r => pct(r, 0, 10) >= 0.9 },
  { id: 'timeline', name: 'Timeline Master', code: 'TL', cat: 'skill', how: 'ด้าน HPI ได้ 18/20 ขึ้นไป', test: r => pct(r, 1, 20) >= 0.9 },
  { id: 'sweep', name: 'System Sweeper', code: 'SW', cat: 'skill', how: 'ด้านทบทวนระบบได้ 18/20 ขึ้นไป', test: r => pct(r, 2, 20) >= 0.9 },
  { id: 'redflag', name: 'Red Flag Radar', code: 'RF', cat: 'skill', how: 'ด้าน Red flag ได้เต็ม 10', test: r => pct(r, 3, 10) >= 1 },
  { id: 'funnel', name: 'Funnel Pro', code: 'FN', cat: 'skill', how: 'ด้านเทคนิคการถามได้ 9/10 ขึ้นไป', test: r => pct(r, 4, 10) >= 0.9 },
  { id: 'empathy', name: 'Heart of MI', code: 'MI', cat: 'skill', how: 'ด้านการสื่อสารได้ 9/10 ขึ้นไป', test: r => pct(r, 5, 10) >= 0.9 },
  { id: 'scribe', name: 'Clinical Scribe', code: 'CS', cat: 'skill', how: 'ด้านการบันทึกได้ 9/10 ขึ้นไป', test: r => pct(r, 6, 10) >= 0.9 },
  { id: 'reasoner', name: 'Differential Thinker', code: 'DX', cat: 'skill', how: 'ด้านการคิดเชิงเหตุผลได้ 9/10 ขึ้นไป', test: r => pct(r, 7, 10) >= 0.9 },
  { id: 'allround', name: 'All-Rounder', code: 'AR', cat: 'skill', how: 'ทุกด้านได้ 70% ขึ้นไปในเคสเดียว', test: r => [10, 20, 20, 10, 10, 10, 10, 10].every((m, i) => pct(r, i, m) >= 0.7) },
  // ความปลอดภัย (5)
  { id: 'safe5', name: 'Safe Hands', code: 'SH', cat: 'safe', how: 'ผ่าน Safety Gate 5 เคส', test: (r, H) => H.filter(x => !x.cap).length >= 5 },
  { id: 'safe15', name: 'Guardian', code: 'GD', cat: 'safe', how: 'ผ่าน Safety Gate 15 เคส', test: (r, H) => H.filter(x => !x.cap).length >= 15 },
  { id: 'emerg', name: 'Emergency Ready', code: 'ER', cat: 'safe', how: 'ได้ 80+ ในเคสวิกฤต', test: r => r.urgency === 'critical' && r.total >= 80 },
  { id: 'triage', name: 'Triage First', code: 'TF', cat: 'safe', how: 'เคสเร่งด่วนสูงหรือวิกฤต ไม่ติด Safety Gate และ Red flag เต็ม', test: r => ['high', 'critical'].includes(r.urgency) && !r.cap && pct(r, 3, 10) >= 1 },
  { id: 'nounsafe', name: 'Do No Harm', code: 'NH', cat: 'safe', how: 'ทำ 10 เคสโดยไม่เคยให้คำแนะนำที่ไม่ปลอดภัย', test: (r, H) => H.length >= 10 && H.every(x => !x.unsafe) },
  // รับมือเจ้าของ (4)
  { id: 'anxious', name: 'Calm in the Storm', code: 'CA', cat: 'persona', how: 'เจ้าของ Anxious และด้านสื่อสารได้ 9/10 ขึ้นไป', test: r => /anxious/i.test(r.persona || '') && pct(r, 5, 10) >= 0.9 },
  { id: 'literacy', name: 'Plain Speaker', code: 'PS', cat: 'persona', how: 'เจ้าของ Low literacy และด้านสื่อสารได้ 9/10 ขึ้นไป', test: r => /literacy/i.test(r.persona || '') && pct(r, 5, 10) >= 0.9 },
  { id: 'recall', name: 'Memory Jogger', code: 'MJ', cat: 'persona', how: 'เจ้าของ Incomplete recall และด้าน HPI ได้ 18/20 ขึ้นไป', test: r => /recall/i.test(r.persona || '') && pct(r, 1, 20) >= 0.9 },
  { id: 'trust', name: 'Trust Builder', code: 'TB', cat: 'persona', how: 'จบเคสโดยเจ้าของอยู่ในสถานะเปิดใจ (Open) 5 เคส', test: (r, H) => H.filter(x => x.trust === 'Open').length >= 5 },
  // เส้นทางการฝึก (11)
  { id: 'first', name: 'First Consult', code: '1st', cat: 'path', how: 'ทำเคสแรกจบ', test: () => true },
  { id: 'beg', name: 'Beginner Cleared', code: 'B', cat: 'path', how: 'ได้ 80+ ในเคสระดับ Beginner', test: r => r.level === 'Beginner' && r.total >= 80 },
  { id: 'int', name: 'Intermediate Cleared', code: 'I', cat: 'path', how: 'ได้ 80+ ในเคสระดับ Intermediate', test: r => r.level === 'Intermediate' && r.total >= 80 },
  { id: 'adv', name: 'Advanced Cleared', code: 'A', cat: 'path', how: 'ได้ 80+ ในเคสระดับ Advanced', test: r => r.level === 'Advanced' && r.total >= 80 },
  { id: 'excellent', name: 'Excellence', code: '90', cat: 'path', how: 'ได้ 90+ ในเคสใดก็ได้', test: r => r.total >= 90 },
  { id: 'lean', name: 'Lean Interviewer', code: 'LI', cat: 'path', how: 'ได้ 80+ โดยใช้ไม่เกิน 60% ของโควตา', test: r => r.total >= 80 && r.quota && r.used <= r.quota * 0.6 },
  { id: 'canine', name: 'Canine Clinician', code: 'K9', cat: 'path', how: 'ได้ 75+ ในเคสสุนัข 3 เคส', test: (r, H) => new Set(H.filter(x => x.species === 'dog' && x.total >= 75).map(x => x.caseId)).size >= 3 },
  { id: 'feline', name: 'Feline Whisperer', code: 'FL', cat: 'path', how: 'ได้ 75+ ในเคสแมว 3 เคส', test: (r, H) => new Set(H.filter(x => x.species === 'cat' && x.total >= 75).map(x => x.caseId)).size >= 3 },
  { id: 'comeback', name: 'Comeback', code: 'CB', cat: 'path', how: 'ทำเคสเดิมซ้ำแล้วคะแนนขึ้น 15 ขึ้นไป', test: (r, H) => H.some(x => x !== r && x.caseId === r.caseId && r.total - x.total >= 15) },
  { id: 'ten', name: 'Ten Consults', code: '10', cat: 'path', how: 'ทำจบ 10 เคส', test: (r, H) => H.length >= 10 },
  { id: 'streak', name: 'Consistent', code: 'ST', cat: 'path', how: 'ได้ 80+ ติดกัน 5 เคสล่าสุด', test: (r, H) => H.length >= 5 && H.slice(-5).every(x => x.total >= 80) },
];

export const BADGE_BY_ID = Object.fromEntries(BADGES.map(b => [b.id, b]));

// History H is oldest → newest and already includes r as its last item.
export function badgesFor(r, H) { return BADGES.filter(b => { try { return b.test(r, H); } catch (_) { return false; } }).map(b => b.id); }

export function badgeSvg(id, size = 40, earned = true) {
  const b = BADGE_BY_ID[id]; if (!b) return '';
  const fs = b.code.length > 2 ? 11 : 13;
  return `<svg class="badge ${b.cat}${earned ? '' : ' off'}" width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="${b.name}"><title>${b.name}: ${b.how}</title>
    <path d="M20 2 35 10.5v19L20 38 5 29.5v-19z" class="bg"/><path d="M20 6.5 31.2 13v14L20 33.5 8.8 27V13z" class="rim"/>
    <text x="20" y="${20 + fs / 3}" text-anchor="middle" font-size="${fs}" font-weight="700">${b.code}</text></svg>`;
}
