const DAY = 86400000;

/**
 * Consecutive study days.
 *
 * All that survives of the XP system. Points, levels and award multipliers went
 * up whatever you did, so they measured nothing but activity and competed for
 * attention with the only score that matters — see models/road.js. A streak is
 * different: it makes no claim about your diploma, only about whether you
 * turned up, and that is a true and useful thing to know.
 */

/** `today` is a local YYYY-MM-DD string so streaks follow your day, not UTC. */
export function updateStreak(streak, today) {
  const s = streak ?? empty();
  if (s.lastDay === today) return { ...s };
  const gap = s.lastDay ? Math.round((Date.parse(today) - Date.parse(s.lastDay)) / DAY) : null;
  const current = gap === 1 ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastDay: today };
}

export function empty() {
  return { current: 0, longest: 0, lastDay: null };
}

export function localDay(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
