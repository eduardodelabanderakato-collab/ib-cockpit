import * as mastery from './mastery.js';
import * as quests from './quests.js';
import { rank } from './recommend.js';
import { localDay } from './streak.js';
import * as pb from './playbook.js';
import { gradeFor } from './grades.js';

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

/**
 * Weights are ordered so retrieval leads whenever there is anything to
 * retrieve. Testing yourself is the highest-yield activity available, so it
 * outranks opening new ground — but a subject that has gone cold still sits
 * well above generic study, because six subjects all count.
 */
export const KINDS = {
  deadline:   { label: 'Deadline',   weight: 100, principle: 'coursework' },
  recall:     { label: 'Recall',     weight: 95,  principle: 'retrieval' },
  errors:     { label: 'Fix errors', weight: 74,  principle: 'errors' },
  coursework: { label: 'Coursework', weight: 70,  principle: 'coursework' },
  cold:       { label: 'Cold',       weight: 58,  principle: 'noCold' },
  papers:     { label: 'Past paper', weight: 62,  principle: 'pastPapers' },
  quest:      { label: 'Mission',    weight: 60,  principle: 'consistency' },
  study:      { label: 'Study',      weight: 40,  principle: 'weakest' },
  streak:     { label: 'Streak',     weight: 20,  principle: 'consistency' },
};

/**
 * @returns {{items:Array, headline:string, detail:string, minutes:number,
 *            loggedToday:number, done:boolean}}
 */
export function brief({
  index, records = {}, sessions = [], deadlines = [], questState = {},
  checks = [], grades = [], halfLives, expected = 0, budget = 60,
  weeklyHours = 12, targetGrade = 6, now = Date.now(),
}) {
  const items = [];
  const today = localDay(new Date(now));
  const subjects = index.examined;
  const nodesBySubject = {};
  for (const s of index.subjects) nodesBySubject[s.id] = nodesFor(index, s.id);

  const loggedToday = sessions
    .filter(s => localDay(new Date(s.ts)) === today)
    .reduce((a, s) => a + s.minutes, 0);

  // Priorities differ sharply across the two-year arc.
  const { phase, daysLeft } = pb.phaseOf({
    dpStart: index.dpStart, examStart: index.examStart, now });
  const W = pb.WEIGHTS[phase];
  const push = (kind, o) => items.push({
    kind, principle: KINDS[kind].principle,
    why: pb.PRINCIPLES[KINDS[kind].principle].why,
    urgency: KINDS[kind].weight * (W[KINDS[kind].principle] ?? 1), ...o,
  });

  // ── 1 · dated things, soonest first ─────────────────────
  for (const d of deadlines) {
    if (d.status === 'done') continue;
    const days = Math.ceil((Date.parse(d.due) - now) / DAY);
    if (days > 7) continue;
    const s = d.subjectId ? index.subjects.find(v => v.id === d.subjectId) : null;
    push('deadline', {
      urgency: KINDS.deadline.weight * W.coursework + (7 - Math.max(0, days)) * 5,
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
    // Points at the sortie, not the static list. The list lets you read a title
    // and tell yourself you knew it; the run puts a clock on it.
    push('recall', {
      urgency: KINDS.recall.weight * W.retrieval + Math.min(20, fading.length * 2),
      title: `Fly a sortie · ${fading.length} target${fading.length === 1 ? '' : 's'}`,
      detail: `Worst: ${worst.code} ${worst.title}, ${Math.round(fading[0].days)} days cold`,
      subject: index.subjects.find(v => v.id === worst.subjectId),
      minutes: Math.min(25, 4 + fading.length * 2),
      href: '#/fly',
    });
  }

  // ── 3 · missions still open ─────────────────────────────
  const open = [...(questState.daily ?? []), ...(questState.weekly ?? [])]
    .filter(q => !quests.isComplete(q, { sessions, records, now }));
  if (open.length) {
    push('quest', {
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
    push('study', {
      urgency: KINDS.study.weight * W.weakest + p.score,
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
    push('streak', {
      urgency: KINDS.streak.weight,
      title: 'Log anything today',
      detail: 'Fifteen minutes keeps the streak and the pace honest',
      minutes: 15,
      href: '#/log',
    });
  }

  // ── errors you have never gone back and fixed ───────────
  const unfixed = pb.unfixedErrors({ grades, sessions, targetGrade, gradeFor, now });
  if (unfixed.length) {
    const worst = unfixed[0];
    const s = index.subjects.find(v => v.id === worst.g.subjectId);
    push('errors', {
      urgency: KINDS.errors.weight * W.errors + (targetGrade - worst.grade) * 6,
      title: `Fix ${s?.short ?? worst.g.subjectId} · ${worst.g.paper}`,
      detail: `Scored ${worst.grade}/7 and never revisited. ${unfixed.length} unfixed in total.`,
      subject: s, minutes: 20, href: '#/proj',
    });
  }

  // ── a subject that has gone cold ────────────────────────
  const cold = pb.contact({ subjects, nodesBySubject, records, sessions, now })[0];
  if (cold && cold.days >= 7) {
    push('cold', {
      urgency: KINDS.cold.weight * W.noCold + Math.min(18, cold.days),
      title: `${cold.subject.short} has gone cold`,
      detail: cold.ever
        ? `${Math.round(cold.days)} days untouched`
        : 'Never opened',
      subject: cold.subject, minutes: 25, href: `#/subject:${cold.subject.id}`,
    });
  }

  // ── timed practice, once it is the thing that matters ────
  if (phase !== 'dp1') {
    const behind = pb.underServed({ subjects, sessions, weeklyHours, now })[0];
    const s = behind?.subject ?? subjects[0];
    push('papers', {
      urgency: KINDS.papers.weight * W.pastPapers,
      title: `Timed past paper · ${s.short}`,
      detail: daysLeft <= 60
        ? `${daysLeft} days out. Full paper, clock running, markscheme after.`
        : 'One question under exam timing beats an hour of notes.',
      subject: s, minutes: 45, href: '#/lib',
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

  const spread = pb.spreadToday({ sessions, today, localDay });
  return {
    items: planned,
    all: items,
    minutes: spent,
    loggedToday,
    phase,
    daysLeft,
    spread,
    rationale: planned.length
      ? pb.rationale(phase, planned[0].principle)
      : pb.rationale(phase, 'consistency'),
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
