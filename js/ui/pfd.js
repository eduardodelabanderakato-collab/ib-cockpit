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

const f1 = n => (Math.round(n * 10) / 10).toFixed(1);

export function renderPFD({ captured, expected, hoursPerWeek, daysToExam }) {
  const ratio = paceRatio(captured, expected);
  const bank = bankAngle(ratio);
  const pitch = pitchOffset(hoursPerWeek);
  const y = 92 + pitch;
  const onPace = ratio >= 0.95;

  const ladder = [-60, -40, -20, 20, 40, 60].map(o => `
    <g opacity=".45">
      <line x1="${o % 40 === 0 ? 122 : 136}" y1="${y + o}" x2="${o % 40 === 0 ? 198 : 184}" y2="${y + o}"
            stroke="var(--panel-text)" stroke-width="1"/>
    </g>`).join('');

  return `
  <div class="pfd">
    <svg viewBox="0 0 320 184" role="img"
         aria-label="Attitude indicator: ${onPace ? 'on pace' : 'behind pace'}">
      <defs>
        <clipPath id="pfdClip"><rect x="1" y="1" width="318" height="182" rx="12"/></clipPath>
      </defs>
      <g clip-path="url(#pfdClip)">
        <g transform="rotate(${bank.toFixed(2)} 160 92)">
          <rect x="-200" y="-260" width="720" height="${y + 260}" fill="var(--accent-2)" opacity=".28"/>
          <rect x="-200" y="${y}" width="720" height="520" fill="var(--warn)" opacity=".20"/>
          <line x1="-200" y1="${y}" x2="520" y2="${y}" stroke="var(--panel-text)" stroke-width="2"/>
          ${ladder}
        </g>
        <!-- fixed aircraft symbol -->
        <path d="M112 92 h34 l14 13 l14 -13 h34" fill="none"
              stroke="var(--accent)" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="160" cy="92" r="2.6" fill="var(--accent)"/>
        <!-- bank pointer -->
        <path d="M160 16 l-6 10 h12 z" fill="var(--panel-text)" opacity=".7"/>
      </g>
      <rect x="1" y="1" width="318" height="182" rx="12" fill="none" stroke="var(--panel-line)"/>
    </svg>

    <div class="pfd-readouts">
      <span><b>${f1(hoursPerWeek)}<small>h</small></b><i>airspeed · per week</i></span>
      <span><b>${Math.round(captured * 100)}<small>%</small></b><i>altitude · captured</i></span>
      <span class="hot"><b>${daysToExam}<small>d</small></b><i>heading · to exams</i></span>
      <span class="${onPace ? 'good' : 'hot'}">
        <b>${expected > 0 ? Math.round(ratio * 100) : '--'}<small>%</small></b><i>on pace</i></span>
    </div>
  </div>`;
}
