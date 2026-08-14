const DAY = 86400000;

export function xpToNext(level) { return 500 + 250 * (level - 1); }

/** Total XP required to have reached `level`. Level 1 starts at 0. */
export function cumulativeXp(level) {
  const n = level - 1;
  return 500 * n + 250 * (n * (n - 1)) / 2;
}

export function levelFromXp(total) {
  let level = 1;
  while (total >= cumulativeXp(level + 1)) level++;
  return { level, into: total - cumulativeXp(level), need: xpToNext(level) };
}

export function streakMultiplier(streak) {
  return 1 + Math.min(Math.max(streak, 0), 30) / 60;
}

const BASE = {
  study:     ctx => ctx.minutes,
  capture:   ctx => 50 * ctx.level,
  rescue:    () => 75,
  gradeLog:  () => 100,
  firstNote: () => 25,
  quest:     ctx => ctx.value,
};

export function award(kind, ctx = {}, streak = 0) {
  const fn = BASE[kind];
  if (!fn) throw new Error(`Unknown XP award: ${kind}`);
  return Math.round(fn(ctx) * streakMultiplier(streak));
}

/** `today` is a local YYYY-MM-DD string so streaks follow the user's day, not UTC. */
export function updateStreak(streak, today) {
  const s = streak ?? { current: 0, longest: 0, lastDay: null };
  if (s.lastDay === today) return { ...s };
  const gap = s.lastDay ? Math.round((Date.parse(today) - Date.parse(s.lastDay)) / DAY) : null;
  const current = gap === 1 ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastDay: today };
}

export function localDay(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
