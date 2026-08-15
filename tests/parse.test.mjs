import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/**
 * Every module must parse as a module.
 *
 * `node --check` parses as a CommonJS script and exits 0 on things that are
 * fatal in an ES module — a duplicate `const` at module scope among them. That
 * is not hypothetical: a redeclared binding passed --check and only surfaced as
 * a blank cockpit in the browser. SourceTextModule uses the real module grammar.
 *
 * Requires --experimental-vm-modules; without it the test says so rather than
 * passing silently on nothing.
 */

function modules(dir = 'js') {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...modules(p));
    else if (e.endsWith('.js')) out.push(p);
  }
  return out;
}

const FILES = [...modules(), 'sw.js'];

test('there are modules to check at all', () => {
  assert.ok(FILES.length > 20, `only found ${FILES.length} modules`);
});

test('every module parses under the ES module grammar', { skip: !vm.SourceTextModule
  && 'needs --experimental-vm-modules' }, () => {
  const broken = [];
  for (const f of FILES) {
    try {
      new vm.SourceTextModule(readFileSync(f, 'utf8'), { identifier: f });
    } catch (e) {
      broken.push(`${f}: ${e.message}`);
    }
  }
  assert.deepEqual(broken, [], `\n${broken.join('\n')}`);
});

test('the checker really does catch what --check misses', { skip: !vm.SourceTextModule
  && 'needs --experimental-vm-modules' }, () => {
  assert.throws(
    () => new vm.SourceTextModule('const a = 1; const a = 2;', { identifier: 'canary' }),
    /already been declared/,
    'if this stops throwing, the guard above is checking nothing');
});

test('every module import resolves to a file that exists', () => {
  const missing = [];
  for (const f of FILES) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"](\.[^'"]+)['"]/g)) {
      const spec = m[1];
      const target = join(f, '..', spec);
      try { statSync(target); } catch { missing.push(`${f} → ${spec}`); }
    }
  }
  assert.deepEqual(missing, [], `\n${missing.join('\n')}`);
});
