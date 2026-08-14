import * as mastery from './mastery.js';
import { localDay } from './xp.js';

/**
 * Daily and weekly missions.
 *
 * Generated once per local day from a date-derived seed, so they never reroll
 * when you refresh, and weighted toward whatever is actually urgent — cold
 * subjects and fading topics get picked first. The game and the grades pull in
 * the same direction rather than competing.
 */

const DAY = 86400000;

/** Stable 32-bit seed from a YYYY-MM-DD string. */
export function seedFor(dateStr) {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function prng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export const TEMPLATES = {
  study:   { xp: 300, verb: 'Log' },
  capture: { xp: 150, verb: 'Capture' },
  rescue:  { xp: 200, verb: 'Rescue' },
  visit:   { xp: 120, verb: 'Open' },
  spread:  { xp: 260, verb: 'Touch' },
};

/**
 * @returns {{date:string, seed:number, daily:Array, weekly:Array}}
 */
export function generate({ date = localDay(), subjects, nodesBySubject, records = {},
                           sessions = [], now = Date.now() }) {
  const seed = seedFor(date);
  const r = prng(seed);

  // Rank subjects by neglect so quests point at what actually needs work.
  const ranked = subjects.map(s => {
    const nodes = nodesBySubject[s.id] ?? [];
    let latest = 0;
    for (const v of sessions) if (v.subjectId === s.id) latest = Math.max(latest, Date.parse(v.ts));
    for (const n of nodes) {
      const t = records[n.id]?.lastTouched;
      if (t) latest = Math.max(latest, Date.parse(t));
    }
    const coldDays = latest ? (now - latest) / DAY : 999;
    const fading = mastery.rescueQueue(nodes.map(n => n.id), records, now).length;
    return { s, coldDays, fading, nodes };
  }).sort((a, b) => (b.coldDays + b.fading * 3) - (a.coldDays + a.fading * 3));

  const totalFading = ranked.reduce((a, x) => a + x.fading, 0);
  const daily = [];

  // 1. Always a time quest, aimed at the coldest subject.
  const cold = ranked[0];
  daily.push(mk('study', {
    subjectId: cold.s.id,
    target: [30, 45, 60][Math.floor(r() * 3)],
    label: t => `${TEMPLATES.study.verb} ${t} min in ${cold.s.short}`,
  }));

  // 2. Capture quest on a different subject.
  const second = ranked[1] ?? ranked[0];
  daily.push(mk('capture', {
    subjectId: second.s.id,
    target: 1 + Math.floor(r() * 2),
    label: t => `${TEMPLATES.capture.verb} ${t} node${t > 1 ? 's' : ''} in ${second.s.short}`,
  }));

  // 3. Rescue if anything is fading, otherwise spread across subjects.
  if (totalFading > 0) {
    daily.push(mk('rescue', {
      target: Math.min(totalFading, 1 + Math.floor(r() * 3)),
      label: t => `${TEMPLATES.rescue.verb} ${t} fading topic${t > 1 ? 's' : ''}`,
    }));
  } else {
    daily.push(mk('spread', {
      target: 3,
      label: t => `${TEMPLATES.spread.verb} ${t} different subjects today`,
    }));
  }

  const weekly = [
    mk('study', { target: 240 + Math.floor(r() * 3) * 60, weekly: true,
      label: t => `${TEMPLATES.study.verb} ${(t / 60).toFixed(0)} hours this week` }),
    mk('capture', { target: 6 + Math.floor(r() * 5), weekly: true,
      label: t => `${TEMPLATES.capture.verb} ${t} nodes this week` }),
  ];

  return { date, seed, daily, weekly };

  function mk(type, { subjectId = null, target, label, weekly = false }) {
    return {
      id: `${date}-${type}-${subjectId ?? 'any'}-${target}${weekly ? '-w' : ''}`,
      type, subjectId, target, weekly,
      xp: Math.round(TEMPLATES[type].xp * (weekly ? 2.4 : 1)),
      label: label(target),
      claimed: false,
    };
  }
}

/** Progress a quest has made, from the raw logs. Pure — never mutates. */
export function progressOf(quest, { sessions = [], records = {}, date = localDay(),
                                    now = Date.now() }) {
  const inWindow = ts => quest.weekly
    ? (now - Date.parse(ts)) <= 7 * DAY
    : localDay(new Date(ts)) === date;

  switch (quest.type) {
    case 'study': {
      return sessions
        .filter(s => inWindow(s.ts) && (!quest.subjectId || s.subjectId === quest.subjectId))
        .reduce((a, s) => a + s.minutes, 0);
    }
    case 'capture':
    case 'rescue': {
      return Object.entries(records).filter(([id, rec]) => {
        if (!rec.lastTouched || !inWindow(rec.lastTouched)) return false;
        if (quest.subjectId && !id.startsWith(quest.subjectId + ':')) return false;
        return true;
      }).length;
    }
    case 'spread': {
      const seen = new Set();
      for (const s of sessions) if (inWindow(s.ts)) seen.add(s.subjectId);
      for (const [id, rec] of Object.entries(records)) {
        if (rec.lastTouched && inWindow(rec.lastTouched)) seen.add(id.split(':')[0]);
      }
      return seen.size;
    }
    case 'visit':
    default:
      return 0;
  }
}

export function isComplete(quest, ctx) {
  return progressOf(quest, ctx) >= quest.target;
}

/** Regenerate only when the local day has rolled over. */
export function refresh(stored, args) {
  const date = args.date ?? localDay();
  if (stored && stored.date === date && stored.daily?.length) return stored;
  const next = generate({ ...args, date });
  // Weekly quests survive the daily roll while their week is still running.
  if (stored?.weekly?.length && stored.weekStart === weekStart(date)) {
    next.weekly = stored.weekly;
  }
  next.weekStart = weekStart(date);
  return next;
}

export function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return localDay(d);
}
