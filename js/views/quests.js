import * as quests from '../models/quests.js';
import { nodesFor } from '../syllabus.js';
import { el, panel, esc, toast } from '../ui/dom.js';

/** Ensure today's missions exist, regenerating only on a day roll. */
export function ensureQuests(ctx) {
  const { index, state } = ctx;
  const nodesBySubject = {};
  for (const s of index.examined) nodesBySubject[s.id] = nodesFor(index, s.id);

  const next = quests.refresh(state.get('quests'), {
    subjects: index.examined,
    nodesBySubject,
    records: state.get('mastery'),
    sessions: state.get('sessions'),
  });
  if (next !== state.get('quests')) state.set('quests', next);
  return next;
}

export function questsView(mount, ctx) {
  const { state } = ctx;
  const wrap = el('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '16px';
  mount.append(wrap);

  function draw() {
    const q = ensureQuests(ctx);
    const evalCtx = { sessions: state.get('sessions'), records: state.get('mastery') };
    wrap.innerHTML = '';

    const head = panel('Mission board', q.date);
    const done = [...q.daily, ...q.weekly].filter(x => quests.isComplete(x, evalCtx)).length;
    const unclaimed = [...q.daily, ...q.weekly]
      .filter(x => quests.isComplete(x, evalCtx) && !x.claimed).length;
    head.insertAdjacentHTML('beforeend', `
      <div class="mfd-big" style="color:var(--panel-text)">${done}<small>/ ${
        q.daily.length + q.weekly.length} complete</small></div>
      <p class="mfd-sub">${unclaimed
        ? `${unclaimed} done and not yet ticked off.`
        : 'Missions refresh at midnight, seeded by the date — they never reroll.'}
        They carry no points: what they are worth is the ground they make you take.</p>`);
    wrap.append(head);

    wrap.append(board('Today', q.daily, evalCtx, draw, state));
    wrap.append(board('This week', q.weekly, evalCtx, draw, state));
  }

  draw();
}

function board(title, list, evalCtx, redraw, state) {
  const p = panel(title, `${list.filter(q => quests.isComplete(q, evalCtx)).length}/${list.length}`);

  for (const q of list) {
    const progress = quests.progressOf(q, evalCtx);
    const complete = progress >= q.target;
    const pct = Math.min(100, (progress / q.target) * 100);

    const row = el('div', `quest${complete ? ' done' : ''}`);
    row.style.cursor = complete && !q.claimed ? 'pointer' : 'default';
    row.innerHTML = `
      <span class="qbox">${complete ? '✓' : ''}</span>
      <span class="qt">${esc(q.label)}
        <span style="display:block;margin-top:6px">
          <span class="sub-track" style="display:block;max-width:220px">
            <span class="sub-fill" style="--c:var(--accent);background:var(--accent);width:${pct}%"></span>
          </span>
        </span>
      </span>
      <span class="qxp">${q.claimed ? 'DONE' : complete ? 'TICK OFF' : ''}</span>`;

    if (complete && !q.claimed) {
      row.onclick = () => {

        state.update('quests', v => {
          for (const bucket of ['daily', 'weekly']) {
            const hit = v[bucket].find(z => z.id === q.id);
            if (hit) hit.claimed = true;
          }
        });
        toast('<b>Mission complete</b>');
        redraw();
      };
    }
    p.append(row);
  }

  if (!list.length) p.append(el('p', 'empty', 'No missions.'));
  return p;
}
