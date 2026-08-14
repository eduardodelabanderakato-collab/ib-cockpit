# IB Cockpit — Plan 1: Foundation & First Flight

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working IB Cockpit you can use daily — real syllabus trees for all six subjects, nodes you capture by studying, mastery that decays on a real curve, a focus timer that logs sessions, and a Command Center with a Primary Flight Display that tilts with your pace.

**Architecture:** Vanilla ES modules, no build step, no npm dependencies. Pure-logic modules (`store`, `mastery`, `xp`) are DOM-free and tested with Node's built-in test runner. View modules render into a shell driven by a hash router. All persistence goes through one corruption-guarded storage abstraction so a cloud backend can be swapped in later without touching callers. All five themes are CSS variable sets in a single `tokens.css`.

**Tech Stack:** HTML5, CSS custom properties, ES2022 modules, `node --test` (built in, Node 26), `python3 -m http.server` for local dev, GitHub Pages for deploy.

**Spec:** `docs/superpowers/specs/2026-08-14-ib-cockpit-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Shell, theme boot, module entry |
| `assets/css/tokens.css` | All five themes as CSS variable sets |
| `assets/css/base.css` | Reset, typography, layout primitives |
| `assets/css/components.css` | Panels, gauges, buttons, nodes, timer |
| `js/store.js` | Corruption-guarded, schema-versioned persistence |
| `js/state.js` | In-memory state + pub/sub |
| `js/models/mastery.js` | Decay math, capture, progress |
| `js/models/xp.js` | XP awards, level curve, streaks |
| `js/syllabus.js` | Loads and indexes `data/syllabus/*.json` |
| `js/router.js` | Hash routing |
| `js/views/subject.js` | Syllabus tree + capture interaction |
| `js/views/log.js` | Timer, manual entry, session history |
| `js/views/command.js` | Command Center |
| `js/ui/pfd.js` | Primary Flight Display (SVG) |
| `js/main.js` | Boot, wire router to views |
| `data/syllabus/*.json` | One verified tree per subject |
| `data/subjects.json` | Subject registry: id, name, level, color, callsign |
| `tests/*.test.mjs` | Node tests for the pure modules |

---

## Task 0: Verified syllabus data

**This is a research task with a review gate. No UI is built until Eduardo approves the trees.**

**Files:**
- Create: `data/subjects.json`
- Create: `data/syllabus/math-aa-hl.json`, `physics-hl.json`, `economics-hl.json`, `chemistry-sl.json`, `portugues-lal-sl.json`, `english-lal-sl.json`, `core.json`

- [ ] **Step 1: Confirm guide editions for the May 2028 session**

For each subject, establish which guide edition a May 2028 cohort sits. Known at spec time:

| Subject | Expected edition | How to confirm |
|---|---|---|
| Physics HL | 2023 guide (first exams 2025), Themes A–E | Guide cover page states "First assessment 2025" |
| Chemistry SL | 2023 guide (first exams 2025), Structure 1–3 / Reactivity 1–3 | Same |
| Math AA HL | current guide, Topics 1–5 | Cover states first assessment year |
| Português A L&L SL | 2019 guide, 3 areas of exploration | Same |
| English A L&L SL | 2019 guide, 3 areas of exploration | Same |
| TOK | 2020 guide, exhibition + essay | Same |
| **Economics HL** | **unconfirmed** | Ask the teacher in week one; a revision is in the pipeline |

Source the actual guide PDFs from My IB or the subject teacher. Do not reconstruct a syllabus from
memory or from a revision site — the whole tracker is worthless if the tree is wrong.

- [ ] **Step 2: Write the schema**

Create `data/subjects.json`:

```json
{
  "session": "2028-05",
  "dpStart": "2026-08",
  "subjects": [
    { "id": "math-aa-hl",       "name": "Mathematics: Analysis & Approaches", "short": "Math AA",       "level": "HL", "group": 5, "callsign": "AXIS",     "colorKey": "s1" },
    { "id": "physics-hl",       "name": "Physics",                            "short": "Physics",       "level": "HL", "group": 4, "callsign": "THRUST",   "colorKey": "s2" },
    { "id": "economics-hl",     "name": "Economics",                          "short": "Economics",     "level": "HL", "group": 3, "callsign": "YIELD",    "colorKey": "s3" },
    { "id": "chemistry-sl",     "name": "Chemistry",                          "short": "Chemistry",     "level": "SL", "group": 4, "callsign": "CATALYST", "colorKey": "s4" },
    { "id": "portugues-lal-sl", "name": "Português A: Language & Literature",  "short": "Português",     "level": "SL", "group": 1, "callsign": "LÉXICO",   "colorKey": "s5" },
    { "id": "english-lal-sl",   "name": "English A: Language & Literature",    "short": "English",       "level": "SL", "group": 1, "callsign": "RHETOR",   "colorKey": "s6" }
  ]
}
```

- [ ] **Step 3: Write one syllabus file per subject in this exact shape**

`data/syllabus/math-aa-hl.json` — codes and titles copied verbatim from the guide:

```json
{
  "subjectId": "math-aa-hl",
  "guide": "Mathematics: Analysis and Approaches guide, first assessment 2021",
  "topics": [
    {
      "code": "1",
      "title": "Number and algebra",
      "nodes": [
        { "code": "1.1", "title": "Operations with numbers in the form a×10^k", "tier": "SL", "phase": "DP1" },
        { "code": "1.2", "title": "Arithmetic sequences and series",           "tier": "SL", "phase": "DP1" }
      ]
    }
  ]
}
```

Field rules:
- `code` — the guide's own numbering. Node IDs are derived as `${subjectId}:${code}`.
- `tier` — `"SL"` for core content, `"AHL"` for HL-only content. SL subjects use `"SL"` throughout.
- `phase` — `"DP1"` or `"DP2"`. Best guess at teacher sequencing; user-editable later.
- Depth is topic → subtopic only. Do not add a third level.

For the two Language A subjects, topics are the three areas of exploration
(`Readers, writers and texts` / `Time and space` / `Intertextuality: connecting texts`) and nodes are
the guide's inquiry questions plus one node per assessment component (Paper 1, Paper 2, Individual
Oral, Learner Portfolio, HL Essay if applicable).

For `core.json`, use `subjectId: "core"` with topics `TOK`, `EE`, `CAS` and nodes for each
assessment component and milestone.

- [ ] **Step 4: Validate every file parses and has no duplicate codes**

Run:

```bash
cd "/Users/eduardokato/IB Portfolio" && node -e '
const fs=require("fs"),d="data/syllabus";let bad=0;
for(const f of fs.readdirSync(d)){
  const j=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));
  const codes=j.topics.flatMap(t=>t.nodes.map(n=>n.code));
  const dupes=codes.filter((c,i)=>codes.indexOf(c)!==i);
  const badPhase=j.topics.flatMap(t=>t.nodes).filter(n=>!["DP1","DP2"].includes(n.phase));
  const badTier=j.topics.flatMap(t=>t.nodes).filter(n=>!["SL","AHL"].includes(n.tier));
  console.log(f.padEnd(26), codes.length+" nodes",
    dupes.length?"DUPES: "+dupes:"", badPhase.length?"BAD PHASE: "+badPhase.length:"",
    badTier.length?"BAD TIER: "+badTier.length:"");
  if(dupes.length||badPhase.length||badTier.length) bad++;
}
process.exit(bad?1:0);'
```

Expected: one line per file with a node count, no `DUPES`/`BAD PHASE`/`BAD TIER`, exit code 0.

- [ ] **Step 5: REVIEW GATE — present the trees to Eduardo**

Print a topic-level summary (subject, topic titles, node counts, DP1/DP2 split) and get explicit
approval before Task 1. Flag the Economics edition question again if still unresolved.

- [ ] **Step 6: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add data/ && git commit -m "data: add verified syllabus trees for all six subjects and core"
```

---

## Task 1: Repo skeleton and test harness

**Files:**
- Create: `tests/smoke.test.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Write a failing smoke test**

Create `tests/smoke.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('subjects.json registers exactly six subjects with unique ids', () => {
  const reg = JSON.parse(readFileSync('data/subjects.json', 'utf8'));
  assert.equal(reg.subjects.length, 6);
  const ids = reg.subjects.map(s => s.id);
  assert.equal(new Set(ids).size, 6);
  assert.equal(reg.subjects.filter(s => s.level === 'HL').length, 3);
  assert.equal(reg.subjects.filter(s => s.level === 'SL').length, 3);
});
```

- [ ] **Step 2: Run it**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/`
Expected: PASS (Task 0 already created the data). If it fails, Task 0 is incomplete — stop and fix.

- [ ] **Step 3: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add tests/ && git commit -m "test: add data registry smoke test"
```

---

## Task 2: Storage layer

**Files:**
- Create: `js/store.js`
- Test: `tests/store.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/store.test.mjs`:

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';

function memoryBackend() {
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

let backend;
beforeEach(() => { backend = memoryBackend(); store.setBackend(backend); });

test('write then read round-trips a value', () => {
  store.write('xp', { total: 120 });
  assert.deepEqual(store.read('xp', null), { total: 120 });
});

test('read returns the fallback for a missing key', () => {
  assert.deepEqual(store.read('nope', { a: 1 }), { a: 1 });
});

test('corrupt JSON returns the fallback and drops the key', () => {
  backend.setItem('ibc:mastery', '{not json');
  assert.deepEqual(store.read('mastery', {}), {});
  assert.equal(backend.getItem('ibc:mastery'), null);
});

test('keys are namespaced', () => {
  store.write('xp', 1);
  assert.equal(backend.getItem('ibc:xp'), '1');
});

test('exportAll produces JSON that importAll restores', () => {
  store.write('xp', { total: 7 });
  store.write('sessions', [{ id: 'a' }]);
  const dump = store.exportAll();
  store.setBackend(memoryBackend());
  assert.deepEqual(store.read('xp', null), null);
  const res = store.importAll(dump);
  assert.equal(res.ok, true);
  assert.deepEqual(store.read('xp', null), { total: 7 });
  assert.deepEqual(store.read('sessions', null), [{ id: 'a' }]);
});

test('importAll rejects malformed input without clobbering existing data', () => {
  store.write('xp', { total: 9 });
  const res = store.importAll('garbage');
  assert.equal(res.ok, false);
  assert.match(res.error, /parse/i);
  assert.deepEqual(store.read('xp', null), { total: 9 });
});

test('importAll rejects a payload from a newer schema', () => {
  const res = store.importAll(JSON.stringify({ schema: 999, data: {} }));
  assert.equal(res.ok, false);
  assert.match(res.error, /schema/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/store.test.mjs`
Expected: FAIL — `Cannot find module '../js/store.js'`

- [ ] **Step 3: Implement**

Create `js/store.js`:

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/store.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add js/store.js tests/store.test.mjs && git commit -m "feat: corruption-guarded schema-versioned storage layer"
```

---

## Task 3: Mastery and decay engine

**Files:**
- Create: `js/models/mastery.js`
- Test: `tests/mastery.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/mastery.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/models/mastery.js';

const DAY = 86400000;
const T0 = Date.parse('2026-09-01T12:00:00Z');
const ago = d => new Date(T0 - d * DAY).toISOString();

test('freshness is 1 the moment a node is touched', () => {
  assert.equal(m.freshness(2, 0), 1);
});

test('freshness halves after exactly one half-life', () => {
  assert.equal(m.freshness(3, 30), 0.5);   // Solid, half-life 30d
  assert.equal(m.freshness(1, 5), 0.5);    // Seen, half-life 5d
  assert.equal(m.freshness(4, 75), 0.5);   // Mastered, half-life 75d
});

test('an untouched node has zero freshness', () => {
  assert.equal(m.freshness(0, 0), 0);
});

test('stateOf classifies against the spec thresholds', () => {
  assert.equal(m.stateOf(0, 0), 'untouched');
  assert.equal(m.stateOf(3, 0), 'fresh');        // f = 1
  assert.equal(m.stateOf(3, 30), 'dimming');     // f = 0.5
  assert.equal(m.stateOf(3, 60), 'fading');      // f = 0.25
  assert.equal(m.stateOf(3, 120), 'lapsed');     // f = 0.0625
});

test('effectiveMastery is continuous, not a step count', () => {
  assert.equal(m.effectiveMastery(3, 0), 3);     // level 3, fully fresh
  assert.equal(m.effectiveMastery(3, 30), 2.5);  // half faded
  assert.equal(m.effectiveMastery(0, 0), 0);
});

test('capture raises the level and stamps lastTouched', () => {
  const r = m.capture({ level: 1, lastTouched: ago(40), touches: 3 }, T0);
  assert.equal(r.level, 2);
  assert.equal(r.touches, 4);
  assert.equal(Date.parse(r.lastTouched), T0);
});

test('capture caps at Mastered', () => {
  const r = m.capture({ level: 4, lastTouched: ago(1), touches: 9 }, T0);
  assert.equal(r.level, 4);
  assert.equal(r.touches, 10);
});

test('decay demotes a lapsed node exactly one level', () => {
  const r = m.decay({ level: 3, lastTouched: ago(120), touches: 5 }, T0);
  assert.equal(r.level, 2);
});

test('decay does not cascade past one level in a single pass', () => {
  const r = m.decay({ level: 4, lastTouched: ago(3650), touches: 5 }, T0);
  assert.equal(r.level, 3);
});

test('decay leaves a fresh node untouched', () => {
  const rec = { level: 3, lastTouched: ago(2), touches: 5 };
  assert.deepEqual(m.decay(rec, T0), rec);
});

test('decay never demotes below Untouched', () => {
  const r = m.decay({ level: 0, lastTouched: ago(9999), touches: 0 }, T0);
  assert.equal(r.level, 0);
});

test('subjectProgress averages effective mastery over all nodes', () => {
  const records = {
    'a': { level: 4, lastTouched: ago(0), touches: 1 },
    'b': { level: 0, lastTouched: null, touches: 0 },
  };
  assert.equal(m.subjectProgress(['a', 'b'], records, T0), 0.5);
});

test('subjectProgress counts unrecorded nodes as untouched', () => {
  assert.equal(m.subjectProgress(['a', 'b', 'c', 'd'], {}, T0), 0);
});

test('rescueQueue returns fading nodes worst-first', () => {
  const records = {
    'a': { level: 3, lastTouched: ago(60), touches: 1 },   // f = 0.25  fading
    'b': { level: 3, lastTouched: ago(45), touches: 1 },   // f ≈ 0.354 fading
    'c': { level: 3, lastTouched: ago(1),  touches: 1 },   // fresh
  };
  assert.deepEqual(m.rescueQueue(['a', 'b', 'c'], records, T0).map(x => x.id), ['a', 'b']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/mastery.test.mjs`
Expected: FAIL — `Cannot find module '../js/models/mastery.js'`

- [ ] **Step 3: Implement**

Create `js/models/mastery.js`:

```js
export const LEVELS = ['Untouched', 'Seen', 'Practiced', 'Solid', 'Mastered'];
export const MAX_LEVEL = 4;

/** Half-life in days per level. Index 0 is unused — an untouched node has nothing to forget. */
export const HALF_LIVES = [0, 5, 12, 30, 75];

