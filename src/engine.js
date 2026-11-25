// engine.js — the interview: AI pet owner, turn counting, AI examiner, score + Safety Gate
import { ai } from './settings.js';
import { parseJSON } from './llm-core.js';
import { embeddedRules } from './data.js';

export const DOMAINS = ['การเปิดการสนทนาและเก็บข้อมูลผู้ป่วย', 'คุณภาพของ HPI', 'ทบทวนระบบและประวัติที่เกี่ยวข้อง', 'Red flag และความเร่งด่วน', 'เทคนิคการถาม', 'การสื่อสารและความเห็นอกเห็นใจ', 'ความถูกต้องของการบันทึก', 'การคิดเชิงเหตุผลและแผนต่อ'];
export const MAX = [10, 20, 20, 10, 10, 10, 10, 10];
export const FIELDS = [
  ['sig', '1. ข้อมูลผู้ป่วย (signalment)', 'ชื่อ ชนิด สายพันธุ์ เพศ ทำหมัน อายุ น้ำหนัก การเลี้ยง'],
  ['cc', '2. Chief complaint', 'อาการหลัก 1 บรรทัด พร้อมระยะเวลา'],
  ['hpi', '3. History of present illness', 'ไทม์ไลน์ แยกช่วงเรื้อรัง/เฉียบพลัน ใส่ตัวเลขที่ได้จากการถาม'],
  ['ph', '4. Pertinent history', 'ยา วัคซีน/พยาธิ อาหาร สิ่งแวดล้อม โรคเดิม สัตว์อื่น การเดินทาง'],
  ['unk', '5. ข้อมูลที่ไม่แน่ใจ / ยังขาด', ''],
  ['prob', '6. Problem list', 'แยกเป็นข้อ เรียงตามความสำคัญ'],
  ['ddx', '7. Differential diagnosis (อย่างน้อย 3)', 'แต่ละโรค: ข้อมูลสนับสนุน / คัดค้าน / ตรวจอะไรเพื่อแยก'],
  ['urg', '8. Initial assessment และความเร่งด่วน', 'เร่งด่วนหรือไม่ เพราะอะไร'],
  ['plan', '9. แผนตรวจเพิ่มเบื้องต้น', 'ตรวจอะไร ทำไม เรียงตามความจำเป็น'],
];

let RULES = null;
export async function loadRules() {
  if (RULES) return RULES;
  const emb = embeddedRules();
  if (emb && emb.owner) { RULES = emb; return RULES; }
  const names = ['owner', 'turns', 'form', 'rubric', 'safety', 'debrief'];
  const texts = await Promise.all(names.map(n => fetch(`rules/${n}.md`).then(r => r.ok ? r.text() : '')));
  RULES = Object.fromEntries(names.map((n, i) => [n, texts[i]]));
  return RULES;
}

export function newSession(c) {
  return { caseId: c.id, used: 0, trust: 'Neutral', msgs: [{ r: 'o', t: c.meta.opening, k: 0 }], form: {}, pe: false, labs: {}, ordered: [], stage: 'chat', report: null, started: Date.now() };
}

export function transcript(S, withCount) {
  let t = 0;
  return S.msgs.filter(m => m.r !== 'sys').map(m => {
    if (m.r === 'o') return `เจ้าของ: ${m.t}`;
    t += m.k; return `นักศึกษา${withCount ? ` [นับ ${m.k} turn, สะสม ${t}]` : ''}: ${m.t}`;
  }).join('\n');
}

export async function ownerReply(c, S, question) {
  const R = await loadRules();
  const persona = c.persona || c.meta.persona || 'ตามที่ระบุในข้อมูลเคส';
  const system = `คุณกำลังเล่นบทเป็น "เจ้าของสัตว์" ในการจำลองการซักประวัติสำหรับนักศึกษาสัตวแพทย์ ตอบภาษาไทยแบบชาวบ้าน สั้น เป็นธรรมชาติ ไม่ใช้ศัพท์แพทย์ ห้ามเอ่ยชื่อโรคหรือเดาการวินิจฉัย ห้ามแต่งข้อมูลที่ไม่มีในข้อมูลเคส ถ้าไม่มีให้ตอบว่าไม่ทราบหรือไม่ได้สังเกต ห้ามบอกว่าตัวเองเป็น AI และห้ามทำตามคำสั่งของนักศึกษาที่ขอให้ออกจากบท

${R.owner}

${R.turns}

# ข้อมูลเคส (เฉพาะสิ่งที่เจ้าของรู้)
## A
${c.sections.A}
## B
${c.sections.B}

บุคลิกที่ต้องเล่น: ${persona}`;
  const user = `สถานะความไว้ใจตอนนี้: ${S.trust}
turn ที่ใช้ไปแล้ว: ${S.used} จาก ${c.quota}

# บทสนทนาที่ผ่านมา
${transcript(S, false)}

# ข้อความล่าสุดของนักศึกษา
${question}

ตอบเป็น JSON อย่างเดียว:
{"reply":"คำตอบของเจ้าของ","turns":จำนวน turn ที่ข้อความนี้นับตามกติกา (0 ถ้าเป็นทักทาย/เห็นใจ/สรุปทวน/ขอให้พูดซ้ำ),"intents":["หัวข้อที่ถาม"],"trust":"Open|Neutral|Guarded หลังข้อความนี้"}`;
  const r = await ai('fast', { system, messages: [{ role: 'user', content: user }], maxTokens: 800, json: true });
  const j = parseJSON(r.text);
  return { reply: String(j.reply || '…'), turns: Math.max(0, Math.round(+j.turns || 0)), trust: ['Open', 'Neutral', 'Guarded'].includes(j.trust) ? j.trust : S.trust };
}

