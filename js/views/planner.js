import * as recommend from '../models/recommend.js';
import { courseElapsed } from '../ui/pfd.js';
import { nodesFor } from '../syllabus.js';
import { el, panel, esc, subjectColor } from '../ui/dom.js';

/** What to study right now, ranked and explained. */
export function plannerView(mount, ctx) {
  const { index, state } = ctx;

  const nodesBySubject = {};
  for (const s of index.subjects) nodesBySubject[s.id] = nodesFor(index, s.id);

  const args = () => ({
    subjects: index.examined,
    nodesBySubject,
    records: state.get('mastery'),
    sessions: state.get('sessions'),
    deadlines: state.get('deadlines'),
    expected: courseElapsed(index.dpStart, index.examStart),
    phase: state.get('settings').phase ?? null,
  });

  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '16px';

  const bar = el('div', 'row');
  let minutes = 60;
  const buttons = [];
  for (const m of [30, 60, 90, 120]) {
    const b = el('button', 'chip', `${m} min`);
    b.setAttribute('aria-pressed', String(m === minutes));
    b.onclick = () => {
      minutes = m;
      buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    };
    buttons.push(b);
    bar.append(b);
  }

  mount.append(bar, wrap);

  function draw() {
    wrap.innerHTML = '';

    const plan = recommend.sessionPlan(args(), minutes);
    const p = panel('This session', `${minutes} min`);
    if (!plan.length) {
      p.append(el('p', 'empty', 'Nothing to recommend yet.'));
    }
    for (const item of plan) {
      const r = el('a', 'node');
      r.href = `#/subject/${item.subject.id}`;
      r.style.textDecoration = 'none';
      r.style.setProperty('--c', subjectColor(item.subject));
      r.dataset.state = 'fading';
      r.innerHTML = `
        <span class="node-pip"></span>
        <span class="node-code">${item.minutes}m</span>
        <span class="node-title"><b>${esc(item.subject.short)}</b> · ${esc(item.node.code)}
          ${esc(item.node.title)}
          <span style="display:block;color:var(--panel-dim);font-size:11.5px;margin-top:2px">
            ${esc(item.reason)}</span></span>
        <span class="node-lvl">go</span>`;
      p.append(r);
    }
    wrap.append(p);

    const ranked = recommend.rank({ ...args(), limit: 15 });
    const q = panel('Full ranking', 'decay × deadline × weakness × neglect × pacing');
    for (const item of ranked) {
      const r = el('a', 'node');
      r.href = `#/subject/${item.subject.id}`;
      r.style.textDecoration = 'none';
      r.style.setProperty('--c', subjectColor(item.subject));
      r.dataset.state = 'dimming';
      r.title = Object.entries(item.terms)
        .map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  ·  ');
      r.innerHTML = `
        <span class="node-pip"></span>
        <span class="node-code">${item.score.toFixed(2)}</span>
        <span class="node-title">${esc(item.subject.short)} · ${esc(item.node.code)}
          ${esc(item.node.title)}</span>
        <span class="node-lvl">${esc(item.reason)}</span>`;
      q.append(r);
    }
    wrap.append(q);
  }

  draw();
}
