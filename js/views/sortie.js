import * as S from '../models/sortie.js';
import * as R from '../models/recall.js';
import * as mastery from '../models/mastery.js';
import { halfLivesFor } from '../models/curve.js';
import { localDay } from '../models/streak.js';
import { boardFor } from '../board.js';
import { el, panel, esc, toast, subjectColor } from '../ui/dom.js';
import { commitSession } from './log.js';
import { onDispose } from '../ui/mcdu.js';

/**
 * Fly a sortie.
 *
 * Three screens in one: the briefing, the run, and the debrief. The run is the
 * only screen in this app with a clock that can beat you, and that is the whole
 * design — a target you did not answer in time is scored as a miss, so you have
 * to commit rather than read the title and tell yourself you knew it.
 *
 * Nothing here invents IB content. You are shown a real syllabus node and a real
 * command term from the official glossary, you produce the answer on paper or in
 * your head, and you grade yourself. That is retrieval practice; the timer and
 * the score are what make it a run instead of a checklist.
 */

let terms = null;
const loadTerms = () => terms ?? (terms = fetch('./data/command-terms.json')
  .then(r => r.json()).then(j => j.objectives ?? []).catch(() => []));

export function sortieView(mount, ctx) {
  const { index, state } = ctx;
  let stage = 'brief';
  let hand = null, run = null, tick = null, left = 0, spin = 0, glossary = [];
  let minutes = state.get('settings').sortieMinutes ?? 25;
  let pace = state.get('settings').sortiePace ?? 'budget';
  let subjectId = null;

  loadTerms().then(t => { glossary = t; if (stage === 'run') draw(); });

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '14px';
  mount.append(wrap);

  // A run left behind must not keep ticking. Closing the panel only empties the
  // body's children, so the view cannot notice its own removal — the MCDU has
  // to tell it.
  const cleanups = [];
  const stop = () => {
    if (tick) { clearInterval(tick); tick = null; }
    while (cleanups.length) cleanups.pop()();
  };
  onDispose(stop);

  /* ── the briefing ───────────────────────────────────────── */
  function drawBrief() {
    const history = state.get('runs') ?? [];
    const bestRun = S.best(history);
    const today = S.flownOn(history, localDay(), localDay);

    hand = S.deal({
      index, records: state.get('mastery'), sessions: state.get('sessions'),
      minutes, subjectId, pace, halfLives: halfLivesFor(state.get('checks')),
    });

    const p = panel('Sortie', hand.size ? `${hand.size} targets` : 'nothing to fly');
    p.insertAdjacentHTML('beforeend', `
      <p class="mfd-sub">A timed run over what you are actually forgetting. Each
        target gives you <b>${hand.seconds} seconds</b> to produce the answer cold —
        on paper, out loud, however you work. Then you grade yourself honestly.
        Run out of time and it counts as a miss.</p>`);

    const row = el('div', 'row');
    for (const m of [10, 25, 45, 60]) {
      const b = el('button', 'chip' + (m === minutes ? ' chip-primary' : ''), `${m} min`);
      b.onclick = () => {
        minutes = m;
        state.update('settings', st => { st.sortieMinutes = m; });
        draw();
      };
      row.append(b);
    }
    p.append(row);

    const paceRow = el('div', 'row');
    for (const o of S.PACES) {
      const b = el('button', 'chip' + (o.id === pace ? ' chip-primary' : ''), o.label);
      b.title = o.note;
      b.onclick = () => {
        pace = o.id;
        state.update('settings', st => { st.sortiePace = o.id; });
        draw();
      };
      paceRow.append(b);
    }
    p.append(paceRow);

    const pick = el('div', 'row');
    const all = el('button', 'chip' + (subjectId ? '' : ' chip-primary'), 'All subjects');
    all.onclick = () => { subjectId = null; draw(); };
    pick.append(all);
    for (const s of index.examined) {
      const b = el('button', 'chip' + (subjectId === s.id ? ' chip-primary' : ''), s.short);
      b.style.setProperty('--c', subjectColor(s));
      b.onclick = () => { subjectId = subjectId === s.id ? null : s.id; draw(); };
      pick.append(b);
    }
    p.append(pick);

    if (!hand.size) {
      p.append(el('p', 'empty',
        subjectId
          ? 'Nothing fading in that subject and no ground left unopened. Pick another.'
          : 'Nothing is fading and there is no unopened ground. Log a paper instead.'));
      wrap.append(p);
      return;
    }

    const launch = el('button', 'chip chip-primary sortie-launch', `Launch · ${hand.size} targets`);
    launch.onclick = () => { stage = 'run'; run = S.start(hand); spin = history.length; draw(); };
    p.append(launch);
    wrap.append(p);

    // What you are about to be asked, so launching is a decision not a surprise.
    const list = panel('The hand', `${hand.seconds}s each`);
    for (const t of hand.targets) {
      const r = el('div', 'node');
      r.style.cursor = 'default';
      r.style.setProperty('--c', subjectColor(t.subject));
      r.dataset.state = t.kind === 'lapsed' ? 'lapsed'
        : t.kind === 'fading' ? 'fading' : 'untouched';
      r.innerHTML = `<span class="node-pip"></span>
        <span class="node-code">${esc(t.subject.short)}</span>
        <span class="node-title">${esc(t.node.code)} ${esc(t.node.title)}</span>
        <span class="node-lvl">${S.KINDS[t.kind].label}</span>`;
      list.append(r);
    }
    wrap.append(list);

    const stats = panel('Your runs', `${history.length} flown`);
    stats.append(statRow([
      ['Today', `${today}`, today ? 'good' : ''],
      ['Best score', bestRun ? `${bestRun.points}` : '—'],
      ['Best grade', bestRun ? bestRun.grade : '—'],
      ['All time', `${history.length}`],
    ]));
    if (bestRun) {
      stats.insertAdjacentHTML('beforeend', `<p class="mfd-sub">
        Your best run scored <b>${bestRun.points}</b> of ${bestRun.possible} over
        ${bestRun.size} targets. Beat it.</p>`);
    }
    wrap.append(stats);
  }

  /* ── the run ────────────────────────────────────────────── */
  function drawRun() {
    stop();
    const t = S.current(run, hand);
    if (!t) { stage = 'debrief'; draw(); return; }

    const prompt = S.promptFor(t, glossary, spin);
    const p = panel(`Target ${run.at + 1} of ${run.size}`, S.KINDS[t.kind].label);
    p.style.setProperty('--c', subjectColor(t.subject));
    p.classList.add('sortie-live');

    p.insertAdjacentHTML('beforeend', `
      <div class="sortie-clock"><span class="sortie-secs">${hand.seconds}</span>
        <i class="sortie-bar"><b></b></i></div>
      <p class="sortie-sub">${esc(t.subject.name ?? t.subject.short)} ·
        ${esc(t.node.topicCode)} ${esc(t.node.topicTitle)}</p>
      <h2 class="sortie-node">${esc(t.node.code)} ${esc(t.node.title)}</h2>
      ${prompt ? `<p class="sortie-ask"><b>${esc(prompt.term)}</b> it —
        <span>${esc(prompt.ao)}</span></p>
        <p class="sortie-demand">${esc(prompt.demand)}</p>`
        : '<p class="sortie-ask"><b>Recall it cold.</b></p>'}
      <p class="mfd-sub">${esc(S.KINDS[t.kind].note)}${
        Number.isFinite(t.days) ? ` · ${Math.round(t.days)} days ago` : ''}</p>`);

    const secs = p.querySelector('.sortie-secs');
    const bar = p.querySelector('.sortie-bar b');

    // Counted against a deadline, not by counting ticks. Browsers throttle
    // setInterval hard in a background tab — a tick-counting clock simply stops
    // while you are in another tab, which hands you unlimited time and removes
    // the only pressure in the app. Reading the wall clock means throttling can
    // cost the display a redraw but never costs the run its honesty: come back
    // after two minutes on a 30-second target and it has already expired.
    const deadline = Date.now() + hand.seconds * 1000;
    const paint = () => {
      left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      secs.textContent = left;
      bar.style.width = `${(left / hand.seconds) * 100}%`;
      p.classList.toggle('urgent', left <= 10);
      return left;
    };
    paint();
    tick = setInterval(() => {
      if (paint() <= 0) { stop(); resolve('expired', t); }
    }, 250);

    // A throttled tab may not tick at all; catch up the moment it is looked at.
    const wake = () => { if (tick && paint() <= 0) { stop(); resolve('expired', t); } };
    document.addEventListener('visibilitychange', wake);
    onDispose(() => document.removeEventListener('visibilitychange', wake));
    cleanups.push(() => document.removeEventListener('visibilitychange', wake));

    const row = el('div', 'row sortie-answers');
    for (const key of ['yes', 'partly', 'no']) {
      const o = R.OUTCOMES[key];
      const b = el('button', 'chip' + (key === 'yes' ? ' chip-primary' : ''), o.label);
      b.title = o.note;
      b.onclick = () => { stop(); resolve(key, t); };
      row.append(b);
    }
    p.append(row);

    const bail = el('button', 'chip sortie-bail', 'End the run here');
    bail.onclick = () => { stop(); stage = 'debrief'; draw(); };
    p.append(bail);

    wrap.append(p);

    const done = panel('Flown so far', `${run.at} of ${run.size}`);
    done.append(statRow(tally(run)));
    wrap.append(done);
  }

  /**
   * Apply one answer. This is where a run touches the board: a hit captures the
   * node, a graze refreshes it, a miss demotes it, and every answer is recorded
   * as a recall check so the forgetting curve keeps fitting itself to you.
   */
  function resolve(outcome, t) {
    if (outcome !== 'expired') {
      state.set('checks', R.record(state.get('checks'), {
        nodeId: t.node.id, level: t.level, days: Number.isFinite(t.days) ? t.days : 0,
        outcome,
      }));
    }
    state.update('mastery', m => {
      const rec = m[t.node.id] ?? mastery.emptyRecord();
      if (outcome === 'yes') {
        m[t.node.id] = mastery.capture(rec, Date.now());
      } else if (outcome === 'partly') {
        // Held, not advanced: the decay clock resets but the level does not move.
        m[t.node.id] = { ...rec, level: Math.max(1, rec.level),
                         lastTouched: new Date().toISOString(), touches: rec.touches + 1 };
      } else {
        // A miss and an expiry both mean you could not produce it. Demote, but
        // never below Seen — you have met it, and pretending otherwise would
        // deal it back as brand new ground tomorrow.
        m[t.node.id] = { ...rec, level: Math.max(1, rec.level - 1),
                         lastTouched: new Date().toISOString(), touches: rec.touches + 1 };
      }
    });
    run = S.answer(run, outcome);
    draw();
  }

  /* ── the debrief ────────────────────────────────────────── */
  function drawDebrief() {
    stop();
    const before = boardFor(ctx);
    const s = S.score(run);
    const grade = S.gradeOf(s.ratio);
    const record = S.toRecord(run, hand);
    const history = state.get('runs') ?? [];
    const beat = S.isBest(record, [...history, record]);

    if (run.results.length) {
      state.update('runs', list => { list.push(record); });
      // A flown sortie is study time; the streak should not need a second entry.
      const spent = Math.max(1, Math.round(
        run.results.length * (hand.seconds / 60)));
      commitSession(state, {
        subjectId: hand.targets[0]?.subject.id ?? index.examined[0].id,
        minutes: spent, note: `Sortie · ${record.grade} · ${s.points}/${s.possible}`,
        source: 'sortie',
      });
    }

    const p = panel('Debrief', grade.name.toUpperCase());
    p.classList.add('sortie-debrief');
    p.insertAdjacentHTML('beforeend', `
      <div class="sortie-score">${s.points}<small>/ ${s.possible}</small></div>
      <h2 class="sortie-grade">${esc(grade.name)}</h2>
      <p class="mfd-sub">${esc(grade.note)}${beat
        ? ' <b>New best run.</b>' : ''}</p>`);
    p.append(statRow(tally(run)));
    wrap.append(p);

    const board = boardFor(ctx);
    const moved = board.backed - before.backed;
    const g = panel('What it did to the board', `${board.backed} / 45 backed`);
    g.insertAdjacentHTML('beforeend', `<p class="mfd-sub">${
      moved > 0
        ? `That run moved <b>${moved} point${moved === 1 ? '' : 's'}</b> of backing.
           Ground held: ${board.backed}/45.`
        : s.hits
          ? `No new backing this time — the ground you took was already counted.
             Held ${board.held}, backed ${board.backed}.`
          : 'Nothing moved. Everything you missed goes back in the queue for tomorrow.'
    }${board.front ? ` Next advance: <b>${esc(board.front.subject.short)}</b>,
        ${board.front.captures} captures to back a ${board.front.aiming}.` : ''}</p>`);
    wrap.append(g);

    const again = el('div', 'row');
    const b1 = el('button', 'chip chip-primary', 'Fly another');
    b1.onclick = () => { stage = 'brief'; run = null; draw(); };
    const b2 = el('button', 'chip', 'To the map');
    b2.onclick = () => { location.hash = '#/map'; };
    again.append(b1, b2);
    wrap.append(again);

    if (beat) toast(`<b>New best run</b> — ${s.points}/${s.possible}, ${grade.name}`);
  }

  function draw() {
    wrap.innerHTML = '';
    if (stage === 'brief') drawBrief();
    else if (stage === 'run') drawRun();
    else drawDebrief();
  }

  draw();
}

function tally(run) {
  const s = S.score(run);
  return [
    ['Cold', `${s.hits}`, s.hits ? 'good' : ''],
    ['Shaky', `${s.grazes}`],
    ['Lost', `${s.misses}`, s.misses ? 'hot' : ''],
    ['Timed out', `${s.expired}`, s.expired ? 'hot' : ''],
  ];
}

function statRow(pairs) {
  const box = el('div', 'stat');
  box.innerHTML = pairs.map(([label, value, tone]) =>
    `<span class="${tone ?? ''}"><b>${esc(value)}</b><i>${esc(label)}</i></span>`).join('');
  return box;
}
