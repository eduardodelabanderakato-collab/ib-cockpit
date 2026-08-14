import * as mastery from '../models/mastery.js';
import * as quests from '../models/quests.js';
import { examinedNodeIds } from '../syllabus.js';

/**
 * The switch bank.
 *
 * Every destination in the app is a labelled cockpit switch, grouped the way a
 * real overhead panel is: flight, mission, performance, support. Each carries a
 * short code, a plain-English name, a hover tooltip saying where it goes, and an
 * LED that lights when that system has something waiting for you.
 */
export const BANKS = [
  {
    group: 'Flight',
    switches: [
      { code: 'CMD', name: 'Command',   href: '#/',          tip: 'The flight deck — sky, HUD, annunciators and today’s state' },
      { code: 'NAV', name: 'Territory', href: '#/territory', tip: 'The whole IB as a map you capture, subject by subject' },
      { code: 'ENG', name: 'Subjects',  href: '#/subjects',  tip: 'All six subjects and the core, with every syllabus node' },
    ],
  },
  {
    group: 'Mission',
    switches: [
      { code: 'MSN', name: 'Quests',    href: '#/quests',    tip: 'Today’s missions and this week’s objectives, worth XP' },
      { code: 'FPL', name: 'Deadlines', href: '#/deadlines', tip: 'IAs, EE milestones, TOK and tests as a flight plan' },
      { code: 'TOK', name: 'Core',      href: '#/subject/core', tip: 'Theory of Knowledge, Extended Essay and CAS' },
    ],
  },
  {
    group: 'Performance',
    switches: [
      { code: 'PRF', name: 'Grades',    href: '#/grades',    tip: 'Every test logged, predicted grades and your projection out of 45' },
      { code: 'REC', name: 'Log',       href: '#/log',       tip: 'Focus timer, manual entry, heatmap and session history' },
      { code: 'PLN', name: 'Planner',   href: '#/planner',   tip: 'What to study right now, and why — ranked by the recommender' },
    ],
  },
  {
    group: 'Support',
    switches: [
      { code: 'COM', name: 'Crew',      href: '#/crew',      tip: 'Your eight subject specialists and their one-click context briefs' },
      { code: 'LIB', name: 'Resources', href: '#/resources', tip: 'Revision Village, past papers, your own links' },
      { code: 'CFG', name: 'Settings',  href: '#/settings',  tip: 'Themes, target score, backup and restore, passcode' },
    ],
  },
];

const DAY = 86400000;

/**
 * Which switches should have a lit LED, and why.
 * @returns {Map<string,{level:string, note:string}>} keyed by switch code
 */
export function switchStatus({ index, state, now = Date.now() }) {
  const out = new Map();
  const records = state.get('mastery');
  const sessions = state.get('sessions');
  const deadlines = state.get('deadlines');
  const ids = examinedNodeIds(index);

  const fading = mastery.rescueQueue(ids, records, now);
  if (fading.length) {
    out.set('NAV', { level: 'caution', note: `${fading.length} fading` });
    out.set('ENG', { level: 'caution', note: `${fading.length} fading` });
  }

  const q = state.get('quests');
  const open = [...(q.daily ?? []), ...(q.weekly ?? [])]
    .filter(x => !quests.isComplete(x, { sessions, records, now }));
  if (open.length) out.set('MSN', { level: 'advisory', note: `${open.length} open` });

  const soon = deadlines.filter(d => d.status !== 'done'
    && (Date.parse(d.due) - now) / DAY <= 14);
  if (soon.length) {
    const overdue = soon.some(d => Date.parse(d.due) < now);
    out.set('FPL', { level: overdue ? 'warning' : 'caution', note: `${soon.length} due` });
  }

  if (!state.get('grades').length) out.set('PRF', { level: 'advisory', note: 'no scores yet' });

  const last = sessions.at(-1);
  if (!last || (now - Date.parse(last.ts)) / DAY >= 1) {
    out.set('REC', { level: 'advisory', note: 'nothing logged today' });
  }

  const backup = state.get('settings').backupLastAt;
  if (!backup || (now - Date.parse(backup)) / DAY > 7) {
    out.set('CFG', { level: 'caution', note: 'backup overdue' });
  }

  return out;
}

export function currentPath() {
  return (location.hash.replace(/^#/, '') || '/');
}
