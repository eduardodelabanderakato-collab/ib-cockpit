export function nodeId(subjectId, code) { return `${subjectId}:${code}`; }

/** The IB core is tracked like a subject but is not one of the six. */
export const CORE_SUBJECT = {
  id: 'core', name: 'Theory of Knowledge · Extended Essay · CAS', short: 'Core',
  level: 'CORE', group: 0, callsign: 'PRISM', colorKey: 'accent',
};

/**
 * Flatten the per-subject trees into a lookup index. Each node is decorated with
 * its resolved id, its subjectId and its parent topic so views never walk the tree.
 */
export function buildIndex(registry, trees) {
  const bySubject = new Map();
  const byId = new Map();

  for (const tree of trees) {
    const nodes = [];
    for (const topic of tree.topics) {
      for (const raw of topic.nodes) {
        const node = {
          ...raw,
          id: nodeId(tree.subjectId, raw.code),
          subjectId: tree.subjectId,
          topicCode: topic.code,
          topicTitle: topic.title,
        };
        nodes.push(node);
        byId.set(node.id, node);
      }
    }
    bySubject.set(tree.subjectId, { tree, nodes });
  }

  const subjects = [...registry.subjects];
  if (bySubject.has('core')) subjects.push(CORE_SUBJECT);

  return {
    session: registry.session,
    dpStart: registry.dpStart,
    examStart: registry.examStart,
    subjects,
    /** The six examined subjects, excluding core. */
    examined: registry.subjects,
    bySubject,
    byId,
  };
}

export function subject(index, subjectId) {
  return index.subjects.find(s => s.id === subjectId) ?? null;
}

export function nodesFor(index, subjectId) {
  return index.bySubject.get(subjectId)?.nodes ?? [];
}

export function topicsFor(index, subjectId) {
  return index.bySubject.get(subjectId)?.tree.topics ?? [];
}

export function treeFor(index, subjectId) {
  return index.bySubject.get(subjectId)?.tree ?? null;
}

export function allNodeIds(index) {
  return [...index.byId.keys()];
}

/** Node ids for the six examined subjects only — core is tracked separately. */
export function examinedNodeIds(index) {
  return index.examined.flatMap(s => nodesFor(index, s.id).map(n => n.id));
}

export function phaseFilter(nodes, phase) {
  return phase ? nodes.filter(n => n.phase === phase) : nodes;
}

/** Subjects whose tree has not been read from the official guide. */
export function unverifiedSubjects(index) {
  return index.subjects.filter(s => treeFor(index, s.id)?.verified === false);
}

/**
 * How much a tree can be trusted, and why.
 *   guide            — read verbatim from the official subject guide
 *   official-partial — cross-checked against another official IB document
 *   public           — reconstructed from public sources
 */
export const SOURCE_LEVELS = {
  guide:              { label: 'Verified',  tone: 'ok' },
  'official-partial': { label: 'Corroborated', tone: 'warn' },
  public:             { label: 'Unverified', tone: 'warn' },
};

export function provenance(index, subjectId) {
  const tree = treeFor(index, subjectId);
  if (!tree) return null;
  const level = tree.sourceLevel ?? 'public';
  return { level, note: tree.sourceNote ?? '', guide: tree.guide ?? '',
           ...SOURCE_LEVELS[level] };
}

/** Browser-side loader. Node tests build the index from disk instead. */
export async function loadIndex(base = '.') {
  const registry = await (await fetch(`${base}/data/subjects.json`)).json();
  const ids = [...registry.subjects.map(s => s.id), 'core'];
  const trees = await Promise.all(
    ids.map(id => fetch(`${base}/data/syllabus/${id}.json`).then(r => r.json()))
  );
  return buildIndex(registry, trees);
}
