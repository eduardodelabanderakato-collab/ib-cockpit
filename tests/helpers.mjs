export function memoryBackend() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _raw: m,
  };
}

export const DAY = 86400000;
export const T0 = Date.parse('2026-09-01T12:00:00Z');
export const ago = d => new Date(T0 - d * DAY).toISOString();
