import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The library half of this package must not drag Effect in.
 *
 * `schema`, `package`, `opacity-policy` and the rest are consumed by importers
 * who want a manifest checked, not a runtime adopted -- the app itself may come
 * to depend on exactly those. So the boundary is not a convention to remember,
 * it is this test: walk the real import graph from `index.ts` and fail if
 * anything in it reaches for `effect`.
 *
 * Deliberately a static scan rather than a runtime probe. Importing the module
 * and inspecting the loaded graph would pass just as well with a lazy
 * `await import('effect')` hidden inside a function, which is precisely the kind
 * of thing that should fail here.
 */
const SRC = new URL('..', import.meta.url).pathname;

function imports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  // Static imports and re-exports, plus dynamic import() and require().
  const patterns = [
    /\bimport\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** Every file reachable from an entry point, with the specifiers each one used. */
function graph(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [resolve(SRC, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const specifiers = imports(file);
    seen.set(file, specifiers);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue;
      // Source is written with .js specifiers for NodeNext; the file is .ts.
      const resolved = resolve(dirname(file), specifier.replace(/\.js$/, '.ts'));
      queue.push(resolved);
    }
  }
  return seen;
}

const EFFECT = /^(effect|@effect\/)/;

test('the public library surface never imports Effect', () => {
  const offenders: string[] = [];
  for (const [file, specifiers] of graph('index.ts')) {
    for (const specifier of specifiers) {
      if (EFFECT.test(specifier)) offenders.push(`${file.slice(SRC.length)} imports ${specifier}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('the library surface reaches only the domain, never the command layer', () => {
  // `cli/` is where Effect is allowed to live, so nothing the library exports
  // may reach into it -- that would be the same violation by a longer route.
  const reached = [...graph('index.ts').keys()].map((file) => file.slice(SRC.length));
  expect(reached.filter((file) => file.startsWith('cli/'))).toEqual([]);
  expect(reached).toContain('schema.ts');
  expect(reached).toContain('opacity-policy.ts');
});

test('the command layer is the only place Effect appears', () => {
  const commandGraph = graph('cli.ts');
  const effectUsers = [...commandGraph.entries()]
    .filter(([, specifiers]) => specifiers.some((s) => EFFECT.test(s)))
    .map(([file]) => file.slice(SRC.length));
  // It must actually be used somewhere, or this test proves nothing.
  expect(effectUsers.length).toBeGreaterThan(0);
  for (const file of effectUsers) expect(file.startsWith('cli/')).toBe(true);
});

test('the domain still validates with zod, and only once', () => {
  // The manifest schema is ported from the app and pinned byte-for-byte by
  // skill.test.ts. If Effect's schema ever started validating manifests too,
  // there would be two definitions of the format and one of them would drift.
  const schema = readFileSync(resolve(SRC, 'schema.ts'), 'utf8');
  expect(schema).toContain("from 'zod'");
  expect(EFFECT.test('effect')).toBe(true); // sanity: the matcher works
  for (const [, specifiers] of graph('index.ts')) {
    expect(specifiers.filter((s) => s === 'effect/unstable/schema')).toEqual([]);
  }
});
