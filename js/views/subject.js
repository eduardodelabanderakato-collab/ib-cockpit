import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import { nodesFor, topicsFor, subject as findSubject, phaseFilter, provenance } from '../syllabus.js';
import { el, panel, esc, toast, subjectColor } from '../ui/dom.js';
import { boardFor } from '../board.js';
import { rankUp } from '../ui/celebrate.js';
import { RANKS, rankFor } from '../models/road.js';
import { shouldCelebrate } from '../ui/celebrate.js';



export function subjectDetailView(mount, ctx, { id }) {
  const { index, state } = ctx;
  const s = findSubject(index, id);
  if (!s) { mount.append(el('p', 'empty', 'Unknown subject.')); return; }

  const color = subjectColor(s);
  const allNodes = nodesFor(index, s.id);
  const ids = allNodes.map(n => n.id);

  // ── header ────────────────────────────────────────────────
  const head = el('div', 'panel');
  head.style.setProperty('--c', color);
  const summary = el('div');
  head.append(summary);

  // ── phase filter ──────────────────────────────────────────
  let phase = state.get('settings').phase ?? null;
  const bar = el('div', 'row');
  const buttons = [];
  for (const [label, value] of [['All', null], ['DP1', 'DP1'], ['DP2', 'DP2']]) {
    const b = el('button', 'chip', label);
    b.onclick = () => {
      phase = value;
      state.update('settings', st => { st.phase = value; });
      buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    };
    b.setAttribute('aria-pressed', String(value === phase));
    buttons.push(b);
    bar.append(b);
  }

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '16px';

  mount.append(head, bar, wrap);

  // Provenance is recorded honestly but stated quietly. The trees are in use;
  // a standing warning on five of six subjects is noise, not information.
  const prov = provenance(index, s.id);
  if (prov) {
    const note = el('p', 'prov');
    note.dataset.level = prov.level;
    note.innerHTML = `<b>${esc(prov.label)}</b> · ${esc(prov.guide)}`;
    note.title = prov.note;
    mount.insertBefore(note, bar);
  }

  function draw() {
    const records = state.get('mastery');
    const pct = Math.round(mastery.subjectProgress(ids, records) * 100);
    const fading = mastery.rescueQueue(ids, records);
    const lvl = xp.levelFromXp(state.get('xp').bySubject[s.id] ?? 0);

    summary.innerHTML = `
      <p class="panel-h">${esc(s.callsign)}<span class="tag mono" style="color:${color}">
        ${esc(s.level)}</span></p>
      <h1>${esc(s.name)}</h1>
      <div class="xp" style="margin-top:16px">
        <span class="xp-lvl">LEVEL<b>${lvl.level}</b></span>
        <div class="xp-track"><div class="xp-fill" style="width:${(lvl.into / lvl.need) * 100}%"></div></div>
        <span class="xp-num">${pct}% captured · ${ids.length} nodes${
          fading.length ? ` · ${fading.length} fading` : ''}</span>
      </div>`;

    wrap.innerHTML = '';
    for (const topic of topicsFor(index, s.id)) {
      const nodes = phaseFilter(allNodes.filter(n => n.topicCode === topic.code), phase);
      if (!nodes.length) continue;

      const done = nodes.filter(n => (records[n.id]?.level ?? 0) > 0).length;
      const p = panel(`${topic.code} · ${topic.title}`, `${done}/${nodes.length}`);
      p.style.setProperty('--c', color);

      for (const n of nodes) {
        const rec = records[n.id] ?? mastery.emptyRecord();
        const days = mastery.daysSince(rec.lastTouched);
        const b = el('button', 'node');
        b.dataset.state = mastery.stateOf(rec.level, days);
        b.innerHTML = `
          <span class="node-pip"></span>
          <span class="node-code">${esc(n.code)}</span>
          <span class="node-title">${esc(n.title)}</span>
          ${n.tier === 'AHL' ? '<span class="node-ahl">HL</span>' : ''}
          <span class="node-lvl">${mastery.LEVELS[rec.level]}</span>`;
        b.title = rec.lastTouched
          ? `Last touched ${Math.round(days)} day(s) ago · ${rec.touches} visits`
          : 'Never studied';
        b.onclick = e => {
          // Clicking the row captures; the notes toggle is handled separately.
          if (e.target.closest('.node-notes-btn')) return;
          captureNode(n, state, mastery.stateOf(rec.level, days), ctx);
          draw();
        };

        const noteBtn = el('button', 'node-lvl node-notes-btn',
          state.get('notes')[n.id]?.md || state.get('notes')[n.id]?.goodnotes ? 'notes ●' : 'notes');
        noteBtn.style.cursor = 'pointer';
        noteBtn.title = 'Open notes and GoodNotes link for this topic';
        noteBtn.onclick = ev => {
          ev.stopPropagation();
          const open = p.querySelector(`[data-notes-for="${n.id}"]`);
          if (open) { open.remove(); return; }
          for (const x of p.querySelectorAll('[data-notes-for]')) x.remove();
          b.after(notesPane(n, state, s));
        };
        b.append(noteBtn);
        p.append(b);
      }
      wrap.append(p);
    }
  }

  draw();
}

