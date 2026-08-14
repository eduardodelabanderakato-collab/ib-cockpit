import * as mastery from '../models/mastery.js';
import { nodesFor, topicsFor } from '../syllabus.js';
import { el, panel, esc, subjectColor } from '../ui/dom.js';

/**
 * The moving map.
 *
 * Every subject is a sector; every topic is a branch; every syllabus node is
 * territory. Captured land glows in the subject colour, fading land is ringed
 * amber, locked land sits dark. This is the whole IB on one screen.
 */
export function territoryView(mount, ctx) {
  const { index, state } = ctx;

  let phase = state.get('settings').phase ?? null;

  const bar = el('div', 'row');
  const buttons = [];
  for (const [label, value] of [['All', null], ['DP1', 'DP1'], ['DP2', 'DP2']]) {
    const b = el('button', 'chip', label);
    b.setAttribute('aria-pressed', String(value === phase));
    b.onclick = () => {
      phase = value;
      state.update('settings', s => { s.phase = value; });
      buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    };
    buttons.push(b);
    bar.append(b);
  }

  const legend = el('div', 'legend');
  legend.innerHTML = `
    <span><i style="background:var(--accent)"></i>captured</span>
    <span><i style="background:transparent;box-shadow:inset 0 0 0 2px var(--warn)"></i>fading</span>
    <span><i style="background:var(--bad)"></i>lapsed</span>
    <span><i style="background:var(--track)"></i>locked</span>`;

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '16px';

  mount.append(bar, legend, wrap);

  function draw() {
    const records = state.get('mastery');
    wrap.innerHTML = '';

    for (const s of index.subjects) {
      const all = nodesFor(index, s.id);
      const nodes = phase ? all.filter(n => n.phase === phase) : all;
      if (!nodes.length) continue;

      const pct = Math.round(mastery.subjectProgress(nodes.map(n => n.id), records) * 100);
      const p = panel(`${s.callsign} · ${s.short}`, `${pct}%`);
      p.style.setProperty('--c', subjectColor(s));
      p.append(sector(index, s, nodes, records));
      wrap.append(p);
    }
  }

  draw();
}

/** One subject sector: topics as branches radiating from a hub. */
function sector(index, subject, nodes, records) {
  const topics = topicsFor(index, subject.id)
    .map(t => ({ t, nodes: nodes.filter(n => n.topicCode === t.code) }))
    .filter(x => x.nodes.length);

  const COL_W = 190, ROW_H = 26, PAD = 14;
  const cols = topics.length;
  const maxRows = Math.max(...topics.map(x => x.nodes.length));
  const W = cols * COL_W;
  const H = PAD * 2 + 34 + maxRows * ROW_H;
  const c = subjectColor(subject);

  const parts = [];

  topics.forEach((group, ci) => {
    const cx = ci * COL_W + COL_W / 2;
    parts.push(`<text x="${cx}" y="${PAD + 10}" text-anchor="middle"
      class="terr-topic">${esc(group.t.code)}</text>`);
    parts.push(`<text x="${cx}" y="${PAD + 23}" text-anchor="middle"
      class="terr-topic-t">${esc(clip(group.t.title, 24))}</text>`);
    parts.push(`<line x1="${cx}" y1="${PAD + 30}" x2="${cx}" y2="${
      PAD + 34 + group.nodes.length * ROW_H - ROW_H / 2}" stroke="var(--panel-line)" stroke-width="1"/>`);

    group.nodes.forEach((n, ri) => {
      const y = PAD + 34 + ri * ROW_H;
      const rec = records[n.id] ?? mastery.emptyRecord();
      const days = mastery.daysSince(rec.lastTouched);
      const st = mastery.stateOf(rec.level, days);
      const r = 4 + (rec.level / 4) * 4.5;

      let fill = 'var(--track)', stroke = 'var(--panel-line)', sw = 1.2, glow = '';
      if (st === 'fresh') { fill = c; stroke = c; glow = `filter="url(#glow-${subject.id})"`; }
      else if (st === 'dimming') { fill = c; stroke = c; }
      else if (st === 'fading') { fill = 'transparent'; stroke = 'var(--warn)'; sw = 2.4; }
      else if (st === 'lapsed') { fill = 'var(--bad)'; stroke = 'var(--bad)'; }

      parts.push(`<line x1="${cx}" y1="${y}" x2="${cx + 12}" y2="${y}"
        stroke="var(--panel-line)" stroke-width="1"/>`);
      parts.push(`<a href="#/subject/${subject.id}"><circle cx="${cx + 20}" cy="${y}"
        r="${r.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"
        opacity="${st === 'dimming' ? 0.5 : 1}" ${glow}>
        <title>${esc(n.code)} ${esc(n.title)} — ${mastery.LEVELS[rec.level]}${
          rec.lastTouched ? `, ${Math.round(days)}d ago` : ', never studied'}</title>
      </circle></a>`);
      parts.push(`<text x="${cx + 30}" y="${y + 3.2}" class="terr-code">${esc(n.code)}</text>`);
    });
  });

  const box = el('div', 'terr-scroll');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="terr-svg">
    <defs><filter id="glow-${subject.id}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="2.4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs>
    ${parts.join('')}
  </svg>`;
  return box;
}

function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
