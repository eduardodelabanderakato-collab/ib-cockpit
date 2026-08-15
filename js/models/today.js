import * as mastery from './mastery.js';
import * as quests from './quests.js';
import { rank } from './recommend.js';
import { localDay } from './xp.js';

/**
 * Today.
 *
 * Every other screen answers "how am I doing". This one answers the only
 * question that changes behaviour: what do I do right now, and for how long.
 *
 * Items are ordered by consequence, not by category — a paper due tomorrow
 * outranks a fading topic, which outranks opening new ground. Nothing is
 * padded: if there is genuinely little to do, it says so.
 */

const DAY = 86400000;

export const KINDS = {
  deadline: { label: 'Deadline', weight: 100 },
  recall:   { label: 'Recall',   weight: 80 },
  quest:    { label: 'Mission',  weight: 60 },
  study:    { label: 'Study',    weight: 40 },
  streak:   { label: 'Streak',   weight: 20 },
};

/**
 * @returns {{items:Array, headline:string, detail:string, minutes:number,
 *            loggedToday:number, done:boolean}}
 */
export function brief({
  index, records = {}, sessions = [], deadlines = [], questState = {},
  checks = [], halfLives, expected = 0, budget = 60, now = Date.now(),
}) {
  const items = [];
  const today = localDay(new Date(now));
  const subjects = index.examined;
  const nodesBySubject = {};
  for (const s of index.subjects) nodesBySubject[s.id] = nodesFor(index, s.id);

  const loggedToday = sessions
    .filter(s => localDay(new Date(s.ts)) === today)
    .reduce((a, s) => a + s.minutes, 0);

  // ── 1 · dated things, soonest first ─────────────────────
  for (const d of deadlines) {
    if (d.status === 'done') continue;
    const days = Math.ceil((Date.parse(d.due) - now) / DAY);
    if (days > 7) continue;
    const s = d.subjectId ? index.subjects.find(v => v.id === d.subjectId) : null;
    items.push({
      kind: 'deadline',
      urgency: KINDS.deadline.weight + (7 - Math.max(0, days)) * 5,
      title: d.title,
      detail: days < 0 ? `${Math.abs(days)} days overdue`
            : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
      subject: s,
      minutes: days <= 1 ? 45 : 30,
      href: '#/fpln',
      critical: days <= 1,
    });
  }

  // ── 2 · what you are actively forgetting ────────────────
  const ids = subjects.flatMap(s => nodesBySubject[s.id].map(n => n.id));
  const fading = mastery.rescueQueue(ids, records, now, halfLives);
  if (fading.length) {
    const worst = index.byId.get(fading[0].id);
    items.push({
      kind: 'recall',
      urgency: KINDS.recall.weight + Math.min(20, fading.length * 2),
      title: `${fading.length} recall check${fading.length === 1 ? '' : 's'}`,
      detail: `Worst: ${worst.code} ${worst.title}, ${Math.round(fading[0].days)} days cold`,
      subject: index.subjects.find(v => v.id === worst.subjectId),
      minutes: Math.min(25, 4 + fading.length * 2),
      href: '#/fade',
    });
  }

  // ── 3 · missions still open ─────────────────────────────
  const open = [...(questState.daily ?? []), ...(questState.weekly ?? [])]
    .filter(q => !quests.isComplete(q, { sessions, records, now }));
  if (open.length) {
    items.push({
      kind: 'quest',
      urgency: KINDS.quest.weight + open.length,
      title: `${open.length} mission${open.length === 1 ? '' : 's'} open`,
      detail: open.slice(0, 2).map(q => q.label).join(' · '),
      minutes: 0,
      href: '#/quests',
    });
  }

  // ── 4 · what to actually study ──────────────────────────
  const picks = rank({
    subjects, nodesBySubject, records, sessions, deadlines,
    expected, now, limit: 12,
  });
  const used = new Set();
  for (const p of picks) {
    if (used.has(p.subject.id)) continue;
    used.add(p.subject.id);
    items.push({
      kind: 'study',
      urgency: KINDS.study.weight + p.score,
      title: `${p.subject.short} · ${p.node.code} ${p.node.title}`,
      detail: p.reason,
      subject: p.subject,
      minutes: 25,
      href: `#/subject:${p.subject.id}`,
    });
    if (used.size >= 3) break;
  }

  // ── 5 · the cheapest win, if nothing has been logged ─────
  if (!loggedToday) {
    items.push({
      kind: 'streak',
      urgency: KINDS.streak.weight,
      title: 'Log anything today',
      detail: 'Fifteen minutes keeps the streak and the pace honest',
      minutes: 15,
      href: '#/log',
    });
  }

  items.sort((a, b) => b.urgency - a.urgency);

  // Fit to the time you actually have, but never drop a critical deadline.
  const planned = [];
  let spent = 0;
  for (const it of items) {
    if (it.critical || it.minutes === 0 || spent + it.minutes <= budget) {
      planned.push(it);
      spent += it.minutes;
    }
  }

  return {
    items: planned,
    all: items,
    minutes: spent,
    loggedToday,
    done: planned.length === 0,
    ...summarise(planned, loggedToday, budget),
  };
}

function summarise(items, loggedToday, budget) {
  if (!items.length) {
    return {
      headline: loggedToday ? 'Nothing left today' : 'Nothing urgent',
      detail: loggedToday
        ? `${loggedToday} minutes logged. Everything is fresh and nothing is due.`
        : 'Nothing is fading and nothing is due. Open a subject and take new ground.',
    };
  }
  const critical = items.find(i => i.critical);
  if (critical) {
    return { headline: critical.title, detail: critical.detail };
  }
  const first = items[0];
  return {
    headline: first.title,
    detail: `${items.length} thing${items.length === 1 ? '' : 's'} · about ${
      items.reduce((a, i) => a + i.minutes, 0)} min of ${budget}`,
  };
}

/** Local copy so this module does not depend on the syllabus index shape. */
function nodesFor(index, subjectId) {
  return index.bySubject?.get(subjectId)?.nodes ?? [];
}
