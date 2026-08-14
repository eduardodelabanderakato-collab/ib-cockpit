export const SCHEMA = 1;
const PREFIX = 'ibc:';

let backend = typeof localStorage !== 'undefined' ? localStorage : null;

/** Swap the storage backend. Used by tests and by a future cloud adapter. */
export function setBackend(b) { backend = b; }

/**
 * Read a namespaced key. A malformed value can never throw: it is dropped
 * and the fallback is returned, so one bad entry cannot white-screen the app.
 */
export function read(key, fallback) {
  if (!backend) return fallback;
  const raw = backend.getItem(PREFIX + key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    backend.removeItem(PREFIX + key);
    return fallback;
  }
}

export function write(key, value) {
  if (!backend) return;
  backend.setItem(PREFIX + key, JSON.stringify(value));
}

export function remove(key) {
  if (!backend) return;
  backend.removeItem(PREFIX + key);
}

function ownKeys() {
  const out = [];
  for (let i = 0; i < backend.length; i++) {
    const k = backend.key(i);
    if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
  }
  return out;
}

export function exportAll() {
  const data = {};
  for (const k of ownKeys()) data[k] = read(k, null);
  return JSON.stringify({ schema: SCHEMA, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importAll(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Could not parse the backup file.' };
  }
  if (!parsed || typeof parsed.data !== 'object' || parsed.data === null) {
    return { ok: false, error: 'Could not parse a data block from the backup file.' };
  }
  if (typeof parsed.schema !== 'number' || parsed.schema > SCHEMA) {
    return { ok: false, error: `Backup uses schema ${parsed.schema}, this build understands ${SCHEMA}.` };
  }
  for (const [k, v] of Object.entries(parsed.data)) write(k, v);
  return { ok: true };
}
