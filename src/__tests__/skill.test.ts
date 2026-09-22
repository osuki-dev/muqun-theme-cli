import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { THEME_LIMITS, themeJsonSchema } from '../schema.js';
import { createThemeStarter } from '../starter.js';

/**
 * `skills/muqun-theme/SKILL.md` carries this CLI's authoring contract and two
 * generated data sections. A stale copy of an authoring
 * contract is worse than no copy at all: an agent would follow it confidently
 * and produce a theme the app then refuses.
 *
 * These tests remove that risk for everything that can be checked mechanically.
 * The two data sections are generated from the same schema and starter this
 * package carries, so they must reproduce byte for byte; the prose quotes the
 * limits, so those are checked against `THEME_LIMITS` too. What remains
 * unpinned is genuinely prose, and prose that drifts is a documentation bug
 * rather than a theme that fails to install.
 */
const SKILL = readFileSync(new URL('../../skills/muqun-theme/SKILL.md', import.meta.url), 'utf8');

function section(heading: string, fence: string): string {
  // The upstream generator may put a formatter directive between the heading
  // and the fence -- `<!-- prettier-ignore -->` sits above the JSON Schema, so
  // a very long line survives a reformat. It is part of the verbatim copy, so
  // the reader here skips HTML comments rather than the vendoring stripping
  // them and making the copy a not-quite-copy.
  const match = SKILL.match(
    new RegExp(`## ${heading}\\n\\n(?:<!--[\\s\\S]*?-->\\n)*\`\`\`${fence}\\n([\\s\\S]*?)\\n\`\`\``)
  );
  if (!match) throw new Error(`SKILL.md has no ${heading} section in a ${fence} fence`);
  return match[1];
}

test('the skill carries valid frontmatter an agent harness can read', () => {
  const frontmatter = SKILL.match(/^---\n([\s\S]*?)\n---\n/);
  expect(frontmatter).not.toBeNull();
  const fields = Object.fromEntries(
    frontmatter![1].split('\n').map((line) => {
      const at = line.indexOf(': ');
      return [line.slice(0, at), line.slice(at + 2)];
    })
  );
  expect(fields.name).toBe('muqun-theme');
  expect(fields.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(fields.description.length).toBeGreaterThan(20);
});

test('the skill declares its local schema and regeneration command', () => {
  expect(SKILL).toContain('bun scripts/export-theme-skill.ts');
  expect(SKILL).toContain('CLI-owned authoring guidance.');
  expect(SKILL).toContain('src/schema.ts and src/starter.ts');
});

test('the skill JSON Schema is exactly the schema this package enforces', () => {
  // The upstream file pretty-prints it; compare as values, then as bytes once
  // recompacted, so formatting is allowed to differ and content is not.
  const published = section('JSON Schema', 'json');
  expect(JSON.stringify(JSON.parse(published))).toBe(JSON.stringify(themeJsonSchema()));
});

test('the skill starter manifest is exactly this package starter, and is valid', () => {
  const published = section('Complete starter manifest', 'muqun-theme');
  expect(published).toBe(JSON.stringify(createThemeStarter()));
  // Not merely equal to the snapshot -- actually parseable as a manifest, which
  // is what the skill promises when it tells an agent to adapt it.
  expect(() => createThemeStarter()).not.toThrow();
});

test('the limits quoted in the prose match the limits in code', () => {
  const mib = (bytes: number) => bytes / (1024 * 1024);
  expect(SKILL).toContain(`within ${THEME_LIMITS.manifestBytes / 1024} KiB`);
  expect(SKILL).toContain(`at most ${THEME_LIMITS.assets} assets`);
  expect(SKILL).toContain(`at most ${mib(THEME_LIMITS.assetBytes)} MiB`);
  expect(SKILL).toContain(`${THEME_LIMITS.imagePixels / 1_000_000} megapixels`);
  expect(SKILL).toContain(
    `${mib(THEME_LIMITS.packageBytes)} MiB compressed / ${mib(THEME_LIMITS.extractedBytes)} MiB expanded`
  );
});

test('the appended CLI section comes after the generated content and names both commands', () => {
  const generatedEnd = SKILL.indexOf('## Complete starter manifest');
  const appended = SKILL.indexOf('## Checking your work');
  expect(generatedEnd).toBeGreaterThan(0);
  expect(appended).toBeGreaterThan(generatedEnd);
  expect(SKILL).toContain('Appended by @osuki-dev/muqun-theme');
  expect(SKILL).toContain('muqun-theme validate');
  expect(SKILL).toContain('muqun-theme contrast');
});
