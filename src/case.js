// case.js — read, check and edit case .md files (frontmatter + sections A–H)
export const SECTIONS = { A: 'ผู้ป่วยและเจ้าของ', B: 'ข้อมูลที่เจ้าของรู้', C: 'ตรวจร่างกายเบื้องต้น', D: 'Lab และภาพวินิจฉัย', E: 'เฉลยลับ', F: 'เกณฑ์การถาม', G: 'ภาษาชาวบ้าน → ศัพท์คลินิก', H: 'Key take-away และคำถามชวนคิด' };
export const LEVELS = { Beginner: 10, Intermediate: 20, Advanced: 30 };
export const PERSONAS = ['Cooperative', 'Anxious', 'Low Medical Literacy', 'Incomplete Recall'];

const unq = v => {
  v = v.trim();
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch (_) { return v.slice(1, -1); } }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};
const q = v => typeof v === 'number' ? String(v) : /^[\w./-]+$/.test(String(v)) ? String(v) : JSON.stringify(String(v));

export function parseCase(md, fileName = '') {
  const text = String(md).replace(/\r\n/g, '\n');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (fm) for (const line of fm[1].split('\n')) {
    const m = line.match(/^([A-Za-z_][\w]*)\s*:\s*(.*)$/);
    if (m) { let v = m[2]; if (!v.trim().startsWith('"')) v = v.replace(/\s+#.*$/, ''); meta[m[1]] = unq(v); }
  }
  const body = fm ? text.slice(fm[0].length) : text;
  const sections = {};
  const re = /^##\s*([A-H])\.[^\n]*$/gm;
  const marks = [...body.matchAll(re)];
  marks.forEach((m, i) => { sections[m[1]] = body.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : body.length).trim(); });
  const c = { meta, sections, md: text, fileName };
  c.id = meta.id || fileName.replace(/\.md$/, '') || 'case';
  c.labs = tableRows(sections.D || '').map(r => ({ name: r[0], result: r[1] || '', ref: r[2] || '' })).filter(l => l.name);
  c.quota = Number(meta.quota) || LEVELS[meta.level] || 20;
  return c;
}

export function tableRows(txt) {
  const rows = txt.split('\n').filter(l => /^\s*\|/.test(l));
  return rows.slice(2).map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim()));
}

export function checkCase(c) {
  const issues = [];
  for (const k of ['id', 'species', 'level', 'opening', 'patient']) if (!c.meta[k]) issues.push(`frontmatter ไม่มี ${k}`);
  if (c.meta.species && !['dog', 'cat'].includes(c.meta.species)) issues.push('species ต้องเป็น dog หรือ cat');
  if (c.meta.level && !LEVELS[c.meta.level]) issues.push('level ต้องเป็น Beginner, Intermediate หรือ Advanced');
  for (const k of Object.keys(SECTIONS)) if (!c.sections[k]) issues.push(`ไม่มีหัวข้อ ## ${k}.`);
  if (c.sections.B && !/\|\s*[VTSU]\s*\|/.test(c.sections.B)) issues.push('ตาราง B ไม่มีป้าย V/T/S/U');
  if (c.sections.D && !c.labs.length) issues.push('ตาราง D ไม่มีรายการตรวจ');
  if (c.sections.F && !/critical/i.test(c.sections.F)) issues.push('F ไม่มี Critical miss');
  return issues;
}

export function setMeta(md, key, value) {
  const text = String(md);
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return `---\n${key}: ${q(value)}\n---\n\n` + text;
  const lines = fm[1].split('\n');
  const i = lines.findIndex(l => l.startsWith(key + ':'));
  if (i >= 0) lines[i] = `${key}: ${q(value)}`; else lines.push(`${key}: ${q(value)}`);
  return `---\n${lines.join('\n')}\n---` + text.slice(fm[0].length);
}

// What the student is allowed to see before starting.
export const cardOf = c => ({ id: c.id, species: c.meta.species, level: c.meta.level, quota: c.quota, patient: c.meta.patient, opening: c.meta.opening, persona: c.meta.persona || '' });