export const THRESHOLDS = { fresh: 0.70, dimming: 0.40, fading: 0.20 };

const DAY = 86400000;

export function daysSince(lastTouched, now = Date.now()) {
  if (!lastTouched) return Infinity;
  return (now - Date.parse(lastTouched)) / DAY;
}

/** Ebbinghaus-style retention: halves once per half-life. */
export function freshness(level, days) {
  if (level <= 0) return 0;
  if (!isFinite(days)) return 0;
  return Math.pow(2, -days / HALF_LIVES[level]);
}

export function stateOf(level, days) {
  if (level <= 0) return 'untouched';
  const f = freshness(level, days);
  if (f >= THRESHOLDS.fresh) return 'fresh';
  if (f >= THRESHOLDS.dimming) return 'dimming';
  if (f >= THRESHOLDS.fading) return 'fading';
  return 'lapsed';
}

/** Continuous 0..4 mastery, so progress reflects decay rather than checkbox count. */
export function effectiveMastery(level, days) {
  if (level <= 0) return 0;
  return level - 1 + freshness(level, days);
}

export function emptyRecord() {
  return { level: 0, lastTouched: null, touches: 0 };
}

export function capture(record, now = Date.now()) {
  const r = record ?? emptyRecord();
  return {
    level: Math.min(MAX_LEVEL, r.level + 1),
    lastTouched: new Date(now).toISOString(),
    touches: r.touches + 1,
  };
}

