import { loadIndex } from './syllabus.js';
import { createState } from './state.js';
import * as mastery from './models/mastery.js';
import { requireUnlock } from './gate.js';
import { ensureQuests } from './views/quests.js';
import { deckView, press } from './views/deck.js';
import { close as closeMCDU } from './ui/mcdu.js';

const DAY = 86400000;

const state = createState();

// Gate first: nothing renders until the passcode is satisfied (or none is set).
await requireUnlock(state.get('settings').passHash);

const index = await loadIndex('.');

// Run decay once per boot so a long absence is reflected the moment you return.
state.set('mastery', mastery.decayAll(state.get('mastery')));

document.documentElement.dataset.theme = state.get('settings').theme ?? 'glass';

const days = Math.max(0, Math.ceil((Date.parse(index.examStart) - Date.now()) / DAY));
document.getElementById('countdown').innerHTML = `M28 · <b>${days} days</b>`;

const ctx = { index, state };
ensureQuests(ctx);

document.body.classList.add('jet-mode');

/**
 * Offline support, and an end to stale code.
 *
 * The worker is network-first for everything it serves, so a deploy always
 * wins; the cache only steps in when the network does not answer. When a new
 * version installs behind the running one, say so rather than silently
 * leaving two versions in play.
 */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js', { type: 'module', scope: './' })
    .then(reg => {
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            toast('New version ready — <b>reload</b> to fly it');
          }
        });
      });
    })
    .catch(() => { /* offline support is a bonus, never a requirement */ });
}
const view = document.getElementById('view');
const controlId = () => location.hash.replace(/^#\/?/, '') || null;

// The deck is built once. The hash only decides which control is pressed, so
// the windshield, HUD and annunciators never rebuild underneath you.
deckView(view, ctx, controlId());

addEventListener('hashchange', () => {
  const id = controlId();
  if (id) press(ctx, id); else closeMCDU();
});
