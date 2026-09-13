import { expect, test } from 'bun:test';

import { sha256 } from '../digest.js';
import { packTheme, unpackTheme } from '../package.js';
import { parseThemeManifest, type ThemeManifest } from '../schema.js';
import { createThemeStarter } from '../starter.js';
import { verifyAssets } from '../verify.js';

/**
 * A real 1x1 PNG, not a structural fixture.
 *
 * The inspection tests elsewhere use hand-built chunk soup because they are
 * testing the parser. These tests are about identity across a pack/unpack, so
 * the bytes have to be something `inspectThemeImage` actually accepts, and the
 * simplest honest way to get that is a genuine encoded image.
 */
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
);
const PNG_1X1_ALT = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
);

function themeWithArtwork(): { manifest: ThemeManifest; assets: Record<string, Uint8Array> } {
  const manifest = createThemeStarter();
  manifest.assets = {
    paper: { path: 'assets/paper.png', sha256: sha256(PNG_1X1) },
    crest: { path: 'assets/crest.png', sha256: sha256(PNG_1X1_ALT) },
  };
  manifest.decoration = {
    'shell.background': { asset: 'paper', fit: 'cover', opacity: 0.6 },
    'emptyState.illustration': { asset: 'crest', fit: 'contain' },
  };
  manifest.variantDecorations = {
    dark: { 'shell.background': { asset: 'crest', compact: { asset: 'paper' } } },
  };
  manifest.icons = { 'chrome.back': { asset: 'crest', render: 'template' } };
  manifest.homeIdentity = { logo: { mode: 'custom', asset: 'crest' } };
  return { manifest, assets: { paper: PNG_1X1, crest: PNG_1X1_ALT } };
}

test('pack then unpack returns an identical manifest and identical asset digests', () => {
  const theme = themeWithArtwork();
  const before = Object.fromEntries(
    Object.entries(theme.assets).map(([id, bytes]) => [id, sha256(bytes)])
  );

  const restored = unpackTheme(packTheme(theme));

  expect(restored.manifest).toEqual(theme.manifest);
  const after = Object.fromEntries(
    Object.entries(restored.assets).map(([id, bytes]) => [id, sha256(bytes)])
  );
  expect(after).toEqual(before);
  // The digests the manifest itself declares must still describe the bytes that
  // came back out, which is the property an author is relying on when they ship
  // a pack with checksums in it.
  for (const [id, asset] of Object.entries(restored.manifest.assets ?? {}))
    if ('path' in asset && asset.sha256) expect(asset.sha256).toBe(after[id]);
});

test('a second pack of the same theme produces byte-identical output', () => {
  // Reproducibility is what makes a checksum in a release note meaningful.
  const theme = themeWithArtwork();
  expect(sha256(packTheme(theme))).toBe(sha256(packTheme(themeWithArtwork())));
});

test('the round trip survives a manifest that only carries colours', () => {
  const manifest = createThemeStarter();
  const restored = unpackTheme(packTheme({ manifest, assets: {} }));
  expect(restored.manifest).toEqual(manifest);
  expect(restored.assets).toEqual({});
});

test('an unpacked manifest re-parses, so unpack output is always packable again', () => {
  const theme = themeWithArtwork();
  const restored = unpackTheme(packTheme(theme));
  expect(parseThemeManifest(JSON.stringify(restored.manifest))).toEqual(theme.manifest);
  expect(unpackTheme(packTheme(restored)).manifest).toEqual(theme.manifest);
});

test('verification accepts honest artwork and names a digest that does not match', () => {
  const theme = themeWithArtwork();
  expect(verifyAssets(theme.manifest, theme.assets).issues).toEqual([]);

  // Same declared checksum, different bytes: the exact substitution a checksum exists to catch.
  const swapped = { ...theme.assets, paper: PNG_1X1_ALT };
  const issues = verifyAssets(theme.manifest, swapped).issues;
  expect(issues.some((issue) => issue.severity === 'error' && issue.path === 'assets.paper.sha256'))
    .toBe(true);
});

test('verification reports artwork that is declared but never drawn', () => {
  const theme = themeWithArtwork();
  delete theme.manifest.icons;
  delete theme.manifest.homeIdentity;
  delete theme.manifest.variantDecorations;
  theme.manifest.decoration = { 'shell.background': { asset: 'paper' } };
  const issues = verifyAssets(theme.manifest, theme.assets).issues;
  expect(
    issues.some(
      (issue) =>
        issue.severity === 'warning' &&
        issue.path === 'assets.crest' &&
        issue.message === 'declared but never drawn'
    )
  ).toBe(true);
});

test('verification refuses an animated WebP that the ZIP layer would happily carry', () => {
  // `package.ts` checks paths and sizes, never content. An animated WebP with a
  // .webp name passes every structural gate, so this is the only thing standing
  // between it and a phone trying to decode it.
  const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0));
  const u32le = (value: number) => [value & 255, (value >> 8) & 255, (value >> 16) & 255, value >>> 24];
  const chunk = (type: string, payload: number[]) => [
    ...ascii(type),
    ...u32le(payload.length),
    ...payload,
    ...(payload.length % 2 ? [0] : []),
  ];
  const body = [
    ...ascii('WEBP'),
    // VP8X with the animation flag set, then an ANIM chunk.
    ...chunk('VP8X', [2, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
    ...chunk('ANIM', [0, 0, 0, 0, 0, 0]),
  ];
  const animated = new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body]);

  const manifest = createThemeStarter();
  manifest.assets = { motion: { path: 'assets/motion.webp' } };
  manifest.decoration = { 'shell.background': { asset: 'motion' } };

  // It packs and unpacks without complaint...
  const restored = unpackTheme(packTheme({ manifest, assets: { motion: animated } }));
  expect(restored.assets.motion).toEqual(animated);
  // ...and verification is what refuses it.
  const issues = verifyAssets(restored.manifest, restored.assets).issues;
  expect(issues.some((issue) => issue.severity === 'error' && issue.path === 'assets.motion')).toBe(
    true
  );
});
