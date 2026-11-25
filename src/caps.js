// caps.js — what this copy of the app can use, wherever it runs:
// as a claude.ai artifact (Claude built in, shared leaderboard, downloads), on GitHub Pages / Vercel,
// or opened straight from disk (file://).
export const IN_ARTIFACT = typeof window !== 'undefined' && !!window.claude && typeof window.claude.use === 'function';
export const CAPS = { sample: null, downloads: null, db: null, user: null, ready: false };

export async function initCaps() {
  if (IN_ARTIFACT) {
    const get = n => window.claude.use(n).catch(() => null);
    [CAPS.sample, CAPS.downloads, CAPS.db, CAPS.user] = await Promise.all([get('sample'), get('downloads'), get('db'), get('user')]);
  }
  CAPS.ready = true;
  document.dispatchEvent(new CustomEvent('vil:caps'));
  return CAPS;
}

// Save a generated file for the viewer. In an artifact this goes through the downloads capability.
export async function download(blob, name) {
  if (CAPS.downloads) {
    try { await CAPS.downloads.save({ filename: name, data: blob }); return true; }
    catch (e) { if (e?.code === 'declined' || e?.code === 'cancelled') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};

// A small accessible dialog used for tips and confirmations.
export function modal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `<div class="modal-box${wide ? ' wide' : ''}">${html}</div>`;
  const prev = document.activeElement;
  const close = () => { wrap.remove(); prev?.focus?.(); onClose?.(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.appendChild(wrap);
  (wrap.querySelector('[autofocus]') || wrap.querySelector('button,input,select,textarea,a'))?.focus();
  return { el: wrap, close };
}
