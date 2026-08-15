import { loadIndex } from './syllabus.js';
import { createState } from './state.js';
import * as mastery from './models/mastery.js';
import { halfLivesFor } from './models/curve.js';
import { requireUnlock } from './gate.js';
import { ensureQuests } from './views/quests.js';
import { deckView, press } from './views/deck.js';
import { close as closeMCDU } from './ui/mcdu.js';
import { attach as attachKeys, legend } from './ui/keys.js';
import { buildEntries, search, KIND_LABEL } from './ui/palette.js';
import { el, toast } from './ui/dom.js';
import { SHORTCUTS } from './ui/keys.js';

const SHORTCUT_KEYS = new Set(Object.keys(SHORTCUTS));

const DAY = 86400000;

const state = createState();

// Gate first: nothing renders until the passcode is satisfied (or none is set).
await requireUnlock(state.get('settings').passHash);

const index = await loadIndex('.');

// Run decay once per boot so a long absence is reflected the moment you return.
state.set('mastery', mastery.decayAll(state.get('mastery'), Date.now(), halfLivesFor(state.get('checks'))));

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

/**
 * The palette. Cmd/Ctrl+K, or just start typing a letter that is not a
 * shortcut. Thirty-two three-letter keys are hard to browse; this makes every
 * one of them, plus every syllabus topic and note, reachable by plain words.
 */
function openPalette(seed = '') {
  document.querySelector('.pal')?.remove();
  const entries = buildEntries({
    index, notes: state.get('notes'), notebook: state.get('notebook') ?? [],
  });

  const box = el('div', 'pal');
  box.innerHTML = `<div class="pal-in">
    <input class="pal-q" placeholder="Go anywhere — a screen, a subject, a topic, a note"
           aria-label="Search" spellcheck="false">
    <div class="pal-list" role="listbox"></div>
    <p class="pal-foot"><kbd>↑↓</kbd> move <kbd>↵</kbd> open <kbd>esc</kbd> close</p>
  </div>`;
  document.body.append(box);

  const q = box.querySelector('.pal-q');
  const list = box.querySelector('.pal-list');
  let hits = [], active = 0;
  // Rows appearing under a stationary cursor fire mouseenter, which would hand
  // the selection to whatever the pointer happens to be sitting on instead of
  // the best match. Hover only counts once the pointer has actually moved.
  let pointerLive = false;

  const draw = () => {
    hits = search(entries, q.value);
    active = 0;
    pointerLive = false;
    list.innerHTML = hits.map((e, i) => `
      <div class="pal-row${i === 0 ? ' on' : ''}" data-i="${i}" role="option">
        <span class="pal-kind">${KIND_LABEL[e.kind]}</span>
        <span class="pal-code">${escHtml(e.code)}</span>
        <span class="pal-title">${escHtml(e.title)}
          <span class="pal-hint">${escHtml(e.hint ?? '')}</span></span>
        ${e.key ? `<kbd>${escHtml(e.key)}</kbd>` : ''}
      </div>`).join('') || '<p class="pal-none">Nothing matches.</p>';
    for (const row of list.querySelectorAll('.pal-row')) {
      row.onclick = () => go(Number(row.dataset.i));
      row.onmouseenter = () => { if (pointerLive) mark(Number(row.dataset.i)); };
      row.onmousemove = () => {
        pointerLive = true;
        mark(Number(row.dataset.i));
      };
    }
  };
  const mark = i => {
    active = i;
    list.querySelectorAll('.pal-row').forEach((r, n) => r.classList.toggle('on', n === i));
  };
  const go = i => {
    const hit = hits[i];
    if (!hit) return;
    box.remove();
    location.hash = hit.href;
  };

  q.oninput = draw;
  q.onkeydown = e => {
    if (e.key === 'Escape') { box.remove(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(Math.min(active + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(active - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(active); }
    list.querySelector('.pal-row.on')?.scrollIntoView({ block: 'nearest' });
  };
  box.onclick = e => { if (e.target === box) box.remove(); };

  q.value = seed;
  draw();
  setTimeout(() => q.focus(), 20);
}

function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)
    || e.target?.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); openPalette(); return;
  }
  // A letter that is not already a shortcut opens the palette pre-seeded, so
  // typing anything at all gets you somewhere instead of doing nothing.
  if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey
      && /^[a-z]$/i.test(e.key) && !SHORTCUT_KEYS.has(e.key.toLowerCase())
      && !document.querySelector('.pal')) {
    openPalette(e.key);
  }
});

// Keyboard: single letters open controls, digits open subjects, ? shows the map.
attachKeys(index, {
  onControl: id => { location.hash = `#/${id}`; },
  onClose:   () => { location.hash = '#/'; },
  onHelp:    () => showKeyMap(index),
});

function showKeyMap(idx) {
  document.querySelector('.keymap')?.remove();
  const box = el('div', 'keymap');
  box.innerHTML = `<div class="keymap-in">
    <p class="keymap-h">Keyboard</p>
    <div class="keymap-grid">${legend(idx).map(r =>
      `<span><kbd>${r.key}</kbd>${r.control.code} · ${r.control.name}</span>`).join('')}
      <span class="keymap-hero"><kbd>⌘K</kbd>Search anything — screens, topics, notes</span>
      <span><kbd>a–z</kbd>any unbound letter opens search</span>
      <span><kbd>esc</kbd>close</span><span><kbd>?</kbd>this card</span>
    </div></div>`;
  box.onclick = () => box.remove();
  document.body.append(box);
}

addEventListener('hashchange', () => {
  const id = controlId();
  if (id) press(ctx, id); else closeMCDU();
});
