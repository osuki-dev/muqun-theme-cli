import { expect, test } from 'bun:test';

import { inspectThemeImage } from '../image-inspection.js';
import { packTheme, unpackTheme } from '../package.js';
import { isPlaceholderImage, parseHexColor, solidPng } from '../placeholder-png.js';
import { createThemeScaffold, scaffoldFiles } from '../scaffold.js';
import { parseThemeManifest, THEME_ICONS, THEME_SLOTS } from '../schema.js';
import { verifyAssets, verifyManifest } from '../verify.js';

test('generated PNGs are real PNGs the theme image inspector accepts', () => {
  for (const [width, height] of [
    [1, 1],
    [96, 96],
    [560, 280],
    [1080, 1920],
  ]) {
    const png = solidPng(width, height, '#A62A18');
    expect(inspectThemeImage(png)).toEqual({ format: 'png', width, height });
  }
});

test('the placeholder marker is written, detected, and omittable', () => {
  expect(isPlaceholderImage(solidPng(8, 8, '#123456'))).toBe(true);
  const real = solidPng(8, 8, '#123456', { placeholder: false });
  expect(isPlaceholderImage(real)).toBe(false);
  // Still a valid image either way -- the marker is ancillary, not structural.
  expect(inspectThemeImage(real).width).toBe(8);
});

test('hex colours are parsed in every form the palette uses', () => {
  expect(parseHexColor('#FFFFFF')).toEqual([255, 255, 255, 255]);
  expect(parseHexColor('#000')).toEqual([0, 0, 0, 255]);
  expect(parseHexColor('#A62A180F')).toEqual([0xa6, 0x2a, 0x18, 0x0f]);
  for (const bad of ['red', '#12', '#GGGGGG', '']) expect(() => parseHexColor(bad)).toThrow();
});

test('degenerate PNG dimensions are refused rather than encoded', () => {
  for (const [w, h] of [
    [0, 4],
    [4, 0],
    [-1, 4],
    [1.5, 4],
  ])
    expect(() => solidPng(w, h, '#FFFFFF')).toThrow();
});

test('the scaffold fills in every section the schema supports', () => {
  const { manifest } = createThemeScaffold();
  // The whole point: nothing here is left for an author to discover elsewhere.
  expect(Object.keys(manifest.assets ?? {}).length).toBeGreaterThan(0);
  expect(manifest.decoration).toBeDefined();
  expect(manifest.variantDecorations?.light).toBeDefined();
  expect(manifest.variantDecorations?.dark).toBeDefined();
  expect(manifest.icons).toBeDefined();
  expect(manifest.materials).toBeDefined();
  expect(manifest.homeIdentity).toBeDefined();
  expect(manifest.author).toBeDefined();
  expect(manifest.license).toBeDefined();
});

test('every decoration slot the schema has is wired to a declared asset', () => {
  const { manifest } = createThemeScaffold();
  const shared = new Set(Object.keys(manifest.decoration ?? {}));
  const perMode = new Set([
    ...Object.keys(manifest.variantDecorations?.light ?? {}),
    ...Object.keys(manifest.variantDecorations?.dark ?? {}),
  ]);
  // `THEME_SLOTS`, not the schema's keys: the schema accepts any slot name
  // now, so the closed list is the only record of what the app actually draws.
  for (const slot of THEME_SLOTS) {
    expect(shared.has(slot) || perMode.has(slot)).toBe(true);
  }
  // And both known glyphs are replaced, so an author sees the mechanism.
  for (const icon of THEME_ICONS) expect(manifest.icons?.[icon]).toBeDefined();
});

test('a fresh scaffold has no errors and no size warnings, only placeholder notices', () => {
  const scaffold = createThemeScaffold();
  const issues = [...verifyManifest(scaffold.manifest), ...verifyAssets(scaffold.manifest, scaffold.assets).issues];

  expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  // Sizes are chosen per slot, so a brand new theme must not warn about artwork
  // larger than its slot needs -- that would train an author to ignore warnings.
  expect(issues.filter((issue) => issue.message.includes('longest edge'))).toEqual([]);
  expect(issues.filter((issue) => issue.message.includes('never drawn'))).toEqual([]);

  const placeholders = issues.filter((issue) => issue.message.includes('placeholder'));
  expect(placeholders.length).toBe(Object.keys(scaffold.assets).length);
});

test('a fresh scaffold packs, round trips, and is installable as-is', () => {
  const scaffold = createThemeScaffold('grand-voyage');
  expect(scaffold.manifest.id).toBe('grand-voyage');

  const bytes = packTheme(scaffold);
  const restored = unpackTheme(bytes);
  expect(restored.manifest).toEqual(scaffold.manifest);
  expect(Object.keys(restored.assets).sort()).toEqual(Object.keys(scaffold.assets).sort());
  for (const [id, content] of Object.entries(restored.assets))
    expect(content).toEqual(scaffold.assets[id]);

  // The packed form passes the same gate the app applies on import.
  expect(verifyAssets(restored.manifest, restored.assets).issues.filter((i) => i.severity === 'error')).toEqual([]);
});

test('the scaffold manifest is parsed, so a bad slug fails at init rather than later', () => {
  expect(() => createThemeScaffold('Not A Slug')).toThrow();
  expect(() => createThemeScaffold('9lives')).toThrow();
  expect(createThemeScaffold('ok-slug-1').manifest.id).toBe('ok-slug-1');
});

test('scaffoldFiles names every asset with its manifest path', () => {
  const scaffold = createThemeScaffold();
  const files = scaffoldFiles(scaffold);
  expect(files.length).toBe(Object.keys(scaffold.assets).length);
  for (const file of files) {
    expect(file.path).toMatch(/^assets\/[a-zA-Z0-9_-]+\.png$/);
    expect(file.bytes.length).toBeGreaterThan(0);
  }
  // Paths are unique, or packing would collide.
  expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
});

test('replacing a placeholder removes exactly one placeholder warning', () => {
  const scaffold = createThemeScaffold();
  const before = verifyAssets(scaffold.manifest, scaffold.assets).issues.filter((i) =>
    i.message.includes('placeholder')
  ).length;

  const [first] = Object.keys(scaffold.assets);
  const info = inspectThemeImage(scaffold.assets[first]);
  scaffold.assets[first] = solidPng(info.width, info.height, '#2E7D5B', { placeholder: false });

  const after = verifyAssets(scaffold.manifest, scaffold.assets).issues.filter((i) =>
    i.message.includes('placeholder')
  ).length;
  expect(after).toBe(before - 1);
});

test('the scaffold is not the colours-only starter', () => {
  // Guards the provenance split: `createThemeStarter()` stays a snapshot of the
  // app's own starter and is pinned to the authoring skill; the scaffold is this
  // package's own artefact and is free to go further.
  const starter = parseThemeManifest(JSON.stringify(createThemeScaffold().manifest));
  expect(starter.assets).toBeDefined();
  expect(Object.keys(starter.assets ?? {}).length).toBeGreaterThan(10);
});
