import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import { nodesFor, topicsFor, subject as findSubject, phaseFilter, provenance } from '../syllabus.js';
import { el, panel, esc, toast, subjectColor } from '../ui/dom.js';

/** Six engine gauges plus the core. */
export function subjectGauges(ctx) {
  const { index, state } = ctx;
  const records = state.get('mastery');
  const grid = el('div', 'subs');

  for (const s of index.subjects) {
    const nodes = nodesFor(index, s.id);
    const ids = nodes.map(n => n.id);
    const pct = Math.round(mastery.subjectProgress(ids, records) * 100);
    const captured = ids.filter(id => (records[id]?.level ?? 0) > 0).length;
    const fading = mastery.rescueQueue(ids, records).length;
    const lvl = xp.levelFromXp(state.get('xp').bySubject[s.id] ?? 0).level;

    const card = el('a', 'sub');
    card.href = `#/subject/${s.id}`;
    card.style.setProperty('--c', subjectColor(s));
    card.innerHTML = `
      <div class="sub-top">
        <span class="sub-dot"></span>
        <span class="sub-name">${esc(s.short)}</span>
        ${s.level === 'CORE' ? '' : `<span class="sub-hl">${esc(s.level)}</span>`}
        <span class="sub-cs">${esc(s.callsign)} · LV${lvl}</span>
      </div>
      <div class="sub-track"><div class="sub-fill" style="width:${pct}%"></div></div>
      <div class="sub-meta">
        <span>${captured}/${ids.length} nodes${fading ? ` · <span class="sub-warn">${fading} fading</span>` : ''}</span>
        <b>${pct}%</b>
      </div>`;
    grid.append(card);
  }
  return grid;
}

export function subjectListView(mount, ctx) {
  mount.append(subjectGauges(ctx));
}

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

  const prov = provenance(index, s.id);
  if (prov) {
    const box = el('div', 'banner');
    if (prov.level === 'guide') box.classList.add('banner-ok');
    box.innerHTML = `<b>${esc(prov.label)}${prov.level === 'guide' ? '' : ' tree'}.</b>
      ${esc(prov.note)}
      ${prov.level === 'guide' ? '' : `<span style="display:block;margin-top:6px">
        Correct it in <code>data/syllabus/${esc(s.id)}.json</code> and re-run
        <code>node tools/build-syllabus.mjs</code> — no code changes needed.</span>`}`;
    mount.insertBefore(box, bar);
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
          captureNode(n, state, mastery.stateOf(rec.level, days));
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

/** Advance a node one mastery level and pay out XP. */
export function captureNode(node, state, priorState) {
  const now = Date.now();
  const streak = state.get('xp').streak.current;
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

  toast(`${esc(label)} — ${esc(node.code)} <b>+${earned} XP</b>`);
  return earned;
}