/**
 * Demote a lapsed node by exactly one level. lastTouched is reset so a long
 * absence costs one level, not one per elapsed half-life.
 */
export function decay(record, now = Date.now()) {
  const r = record ?? emptyRecord();
  if (r.level <= 0) return r;
  if (stateOf(r.level, daysSince(r.lastTouched, now)) !== 'lapsed') return r;
  return {
    level: r.level - 1,
    lastTouched: new Date(now).toISOString(),
    touches: r.touches,
  };
}

export function decayAll(records, now = Date.now()) {
  const out = {};
  for (const [id, rec] of Object.entries(records)) out[id] = decay(rec, now);
  return out;
}

export function subjectProgress(nodeIds, records, now = Date.now()) {
  if (!nodeIds.length) return 0;
  let sum = 0;
  for (const id of nodeIds) {
    const r = records[id];
    sum += r ? effectiveMastery(r.level, daysSince(r.lastTouched, now)) : 0;
  }
  return sum / (MAX_LEVEL * nodeIds.length);
}

/** Fading nodes, worst freshness first — the "rescue" work queue. */
export function rescueQueue(nodeIds, records, now = Date.now()) {
  return nodeIds
    .map(id => {
      const r = records[id];
      if (!r || r.level <= 0) return null;
      const d = daysSince(r.lastTouched, now);
      const state = stateOf(r.level, d);
      if (state !== 'fading') return null;
      return { id, level: r.level, days: d, freshness: freshness(r.level, d) };
    })
    .filter(Boolean)
    .sort((a, b) => a.freshness - b.freshness);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/mastery.test.mjs`
Expected: PASS, 14 tests

- [ ] **Step 5: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add js/models/mastery.js tests/mastery.test.mjs && git commit -m "feat: mastery decay engine with rescue queue"
```

---

## Task 4: XP, levels and streaks

**Files:**
- Create: `js/models/xp.js`
- Test: `tests/xp.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/xp.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as xp from '../js/models/xp.js';

test('xpToNext follows the spec curve 500 + 250(n-1)', () => {
  assert.equal(xp.xpToNext(1), 500);
  assert.equal(xp.xpToNext(2), 750);
  assert.equal(xp.xpToNext(5), 1500);
});

test('cumulativeXp matches the sum of the curve', () => {
  assert.equal(xp.cumulativeXp(1), 0);
  assert.equal(xp.cumulativeXp(2), 500);
  assert.equal(xp.cumulativeXp(3), 1250);
  assert.equal(xp.cumulativeXp(5), 3500);
});

test('levelFromXp reports level, progress into it, and requirement', () => {
  assert.deepEqual(xp.levelFromXp(0),    { level: 1, into: 0,   need: 500 });
  assert.deepEqual(xp.levelFromXp(499),  { level: 1, into: 499, need: 500 });
  assert.deepEqual(xp.levelFromXp(500),  { level: 2, into: 0,   need: 750 });
  assert.deepEqual(xp.levelFromXp(3500), { level: 5, into: 0,   need: 1500 });
});

test('streakMultiplier rises to a 1.5x cap at 30 days', () => {
  assert.equal(xp.streakMultiplier(0), 1);
  assert.equal(xp.streakMultiplier(30), 1.5);
  assert.equal(xp.streakMultiplier(365), 1.5);
});

test('award scales the base value by the streak multiplier', () => {
  assert.equal(xp.award('study', { minutes: 60 }, 0), 60);
  assert.equal(xp.award('study', { minutes: 60 }, 30), 90);
  assert.equal(xp.award('capture', { level: 3 }, 0), 150);
  assert.equal(xp.award('rescue', {}, 0), 75);
  assert.equal(xp.award('gradeLog', {}, 0), 100);
  assert.equal(xp.award('firstNote', {}, 0), 25);
});

test('award rejects an unknown kind rather than silently returning zero', () => {
  assert.throws(() => xp.award('nonsense', {}, 0), /unknown xp award/i);
});

test('updateStreak increments on a consecutive day', () => {
  const s = xp.updateStreak({ current: 4, longest: 9, lastDay: '2026-09-01' }, '2026-09-02');
  assert.deepEqual(s, { current: 5, longest: 9, lastDay: '2026-09-02' });
});

test('updateStreak is idempotent within the same day', () => {
  const s = xp.updateStreak({ current: 4, longest: 9, lastDay: '2026-09-01' }, '2026-09-01');
  assert.deepEqual(s, { current: 4, longest: 9, lastDay: '2026-09-01' });
});

test('updateStreak resets after a missed day', () => {
  const s = xp.updateStreak({ current: 12, longest: 12, lastDay: '2026-09-01' }, '2026-09-04');
  assert.deepEqual(s, { current: 1, longest: 12, lastDay: '2026-09-04' });
});

test('updateStreak records a new longest', () => {
  const s = xp.updateStreak({ current: 9, longest: 9, lastDay: '2026-09-01' }, '2026-09-02');
  assert.equal(s.longest, 10);
});

test('updateStreak starts a streak from empty state', () => {
  const s = xp.updateStreak({ current: 0, longest: 0, lastDay: null }, '2026-09-02');
  assert.deepEqual(s, { current: 1, longest: 1, lastDay: '2026-09-02' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/xp.test.mjs`
Expected: FAIL — `Cannot find module '../js/models/xp.js'`

- [ ] **Step 3: Implement**

Create `js/models/xp.js`:

```js
const DAY = 86400000;

export function xpToNext(level) { return 500 + 250 * (level - 1); }

/** Total XP required to have reached `level`. Level 1 starts at 0. */
export function cumulativeXp(level) {
  const n = level - 1;
  return 500 * n + 250 * (n * (n - 1)) / 2;
}

export function levelFromXp(total) {
  let level = 1;
  while (total >= cumulativeXp(level + 1)) level++;
  return { level, into: total - cumulativeXp(level), need: xpToNext(level) };
}

export function streakMultiplier(streak) {
  return 1 + Math.min(Math.max(streak, 0), 30) / 60;
}

const BASE = {
  study:     ctx => ctx.minutes,
  capture:   ctx => 50 * ctx.level,
  rescue:    () => 75,
  gradeLog:  () => 100,
  firstNote: () => 25,
};

export function award(kind, ctx = {}, streak = 0) {
  const fn = BASE[kind];
  if (!fn) throw new Error(`Unknown XP award: ${kind}`);
  return Math.round(fn(ctx) * streakMultiplier(streak));
}

/** `today` is a local YYYY-MM-DD string so streaks follow the user's day, not UTC. */
export function updateStreak(streak, today) {
  const s = streak ?? { current: 0, longest: 0, lastDay: null };
  if (s.lastDay === today) return { ...s };
  const gap = s.lastDay ? Math.round((Date.parse(today) - Date.parse(s.lastDay)) / DAY) : null;
  const current = gap === 1 ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastDay: today };
}

export function localDay(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/xp.test.mjs`
Expected: PASS, 11 tests

- [ ] **Step 5: Run the whole suite**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/`
Expected: PASS, 33 tests total

- [ ] **Step 6: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add js/models/xp.js tests/xp.test.mjs && git commit -m "feat: XP curve, award table and streak tracking"
```

---

## Task 5: Syllabus loader

**Files:**
- Create: `js/syllabus.js`
- Test: `tests/syllabus.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/syllabus.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, nodeId, nodesFor, allNodeIds, phaseFilter } from '../js/syllabus.js';

function load() {
  const reg = JSON.parse(readFileSync('data/subjects.json', 'utf8'));
  const trees = reg.subjects.map(s =>
    JSON.parse(readFileSync(`data/syllabus/${s.id}.json`, 'utf8')));
  return buildIndex(reg, trees);
}

test('nodeId joins subject and code', () => {
  assert.equal(nodeId('math-aa-hl', '5.7'), 'math-aa-hl:5.7');
});

test('every subject in the registry has a loaded tree', () => {
  const idx = load();
  assert.equal(idx.subjects.length, 6);
  for (const s of idx.subjects) assert.ok(nodesFor(idx, s.id).length > 0, `${s.id} has no nodes`);
});

test('allNodeIds is unique across every subject', () => {
  const idx = load();
  const ids = allNodeIds(idx);
  assert.equal(new Set(ids).size, ids.length);
});

test('SL subjects contain no AHL nodes', () => {
  const idx = load();
  for (const s of idx.subjects.filter(s => s.level === 'SL')) {
    assert.equal(nodesFor(idx, s.id).filter(n => n.tier === 'AHL').length, 0, `${s.id}`);
  }
});

test('HL subjects contain at least one AHL node', () => {
  const idx = load();
  for (const s of idx.subjects.filter(s => s.level === 'HL')) {
    assert.ok(nodesFor(idx, s.id).some(n => n.tier === 'AHL'), `${s.id}`);
  }
});

test('phaseFilter narrows to a single DP year', () => {
  const idx = load();
  const all = nodesFor(idx, 'math-aa-hl');
  const dp1 = phaseFilter(all, 'DP1');
  assert.ok(dp1.length > 0);
  assert.ok(dp1.length < all.length);
  assert.ok(dp1.every(n => n.phase === 'DP1'));
});

test('every node carries a resolved id and subjectId', () => {
  const idx = load();
  for (const n of nodesFor(idx, 'physics-hl')) {
    assert.equal(n.subjectId, 'physics-hl');
    assert.equal(n.id, `physics-hl:${n.code}`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/syllabus.test.mjs`
Expected: FAIL — `Cannot find module '../js/syllabus.js'`

- [ ] **Step 3: Implement**

Create `js/syllabus.js`:

```js
export function nodeId(subjectId, code) { return `${subjectId}:${code}`; }

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

  return { session: registry.session, dpStart: registry.dpStart, subjects: registry.subjects, bySubject, byId };
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

export function allNodeIds(index) {
  return [...index.byId.keys()];
}

export function phaseFilter(nodes, phase) {
  return phase ? nodes.filter(n => n.phase === phase) : nodes;
}

/** Browser-side loader. Node tests build the index from disk instead. */
export async function loadIndex(base = '.') {
  const registry = await (await fetch(`${base}/data/subjects.json`)).json();
  const trees = await Promise.all(
    registry.subjects.map(s => fetch(`${base}/data/syllabus/${s.id}.json`).then(r => r.json()))
  );
  return buildIndex(registry, trees);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/syllabus.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add js/syllabus.js tests/syllabus.test.mjs && git commit -m "feat: syllabus index with phase filtering"
```

---

## Task 6: Themes and shell

**Files:**
- Create: `assets/css/tokens.css`, `assets/css/base.css`, `assets/css/components.css`
- Create: `index.html`

- [ ] **Step 1: Write the theme tokens**

Create `assets/css/tokens.css`. Five themes; `glass` is the default applied to bare `:root`, the
other four under `[data-theme="…"]`. Values come from `design/palettes.html` — copy them exactly.

```css
:root,
:root[data-theme="glass"] {
  --bg:#EFF2F6; --panel:#0E1520; --panel-text:#E9EFF6; --panel-dim:#7C8B9E;
  --chrome:#FFFFFF; --chrome-text:#0F172A; --chrome-line:#E1E6EC;
  --line:#DFE4EA; --panel-line:#22303F; --track:#1A2431;
  --text:#0F172A; --dim:#5B6675;
  --accent:#00C2A8; --accent-2:#7AA2FF; --ok:#34D399; --warn:#FFB020; --bad:#FB7185;
  --gs:12px;
  --elev:0 1px 2px rgba(16,24,40,.05), 0 12px 32px -10px rgba(16,24,40,.18);
  --elev-sm:0 2px 10px -4px rgba(16,24,40,.28);
  --s1:#5AC8FA; --s2:#A78BFA; --s3:#34D399; --s4:#FBBF24; --s5:#FB7185; --s6:#22D3EE;
}

:root[data-theme="daylight"] {
  --bg:#F4F6F9; --panel:#FFFFFF; --panel-text:#0F172A; --panel-dim:#64748B;
  --chrome:#FFFFFF; --chrome-text:#0F172A; --chrome-line:#E4E9EF;
  --line:#E4E9EF; --panel-line:#E7EBF0; --track:#EDF1F6;
  --text:#0F172A; --dim:#64748B;
  --accent:#0A84FF; --accent-2:#5E5CE6; --ok:#30D158; --warn:#FF9F0A; --bad:#FF375F;
  --gs:0px;
  --elev:0 1px 2px rgba(16,24,40,.05), 0 8px 24px -8px rgba(16,24,40,.12);
  --elev-sm:0 1px 2px rgba(16,24,40,.04);
  --s1:#0A84FF; --s2:#5E5CE6; --s3:#30D158; --s4:#FF9F0A; --s5:#FF375F; --s6:#00C7BE;
}

:root[data-theme="cabin"] {
  --bg:#F7F5F1; --panel:#FFFFFF; --panel-text:#1C1A17; --panel-dim:#7A736A;
  --chrome:#FFFDFA; --chrome-text:#1C1A17; --chrome-line:#E9E3DA;
  --line:#E9E3DA; --panel-line:#EDE8E0; --track:#F0ECE5;
  --text:#1C1A17; --dim:#7A736A;
  --accent:#0B6BCB; --accent-2:#7A5AF8; --ok:#2E9E5B; --warn:#D97706; --bad:#DC2F55;
  --gs:0px;
  --elev:0 1px 2px rgba(16,24,40,.05), 0 8px 24px -8px rgba(16,24,40,.12);
  --elev-sm:0 1px 2px rgba(16,24,40,.04);
  --s1:#0B6BCB; --s2:#7A5AF8; --s3:#2E9E5B; --s4:#D97706; --s5:#DC2F55; --s6:#0E9AA7;
}

:root[data-theme="horizon"] {
  --bg:#EDF3FB; --panel:#FFFFFF; --panel-text:#0B1B2B; --panel-dim:#5C7186;
  --chrome:#FFFFFF; --chrome-text:#0B1B2B; --chrome-line:#DCE7F5;
  --line:#DCE7F5; --panel-line:#E3EBF6; --track:#E8F0FA;
  --text:#0B1B2B; --dim:#5C7186;
  --accent:#1273EA; --accent-2:#7C4DFF; --ok:#17B26A; --warn:#F79009; --bad:#F04438;
  --gs:0px;
  --elev:0 1px 2px rgba(16,24,40,.05), 0 8px 24px -8px rgba(16,24,40,.12);
  --elev-sm:0 1px 2px rgba(16,24,40,.04);
  --s1:#1273EA; --s2:#7C4DFF; --s3:#17B26A; --s4:#F79009; --s5:#F04438; --s6:#06AED4;
}

:root[data-theme="instrument"] {
  --bg:#FFFFFF; --panel:#FFFFFF; --panel-text:#000000; --panel-dim:#6B7684;
  --chrome:#FAFBFC; --chrome-text:#000000; --chrome-line:#D5DBE3;
  --line:#D5DBE3; --panel-line:#DDE2E9; --track:#EFF2F6;
  --text:#000000; --dim:#6B7684;
  --accent:#0057FF; --accent-2:#6E00FF; --ok:#00A650; --warn:#FF8A00; --bad:#E5002B;
  --gs:0px;
  --elev:0 0 0 1px rgba(16,24,40,.04); --elev-sm:none;
  --s1:#0057FF; --s2:#6E00FF; --s3:#00A650; --s4:#FF8A00; --s5:#E5002B; --s6:#00A3AD;
}
```

- [ ] **Step 2: Write base styles**

Create `assets/css/base.css`:

```css
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--bg);color:var(--text);
  font-family:ui-sans-serif,-apple-system,"SF Pro Text",Inter,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace}
.hidden{display:none !important}
.app{max-width:1240px;margin:0 auto;padding:0 20px 96px}

.topbar{
  display:flex;align-items:center;gap:16px;padding:14px 20px;
  background:var(--chrome);color:var(--chrome-text);border-bottom:1px solid var(--chrome-line);
  position:sticky;top:0;z-index:10;
}
.topbar nav{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap}
.topbar nav a{
  font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:11px;letter-spacing:.12em;
  text-transform:uppercase;text-decoration:none;color:var(--dim);
  padding:7px 11px;border-radius:8px;
}
.topbar nav a[aria-current="page"]{background:var(--track);color:var(--accent)}
```

- [ ] **Step 3: Write component styles**

Create `assets/css/components.css` with the panel, subject-gauge, node and timer classes. Port them
verbatim from `design/palettes.html` (`.panel`, `.panel-h`, `.sub`, `.sub-*`, `.quest`, `.legend`,
`.heat`, `.streak`, `.alert`, `.agent`), replacing the inline `--panelText`/`--panelDim`/`--panelLine`
custom property names with the hyphenated `--panel-text`/`--panel-dim`/`--panel-line` used in
`tokens.css`. Add one new block for syllabus nodes:

```css
.node{
  display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;
  border:1px solid var(--panel-line);background:var(--panel);color:var(--panel-text);
  cursor:pointer;width:100%;text-align:left;font:inherit;font-size:13px;
}
.node:hover{border-color:var(--c)}
.node-pip{width:9px;height:9px;border-radius:50%;flex:none;background:var(--track)}
.node[data-state="fresh"]    .node-pip{background:var(--c);box-shadow:0 0 var(--gs) var(--c)}
.node[data-state="dimming"]  .node-pip{background:var(--c);opacity:.55}
.node[data-state="fading"]   .node-pip{background:transparent;box-shadow:inset 0 0 0 2px var(--warn)}
.node[data-state="lapsed"]   .node-pip{background:var(--bad)}
.node-code{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--panel-dim);min-width:34px}
.node-title{flex:1}
.node-lvl{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:var(--panel-dim);
  border:1px solid var(--panel-line);border-radius:4px;padding:1px 5px}
.node[data-tier="AHL"] .node-code::after{content:" HL";color:var(--c);font-weight:700}
```

- [ ] **Step 4: Write the shell**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en" data-theme="glass">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IB Cockpit</title>
<link rel="stylesheet" href="assets/css/tokens.css">
<link rel="stylesheet" href="assets/css/base.css">
<link rel="stylesheet" href="assets/css/components.css">
<script>
  // Apply the saved theme before first paint to avoid a flash.
  try {
    const s = JSON.parse(localStorage.getItem('ibc:settings') || '{}');
    if (s.theme) document.documentElement.dataset.theme = s.theme;
  } catch {}
</script>
</head>
<body>
  <header class="topbar">
    <strong>IB Cockpit</strong>
    <span class="mono" id="countdown"></span>
    <nav>
      <a href="#/">Command</a>
      <a href="#/subjects">Subjects</a>
      <a href="#/log">Log</a>
    </nav>
  </header>
  <main class="app" id="view"></main>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Verify it serves and the theme applies**

Run: `cd "/Users/eduardokato/IB Portfolio" && python3 -m http.server 4321 &` then open
`http://localhost:4321/`.
Expected: page background is `#EFF2F6`, the topbar is white, no console errors other than
`js/main.js` 404 (created in Task 9).

- [ ] **Step 6: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add index.html assets/ && git commit -m "feat: shell, five themes and component styles"
```

---

## Task 7: State layer and router

**Files:**
- Create: `js/state.js`, `js/router.js`
- Test: `tests/state.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/state.test.mjs`:

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { createState } from '../js/state.js';

function memoryBackend() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

beforeEach(() => store.setBackend(memoryBackend()));

test('state hydrates defaults when storage is empty', () => {
  const s = createState();
  assert.deepEqual(s.get('mastery'), {});
  assert.deepEqual(s.get('sessions'), []);
  assert.deepEqual(s.get('xp').streak, { current: 0, longest: 0, lastDay: null });
});

test('set persists through the store', () => {
  const s = createState();
  s.set('mastery', { 'a:1': { level: 2, lastTouched: null, touches: 1 } });
  assert.deepEqual(store.read('mastery', null), { 'a:1': { level: 2, lastTouched: null, touches: 1 } });
});

test('subscribers fire on the key they subscribed to', () => {
  const s = createState();
  let calls = 0;
  s.subscribe('mastery', () => calls++);
  s.set('mastery', {});
  assert.equal(calls, 1);
});

test('subscribers do not fire for unrelated keys', () => {
  const s = createState();
  let calls = 0;
  s.subscribe('mastery', () => calls++);
  s.set('sessions', []);
  assert.equal(calls, 0);
});

test('unsubscribe stops delivery', () => {
  const s = createState();
  let calls = 0;
  const off = s.subscribe('xp', () => calls++);
  off();
  s.set('xp', { total: 1 });
  assert.equal(calls, 0);
});

test('a fresh state reads back what a previous one persisted', () => {
  createState().set('sessions', [{ id: 'x', minutes: 20 }]);
  assert.deepEqual(createState().get('sessions'), [{ id: 'x', minutes: 20 }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/state.test.mjs`
Expected: FAIL — `Cannot find module '../js/state.js'`

- [ ] **Step 3: Implement state**

Create `js/state.js`:

```js
import * as store from './store.js';

export const DEFAULTS = {
  meta:      { schema: store.SCHEMA, session: '2028-05', dpStart: '2026-08', targetPoints: 45 },
  mastery:   {},
  sessions:  [],
  notes:     {},
  deadlines: [],
  grades:    [],
  xp:        { total: 0, bySubject: {}, streak: { current: 0, longest: 0, lastDay: null } },
  settings:  { theme: 'glass', colorOverrides: {}, coachTone: 'honest', backupLastAt: null },
};

export function createState() {
  const cache = {};
  const subs = new Map();

  for (const [k, v] of Object.entries(DEFAULTS)) {
    cache[k] = store.read(k, structuredClone(v));
  }

  function get(key) { return cache[key]; }

  function set(key, value) {
    cache[key] = value;
    store.write(key, value);
    for (const fn of subs.get(key) ?? []) fn(value);
  }

  /** Read-modify-write helper so callers never forget to persist. */
  function update(key, fn) { set(key, fn(structuredClone(cache[key]))); }

  function subscribe(key, fn) {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(fn);
    return () => subs.get(key).delete(fn);
  }

  return { get, set, update, subscribe };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/state.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Implement the router**

Create `js/router.js`:

```js
/**
 * Hash router. Routes are declared as patterns with `:param` segments,
 * e.g. '/subject/:id'. The first match wins; '*' is the fallback.
 */
export function createRouter(routes, mount) {
  function parse() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const parts = raw.split('/').filter(Boolean);

    for (const [pattern, handler] of Object.entries(routes)) {
      if (pattern === '*') continue;
      const pp = pattern.split('/').filter(Boolean);
      if (pp.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < pp.length; i++) {
        if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(parts[i]);
        else if (pp[i] !== parts[i]) { ok = false; break; }
      }
      if (ok) return { handler, params, path: raw };
    }
    return { handler: routes['*'], params: {}, path: raw };
  }

  async function render() {
    const { handler, params, path } = parse();
    mount.innerHTML = '';
    for (const a of document.querySelectorAll('.topbar nav a')) {
      const href = a.getAttribute('href').replace(/^#/, '');
      a.toggleAttribute('aria-current', href === path);
      if (href === path) a.setAttribute('aria-current', 'page');
    }
    if (handler) await handler(mount, params);
  }

  addEventListener('hashchange', render);
  return { render };
}
```

- [ ] **Step 6: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add js/state.js js/router.js tests/state.test.mjs && git commit -m "feat: persisted state with pub/sub and a hash router"
```

---

## Task 8: Subject view with capture

**Files:**
- Create: `js/views/subject.js`

- [ ] **Step 1: Implement the view**

Create `js/views/subject.js`:

```js
import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import { nodesFor, topicsFor, subject as findSubject, phaseFilter } from '../syllabus.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function subjectList(mount, { index, state }) {
  const records = state.get('mastery');
  const grid = el('div', 'subs');

  for (const s of index.subjects) {
    const ids = nodesFor(index, s.id).map(n => n.id);
    const pct = Math.round(mastery.subjectProgress(ids, records) * 100);
    const captured = ids.filter(id => (records[id]?.level ?? 0) > 0).length;

    const card = el('a', 'sub');
    card.href = `#/subject/${s.id}`;
    card.style.setProperty('--c', `var(--${s.colorKey})`);
    card.innerHTML = `
      <div class="sub-top">
        <span class="sub-dot"></span>
        <span class="sub-name">${s.short}</span>
        <span class="sub-hl">${s.level}</span>
        <span class="sub-lvl">${s.callsign}</span>
      </div>
      <div class="sub-track"><div class="sub-fill" style="width:${pct}%"></div></div>
      <div class="sub-meta"><span>${captured}/${ids.length} nodes</span><b>${pct}%</b></div>`;
    grid.append(card);
  }
  mount.append(grid);
}

