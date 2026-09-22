import { expect, test } from 'bun:test';

import { previewPageUrl } from '../cli/preview-server.js';

test('previewPageUrl preserves the existing source-only URL', () => {
  expect(previewPageUrl('https://muqun.dev/', 'http://127.0.0.1:4173/')).toBe(
    'https://muqun.dev/themes/preview/?source=http://127.0.0.1:4173/'
  );
});

test('previewPageUrl appends validated controls without dropping refresh', () => {
  expect(
    previewPageUrl('http://localhost:4321///', 'http://127.0.0.1:4173/', {
      refresh: 0,
      layout: 'editorial',
      device: 'tablet',
      mode: 'dark',
    })
  ).toBe(
    'http://localhost:4321/themes/preview/?source=http://127.0.0.1:4173/&refresh=0&layout=editorial&device=tablet&mode=dark'
  );
});
