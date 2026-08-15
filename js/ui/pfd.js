/** Fraction of the DP elapsed, 0..1. */
export function courseElapsed(dpStart, examStart, now = Date.now()) {
  const a = Date.parse(dpStart.length === 7 ? dpStart + '-01' : dpStart);
  const b = Date.parse(examStart);
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

/** captured / expected. 1 means exactly on schedule. */
export function paceRatio(captured, expected) {
  if (expected <= 0) return 0;
  return captured / expected;
}

/** The horizon banks with pace: level on schedule, rolled when off it. Clamped to +/-30 degrees. */
export function bankAngle(ratio) {
  return Math.max(-30, Math.min(30, (ratio - 1) * 60));
}

/** Pitch the horizon with study velocity: 4h/week is the neutral cruise. */
export function pitchOffset(hoursPerWeek, cruise = 4) {
  return Math.max(-34, Math.min(34, (hoursPerWeek - cruise) * 7));
}