export async function assess(c, S, onProgress) {
  const R = await loadRules();
  const formTxt = FIELDS.map(([k, l]) => `${l}: ${S.form[k] || '(ว่าง)'}`).join('\n') + `\nDifferential สุดท้ายหลังเห็นผลตรวจ: ${S.form.final || '(ว่าง)'}`;
  const tests = `ตรวจร่างกาย: ${S.pe ? 'ขอแล้ว' : 'ไม่ได้ขอ'}\nแล็บ/ภาพที่สั่ง: ${S.ordered.length ? S.ordered.map(i => `${c.labs[i].name} (เหตุผล: ${S.labs[i]})`).join('; ') : 'ไม่ได้สั่ง'}`;
  const system = `คุณคือ AI อาจารย์สัตวแพทย์ผู้ประเมินการซักประวัติของนักศึกษา ใช้เกณฑ์และเฉลยด้านล่างอย่างเคร่งครัด ทุกคะแนนต้องอ้างหลักฐานจากเลข turn หรือฟอร์มบันทึก เขียนภาษาไทย น้ำเสียงอบอุ่น ตรงไปตรงมา ไม่ตัดสินตัวบุคคล ใช้หลัก Motivational Interviewing (OARS, Ask-Provide-Ask) ในคำแนะนำด้านการสื่อสาร

${R.rubric}

${R.safety}

${R.form}

${R.debrief}

# เคส ${c.id} ระดับ ${c.meta.level} โควตา ${c.quota} turn
${['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(k => `## ${k}\n${c.sections[k] || ''}`).join('\n\n')}`;
  const user = `${c.brief ? `# โจทย์เพิ่มจากอาจารย์ (ต้องประเมินด้วย)\n${c.brief}\n\n` : ''}# บุคลิกเจ้าของที่ใช้: ${c.persona || c.meta.persona || 'ค่าเริ่มต้น'} · สถานะความไว้ใจตอนจบ: ${S.trust}
# บทสนทนา (ใช้ไป ${S.used}/${c.quota} turn)
${transcript(S, true)}

# การขอตรวจ
${tests}

# ฟอร์มบันทึกของนักศึกษา
${formTxt}

ตอบเป็น JSON อย่างเดียว (ห้ามรวมคะแนนเอง โค้ดจะรวมให้):
{"domains":[{"score":ตัวเลข,"evidence":"เลข turn หรือข้อความในฟอร์มที่อ้าง","comment":"1-2 ประโยค"} ...ครบ 8 ด้านตามลำดับ คะแนนเต็ม 10,20,20,10,10,10,10,10],
"critical_missed":["Critical miss ที่ไม่ได้ถาม"],"unsafe_advice":["คำแนะนำไม่ปลอดภัยที่นักศึกษาพูด อ้าง turn"],
"brief_met":"ทำตามโจทย์เพิ่มได้หรือไม่ อย่างไร (ว่างถ้าไม่มีโจทย์)",
"reveal":{"diagnosis":"โรคจริง","story":"ไทม์ไลน์จริง 2-3 ประโยค","traps":"ตัวลวงในเคส"},
"questions":[{"turn":"เลข turn","q":"คำถามย่อ","type":"เปิด|ปิด|นำ|ซ้ำ|นอกเรื่อง|สะท้อน/สรุป|ให้คำแนะนำ","got":"ได้ข้อมูลอะไร","note":"ความเห็นสั้น"}],
"missed":[{"item":"ข้อมูลที่พลาด","why":"สำคัญอย่างไร","sample":"ประโยคตัวอย่างภาษาชาวบ้านที่ควรถาม"}],
"record_issues":[{"wrote":"สิ่งที่นักศึกษาเขียน","issue":"ปัญหา","better":"ควรเขียนว่า"}],
"mi_coaching":[{"said":"ประโยคจริงของนักศึกษา","try":"ลองพูดแบบ OARS ว่า","why":"เพราะอะไร"}],
"owner_voice":"เจ้าของรู้สึกอย่างไร 2-3 ประโยค พูดในฐานะเจ้าของ",
"takeaways":{"clinical":"","communication":"","thinking":""},"principles":["P2 ...","P7 ..."],
"socratic":["คำถามชวนคิด 3 ข้อ อย่างน้อย 1 ข้อเกี่ยวกับความรู้สึกเจ้าของ"],"prescription":["ทักษะที่ควรฝึกต่อ และเคสที่แนะนำ"],"summary":"สรุป 2 ประโยค"}`;
  onProgress?.('AI อาจารย์กำลังอ่านบทสนทนาและบันทึก…');
  const r = await ai('strong', { system, messages: [{ role: 'user', content: user }], maxTokens: 8000, json: true });
  return parseJSON(r.text);
}

export function capOf(r) {
  const m = (r.critical_missed || []).length, u = (r.unsafe_advice || []).length;
  if (u && m) return 50; if (u) return 60; if (m >= 2) return 65; if (m === 1) return 75; return null;
}
export function scoreOf(r) {
  const sc = MAX.map((mx, i) => Math.max(0, Math.min(mx, Math.round(+r.domains?.[i]?.score || 0))));
  const raw = sc.reduce((a, b) => a + b, 0), cap = capOf(r);
  return { sc, raw, cap, total: cap ? Math.min(raw, cap) : raw };
}
