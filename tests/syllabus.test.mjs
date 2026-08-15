import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildIndex, nodeId, nodesFor, allNodeIds, examinedNodeIds,
  phaseFilter, subject, unverifiedSubjects, treeFor,
} from '../js/syllabus.js';

function load() {
  const reg = JSON.parse(readFileSync('data/subjects.json', 'utf8'));
  const ids = [...reg.subjects.map(s => s.id), 'core'];
  const trees = ids.map(id => JSON.parse(readFileSync(`data/syllabus/${id}.json`, 'utf8')));
  return buildIndex(reg, trees);
}

test('nodeId joins subject and code', () => {
  assert.equal(nodeId('math-aa-hl', '5.7'), 'math-aa-hl:5.7');
});

test('the registry holds six examined subjects, three HL and three SL', () => {
  const idx = load();
  assert.equal(idx.examined.length, 6);
  assert.equal(idx.examined.filter(s => s.level === 'HL').length, 3);
  assert.equal(idx.examined.filter(s => s.level === 'SL').length, 3);
});

test('core is indexed alongside the six but excluded from examined', () => {
  const idx = load();
  assert.equal(idx.subjects.length, 7);
  assert.ok(subject(idx, 'core'));
  assert.ok(!idx.examined.some(s => s.id === 'core'));
  assert.ok(nodesFor(idx, 'core').length > 0);
});

test('every subject in the registry has a loaded tree', () => {
  const idx = load();
  for (const s of idx.subjects) {
    assert.ok(nodesFor(idx, s.id).length > 0, `${s.id} has no nodes`);
  }
});

test('node ids are unique across every subject', () => {
  const idx = load();
  const ids = allNodeIds(idx);
  assert.equal(new Set(ids).size, ids.length);
});

test('examinedNodeIds excludes core nodes', () => {
  const idx = load();
  assert.ok(examinedNodeIds(idx).every(id => !id.startsWith('core:')));
  assert.ok(allNodeIds(idx).some(id => id.startsWith('core:')));
});

test('SL subjects contain no AHL nodes', () => {
  const idx = load();
  for (const s of idx.examined.filter(s => s.level === 'SL')) {
    assert.equal(nodesFor(idx, s.id).filter(n => n.tier === 'AHL').length, 0, s.id);
  }
});

test('HL subjects contain at least one AHL node', () => {
  const idx = load();
  for (const s of idx.examined.filter(s => s.level === 'HL')) {
    assert.ok(nodesFor(idx, s.id).some(n => n.tier === 'AHL'), s.id);
  }
});

test('every node is tagged DP1 or DP2', () => {
  const idx = load();
  for (const id of allNodeIds(idx)) {
    const n = idx.byId.get(id);
    assert.ok(['DP1', 'DP2'].includes(n.phase), `${id} has phase ${n.phase}`);
  }
});

test('phaseFilter narrows to a single DP year', () => {
  const idx = load();
  const all = nodesFor(idx, 'math-aa-hl');
  const dp1 = phaseFilter(all, 'DP1');
  assert.ok(dp1.length > 0 && dp1.length < all.length);
  assert.ok(dp1.every(n => n.phase === 'DP1'));
  assert.deepEqual(phaseFilter(all, null), all);
});

test('every node carries a resolved id, subjectId and parent topic', () => {
  const idx = load();
  for (const n of nodesFor(idx, 'physics-hl')) {
    assert.equal(n.subjectId, 'physics-hl');
    assert.equal(n.id, `physics-hl:${n.code}`);
    assert.ok(n.topicCode && n.topicTitle);
  }
});

test('trees checked against the official guide are no longer flagged', () => {
  const idx = load();
  const unverified = unverifiedSubjects(idx).map(s => s.id);

  // Economics has been verified verbatim against the official PDF.
  assert.ok(!unverified.includes('economics-hl'),
    'economics should no longer warn');
  assert.equal(treeFor(idx, 'economics-hl').verified, true);

  // Everything still built from public sources must keep warning.
  for (const id of ['math-aa-hl', 'physics-hl', 'chemistry-sl',
                    'portugues-lal-sl', 'english-lal-sl', 'core']) {
    assert.ok(unverified.includes(id), `${id} should still warn`);
  }
});

test('the verified Economics tree matches the guide it claims', () => {
  const idx = load();
  const tree = treeFor(idx, 'economics-hl');
  assert.match(tree.guide, /first assessment 2024/);

  const nodes = nodesFor(idx, 'economics-hl');
  // The four HL-only microeconomics topics, per the guide.
  const hlOnly = nodes.filter(n => n.tier === 'AHL' && n.code.startsWith('2.'))
    .map(n => n.code).sort();
  assert.deepEqual(hlOnly, ['2.10', '2.11', '2.12', '2.4']);

  // Units 1-4 carry exactly the guide's 31 numbered topics.
  const numbered = nodes.filter(n => /^[1-4]\./.test(n.code));
  assert.equal(numbered.length, 31);

  // The nine key concepts.
  assert.equal(nodes.filter(n => n.code.startsWith('K.')).length, 9);
});
