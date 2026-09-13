import { describe, expect, test } from 'bun:test';

import { createThemeStarter } from '../starter.js';
import {
  parseThemeManifest,
  themeColorsSchema,
  themeJsonSchema,
  THEME_LIMITS,
} from '../schema.js';

import { verifyManifest } from '../verify.js';
import { auditThemeContrast } from '../contrast.js';
import { themeOpacityPolicy } from '../opacity-policy.js';

const parse = (value: unknown) => parseThemeManifest(JSON.stringify(value));

describe('theme v1 contract', () => {
  test('starter is complete and stable across a JSON round trip', () => {
    const theme = createThemeStarter();
    expect(parse(theme)).toEqual(theme);
    expect(Object.keys(theme.variants.light.colors)).toHaveLength(17);
    expect(theme.variants.dark.terminal.ansi).toHaveLength(16);
    // An alpha-carrying hex is the one colour form a round trip could drop.
    expect(/^#[\da-fA-F]{8}$/.test(theme.variants.light.colors.primarySubtle)).toBe(true);
  });

  test('the starter can actually be applied, which is what three places promise', () => {
    // `theme init` says "already passes the contrast gate", the spec says
    // "complete, valid ... adapt it", and `authoring.ts` says the seed meets the
    // gate. All three were wrong: the palette came from a built-in, and built-ins
    // are never put through `auditThemeContrast` -- only custom packs are, on
    // apply. The seed failed in seventeen places and could not be applied at all,
    // so the documented first step of authoring handed back something unusable.
    expect(auditThemeContrast(createThemeStarter())).toEqual([]);
  });

  test('neither mode is pinned at full opacity', () => {
    // A baseline failure forces the floor to 1 and the slider to nothing. This
    // is the same property as above read through the policy, and it is the one
    // an author sees first.
    const starter = createThemeStarter();
    for (const mode of ['light', 'dark'] as const) {
      const policy = themeOpacityPolicy(starter.variants[mode]);
      expect(policy.surface.baselineIssues).toEqual([]);
      expect(policy.terminal.baselineIssues).toEqual([]);
    }
  });

  for (const mode of ['light', 'dark'] as const) {
    test(`requires every ${mode} UI token`, () => {
      for (const key of Object.keys(themeColorsSchema.shape)) {
        const theme = JSON.parse(JSON.stringify(createThemeStarter()));
        delete theme.variants[mode].colors[key];
        expect(() => parse(theme)).toThrow(key);
      }
    });
    test(`requires ${mode} and exactly sixteen ANSI colors`, () => {
      const theme = createThemeStarter();
      expect(() =>
        parse({
          ...theme,
          variants: { [mode === 'light' ? 'dark' : 'light']: theme.variants[mode] },
        })
      ).toThrow(mode);
      for (const length of [0, 15, 17]) {
        expect(() =>
          parse({
            ...theme,
            variants: {
              ...theme.variants,
              [mode]: {
                ...theme.variants[mode],
                terminal: { ...theme.variants[mode].terminal, ansi: Array(length).fill('#123456') },
              },
            },
          })
        ).toThrow('ansi');
      }
    });
  }

  test('tolerates what a newer app might add, and drops it rather than acting on it', () => {
    // A pack written against a later build installs here, minus the parts this
    // build has never heard of. Strictness made every added field a breaking
    // change for every app already in someone's hands -- see
    // `docs/theme-contract.md` in the app repository. `verifyManifest` is what
    // tells the author, because nothing at runtime will.
    const withFuture = parse({
      ...createThemeStarter(),
      javascript: 'bad',
      decoration: { 'terminal.background': null },
    });
    expect(Object.hasOwn(withFuture, 'javascript')).toBe(false);
  });

  test('a pack from a later format says so, instead of failing as a broken v1', () => {
    expect(() => parse({ ...createThemeStarter(), schemaVersion: 2 })).toThrow(
      'needs a newer version of Muqun'
    );
    expect(() => parse({ ...createThemeStarter(), schemaVersion: 0 })).toThrow('schemaVersion');
  });

  test('colours stay strict, because there a typo has no sensible fallback', () => {
    const theme = createThemeStarter();
    (theme.variants.light.colors as Record<string, string>).backgrnd = '#000000';
    expect(() => parse(theme)).toThrow();
  });

  for (const color of ['red', '#fff', 'transparent', '#12345600', 'url(https://example.invalid)']) {
    test(`rejects nonopaque/invalid text color ${color}`, () => {
      const theme = createThemeStarter();
      theme.variants.light.colors.text = color;
      expect(() => parse(theme)).toThrow('text');
    });
  }

  test('bounds raw bytes before parsing, including multibyte UTF-8', () => {
    expect(() => parseThemeManifest(' '.repeat(THEME_LIMITS.manifestBytes + 1))).toThrow('256 KiB');
    expect(() => parseThemeManifest('🌸'.repeat(70_000))).toThrow('256 KiB');
    expect(() => parseThemeManifest('{')).toThrow('complete JSON');
  });

  for (const path of [
    '/tmp/a.png',
    'assets/../secret.png',
    'assets/a.svg',
    'assets/a.png/b',
    'assets/%2e%2e.png',
    'assets\\a.png',
  ]) {
    test(`rejects unsafe or unsupported asset path ${path}`, () => {
      expect(() => parse({ ...createThemeStarter(), assets: { paper: { path } } })).toThrow();
    });
  }

  test('validates all shared, mode, responsive and logo references', () => {
    for (const extra of [
      { decoration: { 'shell.background': { asset: 'missing' } } },
      { variantDecorations: { dark: { 'shell.background': { asset: 'missing' } } } },
      { decoration: { 'shell.background': { asset: 'paper', regular: { asset: 'missing' } } } },
      { homeIdentity: { logo: { mode: 'custom', asset: 'missing' } } },
    ]) {
      expect(() =>
        parse({
          ...createThemeStarter(),
          assets: { paper: { path: 'assets/paper.png' } },
          ...extra,
        })
      ).toThrow('Unknown asset');
    }
  });

  test('bounds resource count', () => {
    const assets = Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [
        `asset-${index}`,
        { path: `assets/paper-${index}.png` },
      ])
    );
    expect(() => parse({ ...createThemeStarter(), assets })).toThrow('32 assets');
  });

  test('compact schema references resolve locally without dropping the shared variant contract', () => {
    const schema = themeJsonSchema();
    let references = 0;
    function visit(value: unknown) {
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (typeof record.$ref === 'string') {
        references += 1;
        expect(record.$ref.startsWith('#/')).toBe(true);
        let target: unknown = schema;
        for (const segment of record.$ref.slice(2).split('/')) {
          target = (target as Record<string, unknown>)[
            segment.replace(/~1/g, '/').replace(/~0/g, '~')
          ];
        }
        expect(target).not.toBeUndefined();
      }
      for (const child of Object.values(record)) visit(child);
    }
    visit(schema);
    expect(references > 0).toBe(true);
  });
});

test('every open name this build does not know reaches the author as a warning', () => {
  // The other half of the contract in `docs/theme-contract.md`. Tolerance is
  // only defensible if the person who can still fix a typo is told about it,
  // so each open part of the schema is checked to actually produce a warning
  // -- and to produce it as a warning, since the pack does install.
  const starter = createThemeStarter();
  const raw = {
    ...starter,
    javascript: 'bad',
    decoration: { 'shell.backgrund': null },
    icons: { 'chrome.bak': { asset: 'logo' } },
    materials: { osDialog: 'solid', navigation: 'frosted' },
  };
  const manifest = parseThemeManifest(JSON.stringify(raw));
  const issues = verifyManifest(manifest, raw);
  expect(issues.every((issue) => issue.severity === 'warning')).toBe(true);
  const paths = issues.map((issue) => issue.path);
  expect(paths).toContain('javascript');
  expect(paths).toContain('decoration.shell.backgrund');
  expect(paths).toContain('icons.chrome.bak');
  expect(paths).toContain('materials.osDialog');
  // The surface is known; the value is not, and it silently became `auto`.
  expect(
    issues.find((issue) => issue.path === 'materials.navigation')?.message
  ).toContain('render as auto');
});
