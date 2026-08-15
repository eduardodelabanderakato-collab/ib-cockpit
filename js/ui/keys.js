import { allControls } from './controls.js';

/**
 * Keyboard control.
 *
 * Typing is faster than aiming at an 8mm bezel key, and logging happens more
 * often when it is cheap. Single letters, no modifiers, ignored whenever you
 * are actually typing into something.
 */
export const SHORTCUTS = {
  l: 'log',    t: 'timer',  s: 'score',  d: 'due',
  n: 'note',   b: 'book',   f: 'fade',   h: 'heat',
  a: 'avg',    p: 'plan',   m: 'map',    q: 'quests',
  g: 'proj',   c: 'crew',   r: 'lib',    ',': 'cfg',
};

/** Digits 1-7 open the engines in registry order. */
export function engineFor(index, digit) {
  const n = Number(digit);
  if (!Number.isInteger(n) || n < 1) return null;
  return index.subjects[n - 1] ? `subject:${index.subjects[n - 1].id}` : null;
}

/** True when a keystroke belongs to whatever the user is typing in. */
export function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      || target.isContentEditable === true;
}

/** Resolve a keydown to a control id, or null to ignore it. */
export function resolve(event, index) {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isTyping(event.target)) return null;

  const k = event.key;
  if (k === 'Escape') return 'close';
  if (k === '?') return 'help';
  if (/^[1-9]$/.test(k)) return engineFor(index, k);

  const id = SHORTCUTS[k.toLowerCase()];
  return id ?? null;
}

export function attach(index, { onControl, onClose, onHelp }) {
  const handler = event => {
    const id = resolve(event, index);
    if (!id) return;
    event.preventDefault();
    if (id === 'close') onClose();
    else if (id === 'help') onHelp();
    else onControl(id);
  };
  addEventListener('keydown', handler);
  return () => removeEventListener('keydown', handler);
}

/** The legend, grouped for the help card. */
export function legend(index) {
  const all = allControls(index);
  const named = id => all.find(c => c.id === id);
  const rows = Object.entries(SHORTCUTS)
    .map(([key, id]) => ({ key, control: named(id) }))
    .filter(r => r.control);
  const engines = index.subjects.slice(0, 9)
    .map((s, i) => ({ key: String(i + 1), control: { code: s.callsign, name: s.short } }));
  return [...rows, ...engines];
}
