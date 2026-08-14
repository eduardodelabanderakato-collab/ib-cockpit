export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function panel(title, tag) {
  const p = el('div', 'panel');
  if (title) {
    const h = el('p', 'panel-h');
    h.append(document.createTextNode(title));
    if (tag) h.append(el('span', 'tag mono', tag));
    p.append(h);
  }
  return p;
}

/** Escape anything that originates from user input before it reaches innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastEl = null;
let toastTimer = null;

export function toast(html) {
  if (!toastEl) {
    toastEl = el('div', 'toast');
    document.body.append(toastEl);
  }
  toastEl.innerHTML = html;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

export function subjectColor(s) {
  return s.colorKey === 'accent' ? 'var(--accent)' : `var(--${s.colorKey})`;
}

/** GitHub-style contribution grid over the trailing `weeks` weeks. */
export function heatmap(sessions, weeks = 45, accent = 'var(--accent)') {
  const DAY = 86400000;
  const byDay = new Map();
  for (const s of sessions) {
    const d = new Date(s.ts);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    byDay.set(key, (byDay.get(key) ?? 0) + s.minutes);
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const cells = [];
  const total = weeks * 7;
  // The grid ends on the Saturday of the current week, so `total` cells fill
  // exactly `weeks` columns with today somewhere in the last one.
  const end = new Date(today.getTime() + (6 - today.getDay()) * DAY);
  const start = new Date(end.getTime() - (total - 1) * DAY);

  for (let i = 0; i < total; i++) {
    const d = new Date(start.getTime() + i * DAY);
    if (d > today) { cells.push('<i></i>'); continue; }
    const mins = byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? 0;
    const a = mins === 0 ? null
      : mins < 25 ? '44' : mins < 60 ? '80' : mins < 120 ? 'bb' : '';
    const bg = a === null ? 'var(--track)' : `color-mix(in srgb, ${accent} ${
      a === '44' ? 30 : a === '80' ? 55 : a === 'bb' ? 78 : 100}%, var(--track))`;
    cells.push(`<i style="background:${bg}" title="${d.toDateString()}: ${mins} min"></i>`);
  }

  return `<div class="heat-scroll"><div class="heat">${cells.join('')}</div></div>`;
}
