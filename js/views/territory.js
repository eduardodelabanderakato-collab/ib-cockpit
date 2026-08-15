import * as mastery from '../models/mastery.js';
import { nodesFor, topicsFor } from '../syllabus.js';
import { el, panel, esc, subjectColor } from '../ui/dom.js';
import { boardFor } from '../board.js';
import { captureNode } from './subject.js';
import { halfLivesFor } from '../models/curve.js';

/**
 * The map.
 *
 * Every syllabus node is one tile of ground. Held tiles are solid in the
 * subject's colour, tiles you are losing are ringed amber, ground you have let
 * go is red, and everything you have never opened is dark.
 *
 * You take ground here. Clicking a tile captures it in place — no jumping to
 * another screen and back — and every counter above it moves in the same beat:
 * the sector percentage, the grade your coverage backs, and the number of
 * captures still standing between you and the next one. That last number is the
 * whole point of the screen. It is the only place in the app where the work and
 * the score are the same gesture.
 */
export function territoryView(mount, ctx) {
  const { index, state } = ctx;

  let phase = state.get('settings').phase ?? null;

  const head = el('div', 'terr-head');
  const bar = el('div', 'row');
  const buttons = [];
  for (const [label, value] of [['All', null], ['DP1', 'DP1'], ['DP2', 'DP2']]) {
    const b = el('button', 'chip', label);
    b.setAttribute('aria-pressed', String(value === phase));
    b.onclick = () => {
      phase = value;
      state.update('settings', s => { s.phase = value; });
      buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      drawAll();
    };
    buttons.push(b);
    bar.append(b);
  }

  const legend = el('div', 'legend');
  legend.innerHTML = `
    <span><i class="lg lg-fresh"></i>held</span>
    <span><i class="lg lg-dim"></i>dimming</span>
    <span><i class="lg lg-fade"></i>slipping</span>
    <span><i class="lg lg-lapsed"></i>lost</span>
    <span><i class="lg lg-locked"></i>never opened</span>`;

  const front = el('div');
  const wrap = el('div', 'terr-wrap');
  head.append(bar, legend);
  mount.append(head, front, wrap);

  /** Redraw the summary strip and the front line without rebuilding sectors. */
  function drawFront() {
    const board = boardFor(ctx);
    front.innerHTML = '';

    const p = panel('The front', `${board.backed} / 45 backed`);
    p.insertAdjacentHTML('beforeend', `
      <div class="terr-two">
        <span><b>${board.held}</b><i>points held — what your scores say</i></span>
        <span><b>${board.backed}</b><i>ground held — what your coverage backs</i></span>
      </div>
      <div class="terr-race" title="Scores against coverage">
        <div class="terr-race-t"><i style="width:${(board.held / 45) * 100}%"></i></div>
        <div class="terr-race-t alt"><i style="width:${(board.backed / 45) * 100}%"></i></div>
      </div>
      <p class="mfd-sub">${
        board.exposed
          ? `<b>${board.exposed} point${board.exposed === 1 ? '' : 's'} exposed.</b>
             You are scoring above the syllabus you have actually covered — that
             holds until a paper asks about ground you never took.`
          : board.unconverted
            ? `<b>${board.unconverted} point${board.unconverted === 1 ? '' : 's'} unconverted.</b>
               You have the ground; the marks have not caught up. Sit a paper.`
            : 'Your scores and your coverage agree.'}</p>`);
    front.append(p);

    if (board.front) {
      const f = panel('Next advance', `${board.front.captures} captures`);
      f.style.setProperty('--c', subjectColor(board.front.subject));
      f.insertAdjacentHTML('beforeend', `
        <div class="terr-advance">
          <b>${esc(board.front.subject.short)}</b>
          <span>${board.front.captures} more capture${board.front.captures === 1 ? '' : 's'}
            back a ${board.front.aiming}</span>
        </div>
        <p class="mfd-sub">Fewest tiles of any sector. Take them below and this
          number falls with every click.</p>`);
      front.append(f);
    }
    return board;
  }

  function drawAll() {
    const board = drawFront();
    wrap.innerHTML = '';
    for (const s of index.subjects) {
      const all = nodesFor(index, s.id);
      const nodes = phase ? all.filter(n => n.phase === phase) : all;
      if (!nodes.length) continue;
      wrap.append(sector(ctx, s, all, nodes, board, redraw));
    }
  }

  /**
   * After a capture, everything above the tile is stale. Sectors are rebuilt
   * rather than patched because a capture in one subject changes the shared
   * board — `backed`, the exposure line and the front can all move — and a map
   * that only updated the tile you clicked would be lying about the rest.
   */
  function redraw() { drawAll(); }

  drawAll();
}

