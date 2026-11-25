// data.js — the bundled case library and rules (embedded in index.html so it also works from file://).
// On GitHub Pages / Vercel, extra .md files listed in cases/index.json are added at start-up,
// so a teacher can add cases by uploading files to the repo without rebuilding.
import { parseCase } from './case.js';
import { IN_ARTIFACT } from './caps.js';

let DATA = null, EXTRA = [];
function raw() {
  if (DATA) return DATA;
  const el = document.getElementById('vil-data');
  DATA = el ? JSON.parse(el.textContent) : { cases: [], rules: {} };
  return DATA;
}
export async function loadExtraCases() {
  if (IN_ARTIFACT || location.protocol === 'file:') return;
  try {
    const known = new Set(raw().cases.map(c => c.file));
    const idx = await fetch('cases/index.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []);
    const add = idx.filter(f => !known.has(f));
    EXTRA = (await Promise.all(add.map(f => fetch('cases/' + encodeURIComponent(f)).then(r => r.ok ? r.text() : null).then(md => md && { file: f, md }).catch(() => null)))).filter(Boolean);
  } catch (_) { EXTRA = []; }
}
export const libraryCases = () => [...raw().cases, ...EXTRA].map(c => parseCase(c.md, c.file));
export const embeddedRules = () => raw().rules;
