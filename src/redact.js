// redact.js — first-pass de-identification in the browser, before any text leaves the teacher's machine.
// Pattern-based: it catches labelled fields, phone/ID/email/microchip numbers and dates. Free-text names
// can slip through, so the teacher reviews the result and can add words to always remove.

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONTH_RE = [...TH_MONTHS, ...TH_MONTHS_FULL].map(reEsc).join('|');

// Thai labels that tolerate missing tone marks / thanthakhat (common in PDF text extraction)
const MARKS = '[\\u0E48-\\u0E4C]?';
const loose = w => [...w.replace(/[\u0E48-\u0E4C]/g, '')].map(ch => reEsc(ch) + (/[\u0E00-\u0E7F]/.test(ch) ? MARKS : '')).join('');
const L = (...ws) => ws.map(w => /[\u0E00-\u0E7F]/.test(w) ? loose(w) : w).join('|');

const yearOf = y => { y = +y; if (y < 100) y += y > 60 ? 2500 : 2000; return y > 2400 ? y - 543 : y; };

const RULES = [
  { type: 'อีเมล', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { type: 'เลขบัตรประชาชน', re: /\b\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d\b/g },
  { type: 'ไมโครชิป', re: /\b\d{15}\b/g },
  { type: 'เบอร์โทร', re: /(?:\+?66|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}\b/g },
  { type: 'ชื่อคนที่ติดป้าย', re: new RegExp(`((?:${L('ชื่อเจ้าของ', 'เจ้าของสัตว์', 'เจ้าของ', 'ผู้นำสัตว์มา', 'สัตวแพทย์ผู้ตรวจ', 'สัตวแพทย์')}|Owner|Client|Veterinarian|Attending|Vet)\\s*[:：]\\s*)([^\\s|,;]+(?:[ \\t]+[^\\s|,;0-9]+)?)`, 'gi'), keep: 1 },
  { type: 'ชื่อสัตว์ที่ติดป้าย', re: new RegExp(`((?:${L('ชื่อสัตว์', 'ชื่อสัตว์ป่วย')}|Pet\\s*name|Patient\\s*name|Patient)\\s*[:：]\\s*)([^\\s|,;]+)`, 'gi'), keep: 1 },
  { type: 'สถานพยาบาล', re: new RegExp(`((?:${L('โรงพยาบาลสัตว์', 'คลินิก', 'สถานพยาบาล')}|Hospital|Clinic)\\s*[:：]\\s*)([^\\n|,;]{1,60})`, 'gi'), keep: 1 },
  { type: 'ที่อยู่', re: new RegExp(`((?:${L('ที่อยู่', 'บ้านเลขที่')}|Address)\\s*[:：]?\\s*)([^\\n]{1,100})`, 'gi'), keep: 1 },
  { type: 'เลขเวชระเบียน', re: new RegExp(`((?:HN|H\\.N\\.|${L('เลขเวชระเบียน', 'เวชระเบียน')}|Case\\s*No\\.?|Record\\s*No\\.?|VN|Visit\\s*No\\.?)\\s*[:#：]?\\s*)([A-Za-z0-9/-]{3,})`, 'gi'), keep: 1 },
  { type: 'คำนำหน้าชื่อคน', re: /(?:คุณ(?!ภาพ|สมบัติ|ค่า|ลักษณะ)|นาย(?!แพทย์)|นางสาว|นาง|น\.ส\.|น\.สพ\.|สพ\.ญ\.|นสพ\.|Dr\.|Mr\.|Mrs\.|Ms\.)\s?[ก-๙A-Za-z]{2,}(?:\s+[ก-๙A-Za-z]{2,})?/g },
  { type: 'Line ID / โซเชียล', re: /((?:Line|ไลน์|LINE\s*ID|Facebook|FB|IG)\s*[:：]?\s*)(@?[\w.-]{3,})/gi, keep: 1 },
];

function findDates(text) {
  const out = [];
  const push = (m, d) => { if (!isNaN(d)) out.push({ i: m.index, s: m[0], d }); };
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) push(m, Date.UTC(yearOf(m[3]), +m[2] - 1, +m[1]));
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(m, Date.UTC(yearOf(m[1]), +m[2] - 1, +m[3]));
  for (const m of text.matchAll(new RegExp(`(\\d{1,2})\\s*(${MONTH_RE})\\s*(\\d{2,4})`, 'g'))) {
    let mi = TH_MONTHS.indexOf(m[2]); if (mi < 0) mi = TH_MONTHS_FULL.indexOf(m[2]);
    push(m, Date.UTC(yearOf(m[3]), mi, +m[1]));
  }
  return out;
}

// returns {text, counts:{type:n}, total}
export function redact(text, extraWords = []) {
  let t = String(text || '');
  const counts = {};
  const hit = type => { counts[type] = (counts[type] || 0) + 1; };
  for (const w of extraWords.map(s => s.trim()).filter(s => s.length >= 2).sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(reEsc(w), 'g'), () => { hit('คำที่อาจารย์กำหนด'); return '[ปิด]'; });
  }
  // dates → relative days from the earliest date
  const dates = findDates(t);
  if (dates.length) {
    const d0 = Math.min(...dates.map(x => x.d));
    const seen = new Set();
    for (const x of dates.sort((a, b) => b.s.length - a.s.length)) {
      if (seen.has(x.s)) continue; seen.add(x.s);
      const n = Math.round((x.d - d0) / 864e5);
      t = t.split(x.s).join(`[วันที่ ${n === 0 ? '0' : (n > 0 ? '+' : '') + n}]`); hit('วันที่ → วันสัมพัทธ์');
    }
  }
  for (const r of RULES) {
    t = t.replace(r.re, (...m) => { hit(r.type); return r.keep ? m[1] + '[ปิด]' : '[ปิด]'; });
  }
  return { text: t, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export const highlight = (escaped) => escaped.replace(/\[(ปิด|วันที่ [^\]]+)\]/g, '<mark>[$1]</mark>');