export function subjectDetail(mount, { index, state }, { id }) {
  const s = findSubject(index, id);
  if (!s) { mount.append(el('p', null, 'Unknown subject.')); return; }

  const head = el('div', 'panel');
  head.append(el('h1', null, `${s.name} ${s.level}`));
  mount.append(head);

  const phaseBar = el('div', 'panel');
  let phase = null;
  for (const p of [null, 'DP1', 'DP2']) {
    const b = el('button', 'chip', p ?? 'All');
    b.onclick = () => { phase = p; draw(); };
    phaseBar.append(b);
  }
  mount.append(phaseBar);

  const body = el('div');
  mount.append(body);

  function draw() {
    body.innerHTML = '';
    const records = state.get('mastery');

    for (const topic of topicsFor(index, s.id)) {
      const nodes = phaseFilter(
        nodesFor(index, s.id).filter(n => n.topicCode === topic.code), phase);
      if (!nodes.length) continue;

      const panel = el('div', 'panel');
      panel.style.setProperty('--c', `var(--${s.colorKey})`);
      panel.append(el('p', 'panel-h', `${topic.code} · ${topic.title}`));

      for (const n of nodes) {
        const rec = records[n.id] ?? mastery.emptyRecord();
        const days = mastery.daysSince(rec.lastTouched);
        const btn = el('button', 'node');
        btn.dataset.state = mastery.stateOf(rec.level, days);
        btn.dataset.tier = n.tier;
        btn.innerHTML = `
          <span class="node-pip"></span>
          <span class="node-code">${n.code}</span>
          <span class="node-title">${n.title}</span>
          <span class="node-lvl">${mastery.LEVELS[rec.level]}</span>`;
        btn.onclick = () => captureNode(n, state, draw);
        panel.append(btn);
      }
      body.append(panel);
    }
  }

  draw();
}

