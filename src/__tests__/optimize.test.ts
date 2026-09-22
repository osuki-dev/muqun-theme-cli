import { expect, test } from 'bun:test';
import { Effect } from 'effect';

import { sha256 } from '../digest.js';
import { inspectThemeImage } from '../image-inspection.js';
import { optimizeAssets, QUALITY } from '../cli/optimize.js';
import { solidPng } from '../placeholder-png.js';
import { createThemeScaffold } from '../scaffold.js';
import { parseThemeManifest, type ThemeManifest } from '../schema.js';

const run = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect as Effect.Effect<A, E, never>);

function themeWith(assets: Record<string, Uint8Array>, sha = false): ThemeManifest {
  const base = createThemeScaffold().manifest;
  const declared = Object.fromEntries(
    Object.keys(assets).map((id) => [
      id,
      sha ? { path: `assets/${id}.png`, sha256: sha256(assets[id]) } : { path: `assets/${id}.png` },
    ])
  );
  return parseThemeManifest(
    JSON.stringify({
      ...base,
      assets: declared,
      decoration: { 'shell.wallpaper': { asset: Object.keys(assets)[0] } },
      variantDecorations: undefined,
      icons: undefined,
      homeIdentity: undefined,
      // The scaffold's preview names an asset these tests do not carry.
      preview: undefined,
    })
  );
}

test('a PNG becomes a smaller WebP that the app inspector still accepts', async () => {
  const assets = { paper: solidPng(512, 512, '#A62A18', { placeholder: false }) };
  const manifest = themeWith(assets);

  const result = await run(optimizeAssets(manifest, assets));
  const [report] = result.reports;

  expect(report.fromFormat).toBe('png');
  expect(report.toBytes).toBeLessThan(report.fromBytes);
  expect(report.quality).toBe(QUALITY);
  expect(report.toPath).toBe('assets/paper.webp');
  // The app's own gate, on our output.
  expect(inspectThemeImage(result.assets.paper).format).toBe('webp');
  expect(result.manifest.assets?.paper).toEqual({ path: 'assets/paper.webp' });
});

test('alpha survives the conversion rather than being flattened', async () => {
  // Template icons carry their glyph shape in alpha, so losing it would be a
  // silent visual regression rather than a loud failure.
  const assets = { glyph: solidPng(96, 96, '#FFFFFF80', { placeholder: false }) };
  const result = await run(optimizeAssets(themeWith(assets), assets));
  const bytes = result.assets.glyph;
  expect(inspectThemeImage(bytes).format).toBe('webp');
  // VP8X + ALPH is how a lossy WebP carries an alpha channel.
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, 64));
  expect(text).toContain('VP8X');
  expect(text).toContain('ALPH');
});

test('a declared digest is recomputed over the converted bytes and reported', async () => {
  const assets = { paper: solidPng(512, 512, '#2E7D5B', { placeholder: false }) };
  const manifest = themeWith(assets, true);
  const before = manifest.assets?.paper;

  const result = await run(optimizeAssets(manifest, assets));
  const after = result.manifest.assets?.paper;

  expect(result.reports[0].digestRewritten).toBe(true);
  expect(after).not.toEqual(before);
  // The new digest describes the new bytes, not the old ones.
  expect(after && 'sha256' in after ? after.sha256 : undefined).toBe(sha256(result.assets.paper));
});

test('an asset without a declared digest does not gain one', async () => {
  // Adding a claim the author never made would be as wrong as rewriting one.
  const assets = { paper: solidPng(256, 256, '#123456', { placeholder: false }) };
  const result = await run(optimizeAssets(themeWith(assets, false), assets));
  const after = result.manifest.assets?.paper;
  expect(after && 'sha256' in after ? after.sha256 : undefined).toBeUndefined();
  // Converted, but with nothing to rewrite.
  expect(result.reports[0].toBytes).toBeDefined();
  expect(result.reports[0].digestRewritten).toBeFalsy();
});

test('artwork that is already WebP is left exactly alone', async () => {
  const png = solidPng(128, 128, '#A62A18', { placeholder: false });
  const webp = await run(
    Effect.promise(async () =>
      (await new (globalThis as any).Bun.Image(png).webp({ quality: QUALITY }).bytes()) as Uint8Array
    )
  );
  const manifest = parseThemeManifest(
    JSON.stringify({
      ...createThemeScaffold().manifest,
      assets: { art: { path: 'assets/art.webp' } },
      decoration: { 'shell.wallpaper': { asset: 'art' } },
      variantDecorations: undefined,
      icons: undefined,
      homeIdentity: undefined,
      preview: undefined,
    })
  );

  const result = await run(optimizeAssets(manifest, { art: webp }));
  expect(result.reports[0].skipped).toBe('already WebP');
  expect(result.assets.art).toEqual(webp);
  expect(result.manifest.assets?.art).toEqual({ path: 'assets/art.webp' });
});

test('conversion never makes an asset larger', async () => {
  // A tiny image can encode bigger as WebP than as PNG; the original wins.
  const assets = { dot: solidPng(1, 1, '#FFFFFF', { placeholder: false }) };
  const result = await run(optimizeAssets(themeWith(assets), assets));
  const report = result.reports[0];
  if (report.toBytes !== undefined) expect(report.toBytes).toBeLessThan(report.fromBytes);
  else expect(report.skipped).toBe('WebP was not smaller');
  // Either way the bytes that survive are no bigger than what came in.
  expect(result.assets.dot.length).toBeLessThanOrEqual(assets.dot.length);
});

test('a whole scaffold optimises, shrinks, and stays installable', async () => {
  const scaffold = createThemeScaffold('grand-voyage');
  const before = Object.values(scaffold.assets).reduce((total, b) => total + b.length, 0);

  const result = await run(optimizeAssets(scaffold.manifest, scaffold.assets));
  const after = Object.values(result.assets).reduce((total, b) => total + b.length, 0);

  expect(after).toBeLessThan(before);
  expect(Object.keys(result.assets).sort()).toEqual(Object.keys(scaffold.assets).sort());
  // Every surviving asset is a valid theme image, and the manifest still parses
  // with all its references intact.
  for (const bytes of Object.values(result.assets)) expect(() => inspectThemeImage(bytes)).not.toThrow();
  expect(() => parseThemeManifest(JSON.stringify(result.manifest))).not.toThrow();
});
