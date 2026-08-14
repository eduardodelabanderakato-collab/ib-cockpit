import { el, esc } from './dom.js';

/**
 * The MCDU panel.
 *
 * Pressing any control slides this up over the lower deck. It is an overlay on
 * the flight deck, never a page — the windshield, HUD and annunciators stay
 * exactly where they are behind it. Escape or CLOSE drops it.
 */
let host = null;
let onCloseCb = null;

export function mountMCDU(deck) {
  host = el('div', 'mcdu');
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'false');
  host.hidden = true;
  host.innerHTML = `
    <div class="mcdu-bar">
      <span class="mcdu-code" data-code></span>
      <span class="mcdu-title" data-title></span>
      <span class="mcdu-tip" data-tip></span>
      <button class="mcdu-close" data-close>CLOSE <kbd>ESC</kbd></button>
    </div>
    <div class="mcdu-screen" data-body></div>`;
  deck.append(host);

  host.querySelector('[data-close]').onclick = () => close();
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !host.hidden) { e.preventDefault(); close(); }
  });
  return host;
}

export function open(control, render) {
  if (!host) return;
  host.querySelector('[data-code]').textContent = control.code;
  host.querySelector('[data-title]').textContent = control.name;
  host.querySelector('[data-tip]').textContent = control.tip ?? '';
  const body = host.querySelector('[data-body]');
  body.innerHTML = '';
  body.scrollTop = 0;
  host.hidden = false;
  // Force a reflow so the height transition runs. requestAnimationFrame would
  // be the obvious choice, but it never fires while the tab is backgrounded —
  // the panel would silently fail to open.
  void host.offsetHeight;
  host.classList.add('open');
  render(body);
}

export function close() {
  if (!host || host.hidden) return;
  host.classList.remove('open');
  setTimeout(() => { host.hidden = true; host.querySelector('[data-body]').innerHTML = ''; }, 300);
  if (onCloseCb) onCloseCb();
}

export function onClose(fn) { onCloseCb = fn; }

export function isOpen() { return host && !host.hidden; }

/** The physical control itself: engraved label, LED, tooltip. */
export function controlButton(control, status) {
  const b = el('button', `ctl ctl-${control.kind}`);
  b.type = 'button';
  b.dataset.tip = status ? `${control.tip} — ${status.note}` : control.tip;
  b.setAttribute('aria-label', `${control.name}: ${control.tip}`);
  if (control.subject) b.style.setProperty('--c', `var(--${control.subject.colorKey === 'accent'
    ? 'accent' : control.subject.colorKey})`);
  b.innerHTML = `
    <span class="ctl-led${status ? ' ' + status.level : ''}"></span>
    <span class="ctl-code">${esc(control.code)}</span>
    <span class="ctl-name">${esc(control.name)}</span>
    ${status ? `<span class="ctl-note ${status.level}">${esc(status.note)}</span>` : ''}`;
  return b;
}