function captureNode(node, state, redraw) {
  const now = Date.now();
  let earned = 0;

  state.update('mastery', m => {
    const before = m[node.id] ?? mastery.emptyRecord();
    const after = mastery.capture(before, now);
    earned = after.level > before.level
      ? xp.award('capture', { level: after.level }, state.get('xp').streak.current)
      : xp.award('rescue', {}, state.get('xp').streak.current);
    m[node.id] = after;
    return m;
  });

  state.update('xp', x => {
    x.total += earned;
    x.bySubject[node.subjectId] = (x.bySubject[node.subjectId] ?? 0) + earned;
    return x;
  });

  redraw();
}
```

- [ ] **Step 2: Add the chip style**

Append to `assets/css/components.css`:

```css
.chip{
  font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.12em;
  text-transform:uppercase;padding:6px 12px;margin-right:6px;border-radius:8px;
  border:1px solid var(--panel-line);background:transparent;color:var(--panel-dim);cursor:pointer;
}
.chip:hover{color:var(--accent);border-color:var(--accent)}
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add js/views/subject.js assets/css/components.css && git commit -m "feat: subject list and syllabus tree with node capture"
```

---

## Task 9: Log view with focus timer

**Files:**
- Create: `js/views/log.js`, `js/main.js`

- [ ] **Step 1: Implement the log view**

Create `js/views/log.js`:

```js
import * as xp from '../models/xp.js';
import * as mastery from '../models/mastery.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let ticking = null;

