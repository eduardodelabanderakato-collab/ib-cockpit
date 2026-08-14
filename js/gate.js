/**
 * The crew access gate.
 *
 * Be clear-eyed about what this is: a client-side lock screen. It hides the
 * interface from anyone who wanders onto the URL. It does NOT encrypt anything,
 * and anyone who opens devtools can walk straight past it. That is acceptable
 * here for exactly one reason — your study data lives in your own browser, so
 * the public site holds nothing to protect.
 *
 * Unlocking lasts for the browser tab session, not forever.
 */
const UNLOCK_KEY = 'ibc:unlocked';

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verify(input, hash) {
  if (!hash) return true;
  return (await sha256(String(input))) === hash;
}

export function isUnlocked() {
  try { return sessionStorage.getItem(UNLOCK_KEY) === '1'; } catch { return true; }
}

export function markUnlocked() {
  try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch { /* private mode: gate each load */ }
}

export function lockNow() {
  try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* nothing to clear */ }
}

/**
 * Resolves once the user is through the gate. Resolves immediately when no
 * passcode is set or the tab is already unlocked.
 */
export function requireUnlock(passHash) {
  if (!passHash || isUnlocked()) return Promise.resolve();

  return new Promise(resolve => {
    const gate = document.createElement('div');
    gate.className = 'gate';
    gate.innerHTML = `
      <form class="gate-box" autocomplete="off">
        <p class="gate-kicker">IB Cockpit</p>
        <h1 class="gate-h">Crew access</h1>
        <input class="gate-input mono" type="password" inputmode="numeric"
               aria-label="Passcode" autocomplete="current-password" required>
        <button class="gate-go" type="submit">Unlock</button>
        <p class="gate-err" role="alert" aria-live="polite"></p>
        <p class="gate-note">Client-side only. This hides the interface; it does not
          encrypt anything. Your study data never leaves this browser.</p>
      </form>`;

    document.body.append(gate);
    const form = gate.querySelector('form');
    const input = gate.querySelector('.gate-input');
    const err = gate.querySelector('.gate-err');
    setTimeout(() => input.focus(), 60);

    let attempts = 0;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (await verify(input.value, passHash)) {
        markUnlocked();
        gate.classList.add('gate-open');
        setTimeout(() => { gate.remove(); resolve(); }, 260);
        return;
      }
      attempts++;
      err.textContent = attempts >= 3
        ? 'Still wrong. If you have genuinely lost it, clear this site’s storage and it resets.'
        : 'Incorrect passcode.';
      gate.querySelector('.gate-box').classList.remove('shake');
      void gate.offsetWidth;               // restart the animation
      gate.querySelector('.gate-box').classList.add('shake');
      input.select();
    });
  });
}
