import * as xp from '../models/xp.js';
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

export function commitSession(state, { subjectId, minutes, note, source }) {
  const today = xp.localDay();
  const streak = xp.updateStreak(state.get('xp').streak, today);
  const earned = xp.award('study', { minutes }, streak.current);

  state.update('sessions', list => {
    list.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      subjectId, minutes, note, source, nodeIds: [],
    });
  });

  state.update('xp', x => {
    x.total += earned;
    x.bySubject[subjectId] = (x.bySubject[subjectId] ?? 0) + earned;
    x.streak = streak;
  });

  return { earned, streak };
}