/**
 * Notes for one syllabus node: a markdown pane plus the GoodNotes link.
 *
 * GoodNotes has no public API, so nothing can sync your handwriting. What works
 * is a share link per topic: paste it once and the topic opens straight into
 * that notebook forever after.
 */
function notesPane(node, state, subject) {
  const box = el('div', 'notes');
  box.dataset.notesFor = node.id;
  const saved = state.get('notes')[node.id] ?? { md: '', goodnotes: '' };

  const linkRow = el('div', 'row');
  const link = el('input', 'chip field row-grow');
  link.type = 'url';
  link.placeholder = 'GoodNotes share link for this topic';
  link.value = saved.goodnotes ?? '';

  const open = el('a', 'chip', 'Open notebook ↗');
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  const syncOpen = () => {
    const v = link.value.trim();
    open.href = v || '#';
    open.style.display = v ? '' : 'none';
  };
  syncOpen();

  const ta = el('textarea');
  ta.placeholder = 'Typed summary, formulas, what you got wrong…';
  ta.value = saved.md ?? '';

  const actions = el('div', 'row');
  const save = el('button', 'chip chip-primary', 'Save');
  const close = el('button', 'chip', 'Close');
  close.onclick = () => box.remove();

  save.onclick = () => {
    const first = !saved.md && ta.value.trim();
    state.update('notes', n => {
      n[node.id] = {
        md: ta.value,
        goodnotes: link.value.trim(),
        updatedAt: new Date().toISOString(),
      };
    });
    if (first) {
      const earned = xp.award('firstNote', {}, state.get('xp').streak.current);
      state.update('xp', v => {
        v.total += earned;
        v.bySubject[subject.id] = (v.bySubject[subject.id] ?? 0) + earned;
      });
      toast(`Notes saved <b>+${earned} XP</b>`);
    } else {
      toast('Notes saved');
    }
    syncOpen();
  };

  link.oninput = syncOpen;
  linkRow.append(link, open);
  actions.append(save, close);
  box.append(linkRow, ta, actions);
  return box;
}

/**
 * Advance a node one mastery level, and report what it did to the board.
 *
 * A capture used to pay XP and nothing else, which is why the map felt
 * disconnected from the score: you could take fifty nodes and the 45 would not
 * flinch. It still cannot move `held` — only a real mark does that, and faking
 * it would make the projection a lie. What it moves is `backed`: the grade your
 * coverage actually supports. That number is on the same board, and now the
 * capture says out loud when it shifts.
 *
 * @param ctx  the app context; omit to skip the board update entirely.
 */
export function captureNode(node, state, priorState, ctx = null) {
  const now = Date.now();
  const streak = state.get('xp').streak.current;
  const before = ctx ? boardFor(ctx) : null;
  let earned = 0;
  let label = '';

  state.update('mastery', m => {
    const before = m[node.id] ?? mastery.emptyRecord();
    const after = mastery.capture(before, now);
    if (priorState === 'fading' || priorState === 'lapsed') {
      earned = xp.award('rescue', {}, streak);
      label = 'Rescued';
    } else if (after.level > before.level) {
      earned = xp.award('capture', { level: after.level }, streak);
      label = mastery.LEVELS[after.level];
    } else {
      earned = xp.award('rescue', {}, streak);
      label = 'Reinforced';
    }
    m[node.id] = after;
  });

  state.update('xp', x => {
    x.total += earned;
    x.bySubject[node.subjectId] = (x.bySubject[node.subjectId] ?? 0) + earned;
  });

  const moved = before ? boardMove(before, boardFor(ctx), node, state) : null;
  toast(moved ?? `${esc(label)} — ${esc(node.code)} <b>+${earned} XP</b>`);
  return earned;
}

/**
 * What that capture did to the board, in the loudest true terms available.
 *
 * Ordered by how much it matters: a rank is worth interrupting for, a whole
 * point of backing is worth a headline, and one step closer is still worth
 * saying — silence after a capture is what made the map feel pointless.
 */
function boardMove(before, after, node, state) {
  if (after.backed > before.backed) {
    const seg = after.segments.find(s => s.subject.id === node.subjectId);
    const rank = rankFor(after.backed);
    const was = state.get('settings').lastBackedRank ?? null;
    state.update('settings', st => { st.lastBackedRank = rank.name; });
    // Read `was` before storing the new one, or the card congratulates you on
    // arriving where you already are.
    if (shouldCelebrate({ rank, lastRank: was, ranks: RANKS })) {
      rankUp({ rank, held: after.backed, from: was });
      return null;
    }
    return `<b>${esc(node.code)} taken</b> — ${esc(seg?.subject.short ?? '')} now backs a
      ${seg?.backs}. Ground held: <b>${after.backed}/45</b>`;
  }

  const b = before.segments.find(s => s.subject.id === node.subjectId);
  const a = after.segments.find(s => s.subject.id === node.subjectId);
  if (a && b && a.captures < b.captures) {
    return `<b>${esc(node.code)} taken</b> — ${a.captures} more to back a ${a.aiming}
      in ${esc(a.subject.short)}`;
  }
  return null;
}