/** One sector: its standing on the board, then the ground itself. */
function sector(ctx, subject, allNodes, nodes, board, redraw) {
  const { index, state } = ctx;
  const records = state.get('mastery');
  const hl = halfLivesFor(state.get('checks'));
  const c = subjectColor(subject);
  const seg = board.segments.find(s => s.subject.id === subject.id);

  const pct = Math.round(mastery.subjectProgress(nodes.map(n => n.id), records, Date.now(), hl) * 100);
  const p = panel(`${subject.callsign} · ${subject.short}`, `${pct}% held`);
  p.style.setProperty('--c', c);
  p.classList.add('terr-sector');

  if (seg) {
    p.insertAdjacentHTML('beforeend', `
      <div class="terr-standing">
        <span class="terr-chip">Scoring <b>${seg.known ? seg.grade : '—'}</b></span>
        <span class="terr-chip">Coverage backs <b>${seg.backs || '—'}</b></span>
        ${seg.captures
          ? `<span class="terr-chip hot">${seg.captures} capture${
              seg.captures === 1 ? '' : 's'} to back a ${seg.aiming}</span>`
          : '<span class="terr-chip ok">Ground held — the next point is on the paper</span>'}
      </div>
      <div class="terr-cov"><i style="width:${Math.min(100, seg.coverage * 100).toFixed(1)}%"></i></div>`);
  }

  const groups = topicsFor(index, subject.id)
    .map(t => ({ t, nodes: nodes.filter(n => n.topicCode === t.code) }))
    .filter(x => x.nodes.length);

  for (const g of groups) {
    const row = el('div', 'terr-topic-row');
    const held = g.nodes.filter(n => (records[n.id]?.level ?? 0) > 0).length;
    row.innerHTML = `<p class="terr-topic-h"><b>${esc(g.t.code)}</b> ${esc(g.t.title)}
      <span>${held}/${g.nodes.length}</span></p>`;

    const grid = el('div', 'terr-grid');
    for (const n of g.nodes) {
      const rec = records[n.id] ?? mastery.emptyRecord();
      const days = mastery.daysSince(rec.lastTouched);
      const st = mastery.stateOf(rec.level, days, hl);

      const tile = el('button', 'terr-tile');
      tile.dataset.state = st;
      tile.dataset.level = String(rec.level);
      tile.style.setProperty('--c', c);
      tile.innerHTML = `<span>${esc(n.code)}</span>`;
      tile.title = `${n.code} ${n.title} — ${mastery.LEVELS[rec.level]}${
        rec.lastTouched ? `, ${Math.round(days)}d ago` : ', never opened'}\nClick to capture`;
      tile.setAttribute('aria-label',
        `${n.code} ${n.title}, ${mastery.LEVELS[rec.level]}. Capture.`);
      tile.onclick = () => {
        tile.classList.add('taking');
        captureNode(n, state, st, ctx);
        // Let the flash play before the sectors are rebuilt under it.
        setTimeout(redraw, 260);
      };
      grid.append(tile);
    }
    row.append(grid);
    p.append(row);
  }

  return p;
}
