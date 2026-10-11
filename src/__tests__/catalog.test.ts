import { expect, test } from 'bun:test';

import { packagePreview, previewPath } from '../cli/catalog.js';
import { sha256 } from '../digest.js';
import { solidPng } from '../placeholder-png.js';
import { createThemeStarter } from '../starter.js';

const manifest = { ...createThemeStarter(), preview: 'cover' };

test('preview addresses depend on published image bytes, not other theme metadata', () => {
  const bytes = solidPng(16, 16, '#123456', { placeholder: false });
  const original = packagePreview(manifest, { cover: bytes })!;
  expect(original.file).toBe(`${manifest.id}-${sha256(bytes)}.png`);
  expect(packagePreview(manifest, { cover: bytes.slice() })?.file).toBe(original.file);
  expect(packagePreview({ ...manifest, version: '9.0.0', name: 'Renamed theme' }, { cover: bytes })?.file)
    .toBe(original.file);
  expect(packagePreview({
    ...manifest,
    variants: {
      ...manifest.variants,
      light: { ...manifest.variants.light, colors: { ...manifest.variants.light.colors, primary: '#345678' } },
    },
  }, { cover: bytes })?.file).toBe(original.file);
  const changed = solidPng(16, 16, '#654321', { placeholder: false });
  expect(packagePreview(manifest, { cover: changed })?.file).not.toBe(original.file);
  expect(original.bytes).toBe(bytes);
});

test('preview addresses use the actual format and remain plain catalogue image paths', async () => {
  const png = solidPng(16, 16, '#123456', { placeholder: false });
  const jpeg = await new Bun.Image(png).jpeg().bytes();
  const webp = await new Bun.Image(png).webp().bytes();
  for (const [extension, bytes] of [['png', png], ['jpg', jpeg], ['webp', webp]] as const) {
    const preview = packagePreview(manifest, { cover: bytes })!;
    expect(preview.file).toBe(`${manifest.id}-${sha256(bytes)}.${extension}`);
    // Existing website/worker consumers accept slug filenames, without query strings.
    expect(previewPath(preview.file)).toMatch(/^dist\/previews\/[a-z][a-z0-9-]*\.(webp|png|jpe?g)$/);
  }
  expect(packagePreview(manifest, {})).toBeUndefined();
  expect(packagePreview(manifest, { cover: new Uint8Array([1, 2, 3]) })).toBeUndefined();
  expect(packagePreview(createThemeStarter(), { cover: png })).toBeUndefined();
});
