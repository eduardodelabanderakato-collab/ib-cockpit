/**
 * The playbook.
 *
 * What a 45 actually requires, encoded as principles rather than a to-do list.
 * Every daily objective comes from one of these and carries its reasoning, so
 * the plan can always answer "why this, today".
 *
 * The principles are drawn from how top IB results are actually produced, not
 * from what feels productive:
 *
 *  · Retrieval beats review. Testing yourself is the highest-yield revision
 *    activity there is; rereading feels effective and mostly is not.
 *  · The gap between 40 and 45 is almost never your best subject. It is the
 *    weakest one, and the one you have quietly stopped opening.
 *  · Coursework is the part of the grade you fully control, worth 20–30% per
 *    subject, and it is graded on work done months before the exam.
 *  · Interleaving — mixing subjects in a session — produces better retention
 *    than blocking, and feels worse while you do it.
 *  · Past papers under timed conditions are the single highest-yield DP2
 *    activity, because marks are awarded for exam technique, not knowledge.
 *  · Errors are the cheapest marks available. A question you got wrong once
 *    and never revisited is a mark you will lose again.
 */

const DAY = 86400000;

export const PRINCIPLES = {
  retrieval: {
    name: 'Retrieval before review',
    why: 'Testing yourself is the highest-yield revision there is. Rereading feels productive and mostly is not.',
  },
  weakest: {
    name: 'Protect the weakest subject',
    why: 'The gap between 40 and 45 is almost never your best subject.',
  },
  noCold: {
    name: 'No subject goes cold',
    why: 'Six subjects all count. A subject you stop opening is the one that costs you the points.',
  },
  interleave: {
    name: 'Interleave',
    why: 'Mixing subjects in one session retains better than blocking, even though it feels worse.',
  },
  coursework: {
    name: 'Coursework early',
    why: 'IAs and the EE are 20–30% of the grade and the part you fully control. Late coursework is where points quietly disappear.',
  },
  pastPapers: {
    name: 'Past papers, timed',
    why: 'Marks are awarded for exam technique as much as knowledge. Untimed practice does not build it.',
  },
  errors: {
    name: 'Fix what you got wrong',
    why: 'A question you got wrong once and never revisited is a mark you will lose again.',
  },
  consistency: {
    name: 'Show up daily',
    why: 'Contact every day beats the same hours in two sittings. The curve rewards frequency.',
  },
};

/** Where you are in the two-year arc. Priorities differ sharply by phase. */
export function phaseOf({ dpStart, examStart, now = Date.now() }) {
  const a = Date.parse(dpStart.length === 7 ? dpStart + '-01' : dpStart);
  const b = Date.parse(examStart);
  const through = (now - a) / (b - a);
  const daysLeft = Math.ceil((b - now) / DAY);
  if (daysLeft <= 60) return { phase: 'finals', through, daysLeft };
  if (through >= 0.55) return { phase: 'dp2', through, daysLeft };
  return { phase: 'dp1', through, daysLeft };
}

/**
 * How each phase weights the principles. In DP1 coverage and coursework carry
 * the day; by DP2 retrieval and timed papers dominate.
 */
export const WEIGHTS = {
  dp1:    { retrieval: 1.0, coursework: 1.4, pastPapers: 0.3, errors: 0.8, noCold: 1.2, weakest: 1.0 },
  dp2:    { retrieval: 1.5, coursework: 1.2, pastPapers: 1.4, errors: 1.3, noCold: 1.1, weakest: 1.3 },
  finals: { retrieval: 1.8, coursework: 0.4, pastPapers: 1.8, errors: 1.6, noCold: 1.0, weakest: 1.5 },
};

/** Days since each subject was last touched, by session or capture. */
export function contact({ subjects, nodesBySubject, records, sessions, now = Date.now() }) {
  return subjects.map(s => {
    let latest = 0;
    for (const v of sessions) {
      if (v.subjectId === s.id) latest = Math.max(latest, Date.parse(v.ts));
    }
    for (const n of nodesBySubject[s.id] ?? []) {
      const t = records[n.id]?.lastTouched;
      if (t) latest = Math.max(latest, Date.parse(t));
    }
    return { subject: s, days: latest ? (now - latest) / DAY : Infinity, ever: !!latest };
  }).sort((a, b) => b.days - a.days);
}

/**
 * Minutes each subject should get this week. Six subjects and roughly 12 study
 * hours a week means no subject can honestly take less than about 90 minutes.
 */
export function weeklyTarget(subjectCount, weeklyHours = 12) {
  return Math.round((weeklyHours * 60) / subjectCount);
}

export function weekMinutes({ subjects, sessions, now = Date.now() }) {
  const cutoff = now - 7 * DAY;
  const out = {};
  for (const s of subjects) out[s.id] = 0;
  for (const v of sessions) {
    if (Date.parse(v.ts) >= cutoff && out[v.subjectId] !== undefined) {
      out[v.subjectId] += v.minutes;
    }
  }
  return out;
}

/** Subjects under their weekly share, furthest behind first. */
export function underServed({ subjects, sessions, weeklyHours = 12, now = Date.now() }) {
  const target = weeklyTarget(subjects.length, weeklyHours);
  const mins = weekMinutes({ subjects, sessions, now });
  return subjects
    .map(s => ({ subject: s, minutes: mins[s.id], target, deficit: target - mins[s.id] }))
    .filter(x => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);
}

/**
 * Assessments scored below the target grade and not revisited since. These are
 * the cheapest marks on the table.
 */
export function unfixedErrors({ grades, sessions, targetGrade = 6, gradeFor, now = Date.now() }) {
  return grades
    .map(g => ({ g, grade: g.reported ?? gradeFor(g.pct ?? (g.raw / g.max) * 100) }))
    .filter(x => x.grade < targetGrade)
    .filter(x => !sessions.some(s =>
      s.subjectId === x.g.subjectId && Date.parse(s.ts) > Date.parse(x.g.ts)
      && /fix|correct|redo|review|mistake|error/i.test(s.note ?? '')))
    .sort((a, b) => a.grade - b.grade || Date.parse(b.g.ts) - Date.parse(a.g.ts));
}

/** How many distinct subjects today has touched — interleaving, measured. */
export function spreadToday({ sessions, today, localDay }) {
  const seen = new Set();
  for (const s of sessions) if (localDay(new Date(s.ts)) === today) seen.add(s.subjectId);
  return seen.size;
}

/** The one sentence explaining why today looks like this. */
export function rationale(phase, top) {
  const p = PRINCIPLES[top] ?? PRINCIPLES.consistency;
  const stage = phase === 'finals' ? 'With exams close'
    : phase === 'dp2' ? 'In DP2' : 'In DP1';
  return `${stage}, ${p.name.toLowerCase()}. ${p.why}`;
}
