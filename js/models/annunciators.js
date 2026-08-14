import * as mastery from './mastery.js';

const DAY = 86400000;

/**
 * Annunciator captions — the "signs" on the glareshield.
 *
 * The aircraft never crashes and never scolds. It reports state the way real
 * avionics do: WARNING (red) for things with a hard date, CAUTION (amber) for
 * decay and neglect, ADVISORY (cyan) for information, and a single NOMINAL
 * caption when there is genuinely nothing to say.
 */
export const LEVELS = { warning: 3, caution: 2, advisory: 1, nominal: 0 };

const COLD_DAYS = 10;
const PACE_FLOOR = 0.85;
/** Above this many cold subjects, collapse them into a single counted caption. */
export const COLD_CAPTION_MAX = 2;

/** Most recent moment a subject was touched, by session or by node capture. */
export function lastTouch(subjectId, nodes, records, sessions) {
  let latest = 0;
  for (const s of sessions) {
    if (s.subjectId === subjectId) latest = Math.max(latest, Date.parse(s.ts));
  }
  for (const n of nodes) {
    const t = records[n.id]?.lastTouched;
    if (t) latest = Math.max(latest, Date.parse(t));
  }
  return latest || null;
}

export function build({
  subjects, nodesBySubject, records, sessions = [], deadlines = [],
  paceRatio = 1, streak = { current: 0 }, now = Date.now(),
}) {
  const out = [];

  // ── WARNING: dated things that are close ──────────────────
  for (const d of deadlines) {
    if (d.status === 'done') continue;
    const days = Math.ceil((Date.parse(d.due) - now) / DAY);
    if (days < 0) {
      out.push({ code: `${short(d.title)} OVERDUE`, level: 'warning',
        detail: `${d.title} was due ${Math.abs(days)} day(s) ago.`, href: '#/fpln' });
    } else if (days <= 14) {
      out.push({ code: `${short(d.title)} ${days}D`, level: days <= 3 ? 'warning' : 'caution',
        detail: `${d.title} is due in ${days} day(s).`, href: '#/fpln' });
    }
  }

  // ── CAUTION: decay ────────────────────────────────────────
  const allNodes = subjects.flatMap(s => nodesBySubject[s.id] ?? []);
  const fading = mastery.rescueQueue(allNodes.map(n => n.id), records, now);
  if (fading.length) {
    out.push({ code: `${fading.length} FADING`, level: 'caution',
      detail: `${fading.length} topic${fading.length > 1 ? 's are' : ' is'} decaying. Oldest: ${
        Math.round(fading[0].days)} days.`, href: '#/fade' });
  }

  // ── CAUTION: neglected subjects ───────────────────────────
  // Six identical captions is noise, not information. Past two, they collapse
  // into one count so the glareshield stays readable.
  const cold = [];
  for (const s of subjects) {
    const nodes = nodesBySubject[s.id] ?? [];
    const t = lastTouch(s.id, nodes, records, sessions);
    const days = t === null ? Infinity : (now - t) / DAY;
    if (days >= COLD_DAYS) cold.push({ s, t, days });
  }
  cold.sort((a, b) => b.days - a.days);

  if (cold.length > COLD_CAPTION_MAX) {
    out.push({
      code: `${cold.length} SUBJECTS COLD`, level: 'caution',
      detail: `Untouched for ${COLD_DAYS}+ days: ${cold.map(c => c.s.short).join(', ')}.`,
      href: '#/pace',
    });
  } else {
    for (const c of cold) {
      out.push({
        code: `${c.s.short.toUpperCase()} COLD`, level: 'caution',
        detail: c.t === null
          ? `${c.s.name} has never been opened.`
          : `${c.s.name} untouched for ${Math.round(c.days)} days.`,
        href: `#/subject:${c.s.id}`,
      });
    }
  }

  // ── CAUTION: off the glideslope ───────────────────────────
  if (paceRatio > 0 && paceRatio < PACE_FLOOR) {
    out.push({ code: 'BEHIND PACE', level: 'caution',
      detail: `Capturing at ${Math.round(paceRatio * 100)}% of the rate the calendar expects.`,
      href: '#/pace' });
  }

  // ── ADVISORY ──────────────────────────────────────────────
  if (streak.current === 0 && sessions.length > 0) {
    out.push({ code: 'STREAK LOST', level: 'advisory',
      detail: 'Log anything today to start a new one.', href: '#/log' });
  }
  if (paceRatio >= 1.15) {
    out.push({ code: 'AHEAD OF PLAN', level: 'advisory',
      detail: `Running at ${Math.round(paceRatio * 100)}% of expected pace.`, href: '#/pace' });
  }

  if (!out.length) {
    return [{ code: 'ALL SYSTEMS NOMINAL', level: 'nominal',
      detail: 'Nothing fading, nothing overdue, on pace.', href: '#/pace' }];
  }

  return out.sort((a, b) => LEVELS[b.level] - LEVELS[a.level]);
}

/** True when the master caution lamp should be lit. */
export function masterCaution(list) {
  return list.some(a => a.level === 'warning' || a.level === 'caution');
}

export function worst(list) {
  return list.reduce((a, b) => (LEVELS[b.level] > LEVELS[a.level] ? b : a), list[0]);
}

function short(title) {
  return String(title).toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(' ').slice(0, 2).join(' ');
}
