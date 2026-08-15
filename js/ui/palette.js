import { allControls } from './controls.js';
import { SHORTCUTS } from './keys.js';

/**
 * The command palette.
 *
 * Thirty-two three-letter keys on a photograph is a beautiful instrument and a
 * poor way to find anything. This is the answer: press a key, type what you
 * want in plain words, hit enter. Controls, subjects, every syllabus topic and
 * every note you have written are all reachable from one box.
 *
 * The matcher is subsequence-based, so "phya1" finds Physics A.1 Kinematics and
 * "gradav" finds the grade average.
 */

/** Subsequence match with a score: earlier and tighter matches rank higher. */
export function score(query, text) {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - t.length;

  const word = t.split(/[\s·—-]+/).some(w => w.startsWith(q));
  if (word) return 700 - t.length;

  const direct = t.indexOf(q);
  if (direct >= 0) return 500 - direct - t.length * 0.1;

  // Subsequence: every character of the query in order.
  let i = 0, first = -1, gaps = 0, last = -1;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      if (first < 0) first = j;
      if (last >= 0) gaps += j - last - 1;
      last = j;
      i++;
    }
  }
  if (i < q.length) return -1;
  return 200 - first - gaps * 2 - t.length * 0.05;
}

/** Everything reachable, flattened into one searchable list. */
export function buildEntries({ index, notes = {}, notebook = [] }) {
  const out = [];

  for (const c of allControls(index)) {
    const key = Object.entries(SHORTCUTS).find(([, id]) => id === c.id)?.[0];
    out.push({
      kind: 'control',
      id: c.id,
      title: c.name,
      code: c.code,
      hint: c.tip,
      key,
      href: `#/${c.id}`,
      rank: c.kind === 'entry' ? 3 : 2,
    });
  }

  for (const s of index.subjects) {
    for (const n of index.bySubject.get(s.id)?.nodes ?? []) {
      out.push({
        kind: 'topic',
        id: n.id,
        title: `${n.code} ${n.title}`,
        code: s.short,
        hint: `${s.short} · ${n.topicTitle}`,
        href: `#/subject:${s.id}`,
        rank: 1,
      });
    }
  }

  for (const [nodeId, n] of Object.entries(notes)) {
    if (!n?.md?.trim()) continue;
    const node = index.byId?.get(nodeId);
    out.push({
      kind: 'note', id: nodeId,
      title: node ? `${node.code} ${node.title}` : nodeId,
      code: 'NOTE', hint: n.md.slice(0, 70), href: '#/book', rank: 1,
    });
  }
  for (const n of notebook) {
    out.push({
      kind: 'note', id: n.id, title: n.title || 'Untitled',
      code: 'NOTE', hint: (n.md ?? '').slice(0, 70), href: '#/book', rank: 1,
    });
  }

  return out;
}

/** Best matches first. An empty query returns the things you reach for most. */
export function search(entries, query, limit = 9) {
  const q = String(query ?? '').trim();
  if (!q) {
    return entries
      .filter(e => e.kind === 'control')
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit);
  }
  const scored = entries
    .map(e => {
      // -1 means "no match at all". Scoring the penalties first and adding the
      // rank bonus afterwards would let a non-match float back above zero.
      const parts = [score(q, e.title), score(q, e.code) - 20,
                     score(q, `${e.code} ${e.title}`) - 10]
        .filter((v, i) => v > (i === 0 ? -1 : i === 1 ? -21 : -11));
      if (!parts.length) return { e, s: -1 };
      return { e, s: Math.max(...parts) + e.rank * 8 };
    })
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return [];

  // Subsequence matching will find *something* for almost any query — typing
  // "kinem" drags in "knowledge and indigenous societies" on scattered letters.
  // A list padded with those reads as a worse search than one that stops short,
  // so anything far behind the leader is dropped rather than shown.
  const floor = scored[0].s * RELATIVE_FLOOR;
  return scored.filter(x => x.s >= floor).slice(0, limit).map(x => x.e);
}

/** How far behind the best match a result may sit and still be worth showing. */
export const RELATIVE_FLOOR = 0.55;

export const KIND_LABEL = { control: 'GO', topic: 'TOPIC', note: 'NOTE' };
