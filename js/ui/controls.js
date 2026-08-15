/**
 * The control inventory.
 *
 * One control per function, the way a real panel is built — not a dozen
 * navigation links. Pressing any control opens the MCDU panel over the lower
 * deck; nothing ever navigates away from the cockpit.
 *
 * kind: 'read'   — opens a readout
 *       'entry'  — opens a data-entry box you type into
 *       'engine' — a subject
 *       'sys'    — a system page
 */
export const CONTROLS = [
  // ── DATA ENTRY ─────────────────────────────────────────────
  { id: 'log',    code: 'LOG',   name: 'Log study',    group: 'Data entry', kind: 'entry',
    tip: 'Record a study session — subject, minutes, what you learned' },
  { id: 'timer',  code: 'TIMER', name: 'Focus timer',  group: 'Data entry', kind: 'entry',
    tip: 'Start the clock now and log the minutes automatically when you stop' },
  { id: 'score',  code: 'SCORE', name: 'Add score',    group: 'Data entry', kind: 'entry',
    tip: 'Log a test or mock — raw mark, maximum, which paper' },
  { id: 'due',    code: 'DUE',   name: 'Add deadline', group: 'Data entry', kind: 'entry',
    tip: 'Add an assignment, IA milestone or test date' },
  { id: 'note',   code: 'NOTE',  name: 'Quick note',   group: 'Data entry', kind: 'entry',
    tip: 'Write a note against any syllabus topic' },
  { id: 'book',   code: 'BOOK',  name: 'Notebook',     group: 'Data entry', kind: 'entry',
    tip: 'Everything you have written, searchable and in one place' },
  { id: 'today',  code: 'TODAY', name: 'Today',        group: 'Data entry', kind: 'read',
    tip: 'Exactly what to do today, in order, with times' },

  // ── READOUTS ───────────────────────────────────────────────
  { id: 'heat',   code: 'HEAT',  name: 'Heat map',      group: 'Readouts', kind: 'read',
    tip: 'Every study day for the last 45 weeks, and your streak' },
  { id: 'avg',    code: 'AVG',   name: 'Grade average', group: 'Readouts', kind: 'read',
    tip: 'Predicted grade per subject and your running average out of 7' },
  { id: 'proj',   code: 'PROJ',  name: 'Projection',    group: 'Readouts', kind: 'read',
    tip: 'Your projected total out of 45 against your target' },
  { id: 'tests',  code: 'TEST',  name: 'Next tests',    group: 'Readouts', kind: 'read',
    tip: 'Every test and mock ahead of you, soonest first' },
  { id: 'assign', code: 'ASGN',  name: 'Next assignments', group: 'Readouts', kind: 'read',
    tip: 'IAs, essays and coursework with days remaining' },
  { id: 'fade',   code: 'FADE',  name: 'Fading topics', group: 'Readouts', kind: 'read',
    tip: 'What you are forgetting right now, worst first' },
  { id: 'xp',     code: 'XP',    name: 'Level and XP',  group: 'Readouts', kind: 'read',
    tip: 'Your level, XP to the next one, and XP per subject' },
  { id: 'pace',   code: 'PACE',  name: 'Pace',          group: 'Readouts', kind: 'read',
    tip: 'Syllabus captured against where the calendar says you should be' },
  { id: 'terms',  code: 'TERMS', name: 'Command terms', group: 'Readouts', kind: 'read',
    tip: 'What a question is actually asking for, by assessment objective' },

  // ── ENGINES (subjects) ─────────────────────────────────────
  // Filled in at runtime from the subject registry.

  // ── SYSTEMS ────────────────────────────────────────────────
  { id: 'hud',    code: 'HUD',   name: 'Windshield',  group: 'Systems', kind: 'sys',
    tip: 'Choose what is projected onto the glass, and add your own lines' },
  { id: 'map',    code: 'MAP',   name: 'Territory',   group: 'Systems', kind: 'sys',
    tip: 'The whole IB as terrain you capture, subject by subject' },
  { id: 'quests', code: 'QST',   name: 'Missions',    group: 'Systems', kind: 'sys',
    tip: 'Today’s quests and this week’s objectives, worth XP' },
  { id: 'plan',   code: 'PLAN',  name: 'Planner',     group: 'Systems', kind: 'sys',
    tip: 'What to study right now, ranked and explained' },
  { id: 'fpln',   code: 'FPLN',  name: 'Flight plan', group: 'Systems', kind: 'sys',
    tip: 'Every dated commitment as a sequence of waypoints' },
  { id: 'crew',   code: 'CREW',  name: 'Crew',        group: 'Systems', kind: 'sys',
    tip: 'Eight subject specialists and their one-click context briefs' },
  { id: 'lib',    code: 'LIB',   name: 'Resources',   group: 'Systems', kind: 'sys',
    tip: 'Revision Village, past papers and your own links' },
  { id: 'cfg',    code: 'CFG',   name: 'Settings',    group: 'Systems', kind: 'sys',
    tip: 'Themes, target score, passcode and backup' },
  { id: 'bkup',   code: 'BKUP',  name: 'Backup',      group: 'Systems', kind: 'sys',
    tip: 'Export everything to a file, or restore from one' },
];

/** Subjects become engine controls, so the panel shows all of them at once. */
export function engineControls(index) {
  return index.subjects.map(s => ({
    id: `subject:${s.id}`,
    code: s.callsign,
    name: s.short,
    group: 'Engines',
    kind: 'engine',
    subject: s,
    tip: `${s.name}${s.level !== 'CORE' ? ` ${s.level}` : ''} — syllabus, capture and notes`,
  }));
}

export const GROUP_ORDER = ['Data entry', 'Readouts', 'Engines', 'Systems'];

export function allControls(index) {
  return [...CONTROLS, ...engineControls(index)];
}

export function byId(index, id) {
  return allControls(index).find(c => c.id === id) ?? null;
}

export function grouped(index) {
  const all = allControls(index);
  return GROUP_ORDER.map(g => ({ group: g, controls: all.filter(c => c.group === g) }))
    .filter(g => g.controls.length);
}