export function logView(mount, { index, state }) {
  const timer = el('div', 'panel');
  timer.append(el('p', 'panel-h', 'Focus timer'));

  const pick = el('select', 'chip');
  for (const s of index.subjects) {
    const o = el('option', null, `${s.short} ${s.level}`);
    o.value = s.id;
    pick.append(o);
  }

  const readout = el('div', 'timer-readout mono', '00:00');
  const start = el('button', 'chip', 'Start');
  const stop = el('button', 'chip', 'Stop & log');
  stop.disabled = true;

  let startedAt = null;

  start.onclick = () => {
    startedAt = Date.now();
    start.disabled = true;
    stop.disabled = false;
    ticking = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      readout.textContent =
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
  };

  stop.onclick = () => {
    clearInterval(ticking);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    commitSession(state, { subjectId: pick.value, minutes, note: '', source: 'timer' });
    startedAt = null;
    start.disabled = false;
    stop.disabled = true;
    readout.textContent = '00:00';
    render();
  };

  timer.append(pick, readout, start, stop);
  mount.append(timer);

  const manual = el('div', 'panel');
  manual.append(el('p', 'panel-h', 'Manual entry'));
  const mPick = pick.cloneNode(true);
  const mins = el('input', 'chip'); mins.type = 'number'; mins.min = '1'; mins.value = '30';
  const note = el('input', 'chip'); note.type = 'text'; note.placeholder = 'What did you actually learn?';
  const add = el('button', 'chip', 'Log it');
  add.onclick = () => {
    commitSession(state, {
      subjectId: mPick.value,
      minutes: Math.max(1, Number(mins.value) || 0),
      note: note.value,
      source: 'manual',
    });
    note.value = '';
    render();
  };
  manual.append(mPick, mins, note, add);
  mount.append(manual);

  const history = el('div');
  mount.append(history);

  function render() {
    history.innerHTML = '';
    const panel = el('div', 'panel');
    panel.append(el('p', 'panel-h', 'Recent sessions'));
    const sessions = [...state.get('sessions')].reverse().slice(0, 30);
    if (!sessions.length) panel.append(el('p', null, 'Nothing logged yet.'));
    for (const s of sessions) {
      const subj = index.subjects.find(x => x.id === s.subjectId);
      const row = el('div', 'node');
      row.style.setProperty('--c', `var(--${subj?.colorKey ?? 's1'})`);
      row.innerHTML = `
        <span class="node-pip"></span>
        <span class="node-code">${new Date(s.ts).toLocaleDateString()}</span>
        <span class="node-title">${subj?.short ?? s.subjectId}${s.note ? ' — ' + s.note : ''}</span>
        <span class="node-lvl">${s.minutes}m</span>`;
      panel.append(row);
    }
    history.append(panel);
  }

  render();
}

