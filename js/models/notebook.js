/**
 * The notebook.
 *
 * Two kinds of note live in the app and belong in one library:
 *   · node notes  — written against a syllabus topic (store: `notes`)
 *   · free notes  — anything else, with your own title (store: `notebook`)
 *
 * These functions merge, search and order them. All pure and DOM-free.
 */

/** Merge both stores into one sorted list of entries. */
export function collect({ notes = {}, notebook = [], index = null }) {
  const out = [];

  for (const [nodeId, n] of Object.entries(notes)) {
    if (!n || (!n.md?.trim() && !n.goodnotes?.trim())) continue;
    const node = index?.byId?.get(nodeId) ?? null;
    out.push({
      id: nodeId,
      kind: 'node',
      nodeId,
      subjectId: node?.subjectId ?? nodeId.split(':')[0],
      title: node ? `${node.code} ${node.title}` : nodeId,
      code: node?.code ?? '',
      md: n.md ?? '',
      goodnotes: n.goodnotes ?? '',
      pinned: !!n.pinned,
      updatedAt: n.updatedAt ?? null,
    });
  }

  for (const n of notebook) {
    out.push({
      id: n.id,
      kind: 'free',
      nodeId: null,
      subjectId: n.subjectId ?? null,
      title: n.title || 'Untitled',
      code: '',
      md: n.md ?? '',
      goodnotes: n.goodnotes ?? '',
      pinned: !!n.pinned,
      updatedAt: n.updatedAt ?? null,
    });
  }

  return order(out);
}

/** Pinned first, then most recently touched, then alphabetical. */
export function order(entries) {
  return [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (at !== bt) return bt - at;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Free-text search across title and body. Every whitespace-separated term must
 * appear somewhere, so extra words narrow rather than widen the result.
 */
export function search(entries, query) {
  const terms = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter(e => {
    const hay = `${e.title} ${e.md} ${e.code}`.toLowerCase();
    return terms.every(t => hay.includes(t));
  });
}

export function bySubject(entries, subjectId) {
  return subjectId ? entries.filter(e => e.subjectId === subjectId) : entries;
}

/** First meaningful line of a note, for the list preview. */
export function excerpt(md, max = 110) {
  const line = String(md ?? '')
    .split('\n')
    .map(l => l.replace(/^[#>\-*\s]+/, '').trim())
    .find(l => l.length) ?? '';
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

export function wordCount(md) {
  return String(md ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function stats(entries) {
  return {
    total: entries.length,
    node: entries.filter(e => e.kind === 'node').length,
    free: entries.filter(e => e.kind === 'free').length,
    pinned: entries.filter(e => e.pinned).length,
    linked: entries.filter(e => e.goodnotes).length,
    words: entries.reduce((a, e) => a + wordCount(e.md), 0),
  };
}

export function newNote({ title = '', subjectId = null } = {}, now = Date.now()) {
  return {
    id: `n${now}-${Math.random().toString(36).slice(2, 7)}`,
    title, subjectId, md: '', goodnotes: '', pinned: false,
    updatedAt: new Date(now).toISOString(),
  };
}
