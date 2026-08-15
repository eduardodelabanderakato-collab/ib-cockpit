import * as streak from '../models/streak.js';
import { el, panel, esc, toast, subjectColor, heatmap } from '../ui/dom.js';

const pad = n => String(n).padStart(2, '0');

function subjectPicker(index, cls = 'chip field') {
  const sel = el('select', cls);
  for (const s of index.subjects) {
    const o = el('option', null, s.level === 'CORE' ? s.short : `${s.short} ${s.level}`);
    o.value = s.id;
    sel.append(o);
  }
  return sel;
}

/**
 * Record a study session.
 *
 * It used to pay XP as well. It does not any more — logging that you sat down
 * is a fact about your day, not a score, and the only score here is the road.
 * The streak is the one thing a session legitimately moves.
 */
export function commitSession(state, { subjectId, minutes, note, source }) {
  const next = streak.updateStreak(state.get('streak'), streak.localDay());

  state.update('sessions', list => {
    list.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      subjectId, minutes, note, source, nodeIds: [],
    });
  });
  state.set('streak', next);

  return { streak: next };
}