export function commitSession(state, { subjectId, minutes, note, source }) {
  const today = xp.localDay();
  const streak = xp.updateStreak(state.get('xp').streak, today);
  const earned = xp.award('study', { minutes }, streak.current);

  state.update('sessions', list => {
    list.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      subjectId, minutes, note, source, nodeIds: [],
    });
    return list;
  });

  state.update('xp', x => {
    x.total += earned;
    x.bySubject[subjectId] = (x.bySubject[subjectId] ?? 0) + earned;
    x.streak = streak;
    return x;
  });

  return earned;
}
```

- [ ] **Step 2: Add timer styles**

Append to `assets/css/components.css`:

```css
.timer-readout{
  font-size:44px;letter-spacing:-.03em;color:var(--panel-text);
  margin:12px 0;font-variant-numeric:tabular-nums;
}
```

- [ ] **Step 3: Wire the entry point**

Create `js/main.js`:

```js
import { loadIndex } from './syllabus.js';
import { createState } from './state.js';
import { createRouter } from './router.js';
import * as mastery from './models/mastery.js';
import { subjectList, subjectDetail } from './views/subject.js';
import { logView } from './views/log.js';

const state = createState();
const index = await loadIndex('.');

// Run decay once per boot so a long absence is reflected the moment you return.
state.set('mastery', mastery.decayAll(state.get('mastery')));

document.documentElement.dataset.theme = state.get('settings').theme ?? 'glass';

const EXAM_START = Date.parse('2028-04-28T00:00:00Z');
document.getElementById('countdown').textContent =
  `M28 · ${Math.max(0, Math.ceil((EXAM_START - Date.now()) / 86400000))} days`;

const ctx = { index, state };

const router = createRouter({
  '/':             m => subjectList(m, ctx),
  '/subjects':     m => subjectList(m, ctx),
  '/subject/:id':  (m, p) => subjectDetail(m, ctx, p),
  '/log':          m => logView(m, ctx),
  '*':             m => { m.textContent = 'Not found.'; },
}, document.getElementById('view'));

router.render();
```

The `/` route points at the subject list for now. Task 10 replaces it with the Command Center once
`js/views/command.js` exists — importing it here before then would break the boot.

- [ ] **Step 4: Verify the app boots**

Run: `cd "/Users/eduardokato/IB Portfolio" && python3 -m http.server 4321` and open
`http://localhost:4321/`.
Expected: six subject gauges at 0%, `#/log` starts and stops the timer, a session row appears, and
the values survive a reload. Console clean.

- [ ] **Step 5: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add js/views/log.js js/main.js assets/css/components.css && git commit -m "feat: focus timer, manual logging and session history"
```

---

## Task 10: Command Center and Primary Flight Display

**Files:**
- Create: `js/ui/pfd.js`, `js/views/command.js`

- [ ] **Step 1: Write the failing PFD tests**

Create `tests/pfd.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paceRatio, bankAngle } from '../js/ui/pfd.js';

test('paceRatio is 1 when captured matches expected', () => {
  assert.equal(paceRatio(0.5, 0.5), 1);
});

test('paceRatio exceeds 1 when ahead of schedule', () => {
  assert.ok(paceRatio(0.6, 0.5) > 1);
});

test('paceRatio is 0 before any expectation exists', () => {
  assert.equal(paceRatio(0.2, 0), 0);
});

test('bankAngle is level when on pace', () => {
  assert.equal(bankAngle(1), 0);
});

test('bankAngle banks negative when behind and positive when ahead', () => {
  assert.ok(bankAngle(0.5) < 0);
  assert.ok(bankAngle(1.5) > 0);
});

