import { el, esc } from './dom.js';

/**
 * The moment.
 *
 * A game needs somewhere the work lands. Everything else in here is an
 * instrument reading quietly; this is the one thing that interrupts you, and it
 * only fires when the projected diploma score crosses a rank threshold — never
 * for logging a session, never for opening a screen. Rare on purpose: if it
 * went off for activity it would mean exactly as much as the XP counter did.
 */

let live = null;

export function rankUp({ rank, held, from = null }) {
  dismiss();

  const card = el('div', 'rankup');
  card.innerHTML = `
    <div class="rankup-card" role="dialog" aria-label="Rank reached">
      <div class="rankup-rays"></div>
      <p class="rankup-kicker">${from ? `${esc(from)} → ` : ''}RANK REACHED</p>
      <h2 class="rankup-name">${esc(rank.name)}</h2>
      <div class="rankup-score">${held}<small>/ 45</small></div>
      <p class="rankup-note">${esc(rank.note)}</p>
      ${rank.next ? `<p class="rankup-next">Next: <b>${esc(rank.next.name)}</b>
        at ${rank.next.at} points — ${rank.toNext} more</p>` : ''}
      <button class="chip chip-primary rankup-ok">Continue</button>
    </div>`;

  card.querySelector('.rankup-ok').onclick = dismiss;
  card.onclick = e => { if (e.target === card) dismiss(); };
  document.addEventListener('keydown', onKey);
  document.body.append(card);
  live = card;

  // Layout has to settle before the transition, or a backgrounded tab shows
  // the card already at its final state with no animation at all.
  void card.offsetHeight;
  card.classList.add('in');
  card.querySelector('.rankup-ok').focus();
  return card;
}

function onKey(e) {
  if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); dismiss(); }
}

export function dismiss() {
  document.removeEventListener('keydown', onKey);
  if (!live) return;
  const gone = live;
  live = null;
  gone.classList.remove('in');
  setTimeout(() => gone.remove(), 320);
}

/**
 * Whether this rank change earns the interruption. Upward crossings only, once
 * each. The first run has nothing to compare against, so it stays quiet rather
 * than congratulating you for opening the app.
 */
export function shouldCelebrate({ rank, lastRank, ranks }) {
  if (!rank || rank.name === lastRank || lastRank == null) return false;
  const at = n => ranks.findIndex(r => r.name === n);
  const from = at(lastRank);
  // An unrecognised stored rank is not evidence of a climb.
  if (from < 0) return false;
  return at(rank.name) > from;
}

/**
 * Fire if it is earned, and report the rank to persist either way.
 * @returns {string|null} the rank name to store, or null if there is none.
 */
export function checkRank({ rank, held, lastRank, ranks }) {
  if (!rank) return null;
  if (shouldCelebrate({ rank, lastRank, ranks })) rankUp({ rank, held, from: lastRank });
  return rank.name;
}