test('bankAngle clamps to +/- 30 degrees', () => {
  assert.equal(bankAngle(0), -30);
  assert.equal(bankAngle(99), 30);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/pfd.test.mjs`
Expected: FAIL — `Cannot find module '../js/ui/pfd.js'`

- [ ] **Step 3: Implement the PFD**

Create `js/ui/pfd.js`:

```js
/** Fraction of the DP elapsed, 0..1. */
export function courseElapsed(dpStart, examStart, now = Date.now()) {
  const a = Date.parse(dpStart + '-01');
  const b = Date.parse(examStart);
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

/** captured / expected. 1 means exactly on schedule. */
export function paceRatio(captured, expected) {
  if (expected <= 0) return 0;
  return captured / expected;
}

/** The horizon banks with pace: level on schedule, rolled when off it. Clamped to ±30°. */
export function bankAngle(ratio) {
  return Math.max(-30, Math.min(30, (ratio - 1) * 60));
}

export function renderPFD({ captured, expected, hoursPerWeek, daysToExam }) {
  const ratio = paceRatio(captured, expected);
  const bank = bankAngle(ratio);
  const horizonY = 90;

  return `
  <div class="pfd">
    <svg viewBox="0 0 320 180" role="img" aria-label="Primary flight display">
      <defs><clipPath id="pfdClip"><rect x="0" y="0" width="320" height="180" rx="12"/></clipPath></defs>
      <g clip-path="url(#pfdClip)">
        <g transform="rotate(${bank.toFixed(2)} 160 ${horizonY})">
          <rect x="-120" y="-120" width="560" height="${horizonY + 120}" fill="var(--accent-2)" opacity=".25"/>
          <rect x="-120" y="${horizonY}" width="560" height="320" fill="var(--warn)" opacity=".18"/>
          <line x1="-120" y1="${horizonY}" x2="440" y2="${horizonY}"
                stroke="var(--panel-text)" stroke-width="2"/>
        </g>
        <path d="M120 ${horizonY} h30 l10 10 l10 -10 h30" fill="none"
              stroke="var(--accent)" stroke-width="3"/>
      </g>
      <rect x="0.5" y="0.5" width="319" height="179" rx="12"
            fill="none" stroke="var(--panel-line)"/>
    </svg>
    <div class="pfd-readouts mono">
      <span><b>${hoursPerWeek.toFixed(1)}</b>h/wk<i>airspeed</i></span>
      <span><b>${Math.round(captured * 100)}</b>%<i>altitude</i></span>
      <span><b>${daysToExam}</b>d<i>heading</i></span>
      <span><b>${ratio ? (ratio * 100).toFixed(0) : '—'}</b>%<i>on pace</i></span>
    </div>
  </div>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/pfd.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Implement the Command Center**

Create `js/views/command.js`:

```js
import * as mastery from '../models/mastery.js';
import * as xp from '../models/xp.js';
import { renderPFD, courseElapsed } from '../ui/pfd.js';
import { allNodeIds } from '../syllabus.js';

const EXAM_START = '2028-04-28T00:00:00Z';
const DAY = 86400000;

export function commandView(mount, { index, state }) {
  const records = state.get('mastery');
  const sessions = state.get('sessions');
  const x = state.get('xp');

  const ids = allNodeIds(index);
  const captured = mastery.subjectProgress(ids, records);
  const expected = courseElapsed(index.dpStart, EXAM_START);
  const daysToExam = Math.max(0, Math.ceil((Date.parse(EXAM_START) - Date.now()) / DAY));

  const cutoff = Date.now() - 28 * DAY;
  const recentMinutes = sessions
    .filter(s => Date.parse(s.ts) >= cutoff)
    .reduce((a, s) => a + s.minutes, 0);
  const hoursPerWeek = recentMinutes / 60 / 4;

  const pfd = document.createElement('div');
  pfd.className = 'panel';
  pfd.innerHTML = renderPFD({ captured, expected, hoursPerWeek, daysToExam });
  mount.append(pfd);

  const lvl = xp.levelFromXp(x.total);
  const rail = document.createElement('div');
  rail.className = 'panel';
  rail.innerHTML = `
    <div class="xp">
      <span class="xp-lvl mono">LEVEL <b>${lvl.level}</b></span>
      <div class="xp-track"><div class="xp-fill" style="width:${(lvl.into / lvl.need) * 100}%"></div></div>
      <span class="xp-num mono">${lvl.into.toLocaleString()} / ${lvl.need.toLocaleString()} XP</span>
    </div>
    <div class="streak mono"><b>${x.streak.current}</b>
      <span>DAY STREAK · LONGEST ${x.streak.longest}</span></div>`;
  mount.append(rail);

  mount.append(coachPanel(index, records, sessions, captured, expected));
}

/** Brutally honest, as specified. States the worst true thing first. */
function coachPanel(index, records, sessions, captured, expected) {
  const p = document.createElement('div');
  p.className = 'alert';
  const lines = [];

  const fading = mastery.rescueQueue(allNodeIds(index), records);
  if (fading.length) {
    const worst = index.byId.get(fading[0].id);
    lines.push(`<b>${fading.length} topic${fading.length > 1 ? 's are' : ' is'} fading.</b>
      ${worst.title} hasn't been touched in ${Math.round(fading[0].days)} days.`);
  }

  let coldest = null;
  for (const s of index.subjects) {
    const last = sessions.filter(v => v.subjectId === s.id).at(-1);
    const days = last ? (Date.now() - Date.parse(last.ts)) / DAY : Infinity;
    if (!coldest || days > coldest.days) coldest = { s, days };
  }
  if (coldest && coldest.days > 7) {
    lines.push(coldest.days === Infinity
      ? `<b>You have never logged ${coldest.s.short}.</b>`
      : `<b>You haven't opened ${coldest.s.short} in ${Math.round(coldest.days)} days.</b>`);
  }

  if (expected > 0 && captured < expected * 0.9) {
    lines.push(`You are <b>${Math.round((1 - captured / expected) * 100)}% behind pace</b>
      for this point in the DP.`);
  }

  p.innerHTML = `<div class="alert-t">${lines.join(' ') || 'On pace. Nothing is fading. Keep flying.'}</div>`;
  return p;
}
```

- [ ] **Step 6: Point the `/` route at the Command Center**

Modify `js/main.js`. Add this import beneath the `logView` import:

```js
import { commandView } from './views/command.js';
```

…and change the `/` route from `subjectList` to `commandView`:

```js
  '/':             m => commandView(m, ctx),
```

- [ ] **Step 7: Add PFD styles**

Append to `assets/css/components.css`:

```css
.pfd svg{width:100%;max-width:420px;height:auto;display:block}
.pfd-readouts{display:flex;gap:22px;margin-top:14px;flex-wrap:wrap}
.pfd-readouts span{display:flex;flex-direction:column;font-size:11px;color:var(--panel-dim)}
.pfd-readouts b{font-size:22px;color:var(--panel-text);letter-spacing:-.02em;
  font-variant-numeric:tabular-nums}
.pfd-readouts i{font-style:normal;font-size:9px;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
```

- [ ] **Step 8: Verify the whole app in the browser**

Run: `cd "/Users/eduardokato/IB Portfolio" && python3 -m http.server 4321` and open
`http://localhost:4321/`.

Check, in order:
1. Command Center loads with a PFD banked downward (you are 0% captured, so behind pace).
2. `#/subjects` shows six gauges at 0%.
3. Open Math AA, click a node — its pip lights, the level chip reads `Seen`, XP increases.
4. `#/log` — start the timer, wait 60s, stop, confirm a session row appears and the streak is 1.
5. Reload — every value persists.
6. Console is clean.

- [ ] **Step 9: Run the full suite**

Run: `cd "/Users/eduardokato/IB Portfolio" && node --test tests/`
Expected: PASS, 52 tests

- [ ] **Step 10: Commit**

```bash
cd "/Users/eduardokato/IB Portfolio" && git add js/ui/pfd.js js/views/command.js tests/pfd.test.mjs assets/css/components.css && git commit -m "feat: Command Center with pace-banking primary flight display and coach"
```

---

## Task 11: Deploy

**Files:**
- Create: `.nojekyll`

- [ ] **Step 1: Disable Jekyll processing**

```bash
cd "/Users/eduardokato/IB Portfolio" && touch .nojekyll && git add .nojekyll && git commit -m "chore: disable Jekyll on GitHub Pages"
```

- [ ] **Step 2: Create the remote and push**

Eduardo runs this — it needs his GitHub account:

```bash
cd "/Users/eduardokato/IB Portfolio" && gh repo create ib-cockpit --public --source=. --push
```

- [ ] **Step 3: Enable Pages**

```bash
cd "/Users/eduardokato/IB Portfolio" && gh api -X POST repos/:owner/ib-cockpit/pages -f "source[branch]=main" -f "source[path]=/"
```

- [ ] **Step 4: Verify the deployed site**

Open `https://<username>.github.io/ib-cockpit/`. Confirm the syllabus loads (the `fetch` calls in
`loadIndex` are relative, so they resolve under the repo subpath) and no console errors appear.

---

## What Plan 1 deliberately leaves out

Quests, the territory map, deadlines, TOK/EE/CAS, the grade engine, the recommendation engine, the
crew briefs, the resources hub, notes, the passcode gate and export/import UI. These are Plans 2
and 3. Plan 1 stops at the point where the app is genuinely usable every day.
