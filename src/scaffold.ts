import { solidPng } from './placeholder-png.js';
import { parseThemeManifest, type ThemeManifest } from './schema.js';
import { createThemeStarter } from './starter.js';

/**
 * A complete theme, not a palette.
 *
 * `createThemeStarter()` is a snapshot of the app's own starter, and the app's
 * starter is colours only. That is the right thing for it to be -- it is pinned
 * to the authoring skill, and the skill's job is to show an agent the shape of a
 * manifest -- but it makes a poor `init`. Someone who runs `init` and wants
 * wallpaper, an empty state or a custom Home name has to go and read the schema
 * to find out those sections exist at all.
 *
 * So this is the other thing: every section the schema supports, filled in and
 * wired to a real file, so the whole surface is discoverable by deleting what
 * you do not want rather than by researching what you might have had.
 *
 * This is **not** a snapshot of anything in the app. The palette below comes
 * from `createThemeStarter()` and keeps that provenance; everything layered on
 * top is this package's own and has no upstream counterpart.
 */

/** One placeholder drawing: where it goes, how big, and what tint. */
type Placeholder = {
  id: string;
  file: string;
  width: number;
  height: number;
  /** A path into the light or dark palette, resolved when the tint is drawn. */
  tint: (theme: ThemeManifest) => string;
};

const light = (key: keyof ThemeManifest['variants']['light']['colors']) => (theme: ThemeManifest) =>
  theme.variants.light.colors[key];
const dark = (key: keyof ThemeManifest['variants']['dark']['colors']) => (theme: ThemeManifest) =>
  theme.variants.dark.colors[key];

/**
 * Sizes are the ones each slot actually wants, so a fresh scaffold packs without
 * warnings about artwork larger than its slot needs. `shell` and `home`
 * backgrounds are full-screen and get a phone's worth of pixels; bars get a wide
 * strip; the Home banner is the documented 2:1 at its 560 maximum.
 */
const PLACEHOLDERS: readonly Placeholder[] = [
  { id: 'shell-light', file: 'shell-light.png', width: 1080, height: 1920, tint: light('surfaceRaised') },
  { id: 'shell-dark', file: 'shell-dark.png', width: 1080, height: 1920, tint: dark('surfaceRaised') },
  { id: 'home-background', file: 'home-background.png', width: 1080, height: 1920, tint: light('surface') },
  { id: 'home-banner', file: 'home-banner.png', width: 560, height: 280, tint: light('primary') },
  { id: 'navigation', file: 'navigation.png', width: 1024, height: 256, tint: light('surfaceRaised') },
  { id: 'composer', file: 'composer.png', width: 1024, height: 256, tint: light('surfaceRaised') },
  { id: 'actions', file: 'actions.png', width: 1024, height: 256, tint: light('surfaceRaised') },
  { id: 'tabs', file: 'tabs.png', width: 1024, height: 192, tint: light('surfaceRaised') },
  { id: 'cards', file: 'cards.png', width: 512, height: 512, tint: light('border') },
  { id: 'buttons', file: 'buttons.png', width: 512, height: 160, tint: light('primary') },
  { id: 'empty-state', file: 'empty-state.png', width: 512, height: 512, tint: light('info') },
  { id: 'icon-back', file: 'icon-back.png', width: 96, height: 96, tint: light('text') },
  { id: 'icon-send', file: 'icon-send.png', width: 96, height: 96, tint: light('text') },
  { id: 'icon-attach', file: 'icon-attach.png', width: 96, height: 96, tint: light('text') },
  { id: 'logo', file: 'logo.png', width: 256, height: 256, tint: light('primary') },
];

export type ThemeScaffold = { manifest: ThemeManifest; assets: Record<string, Uint8Array> };

/**
 * Build a complete, installable theme directory's worth of data.
 *
 * `slug` renames the theme; it must be a valid identifier, which the manifest
 * parse at the end enforces rather than this function guessing.
 */
export function createThemeScaffold(slug?: string): ThemeScaffold {
  const base = createThemeStarter();
  const name = slug ?? base.id;

  const assets: Record<string, Uint8Array> = {};
  const declared: Record<string, { path: string }> = {};
  for (const placeholder of PLACEHOLDERS) {
    assets[placeholder.id] = solidPng(
      placeholder.width,
      placeholder.height,
      placeholder.tint(base)
    );
    declared[placeholder.id] = { path: `assets/${placeholder.file}` };
  }

  const manifest = {
    ...base,
    id: name,
    name,
    // Left for the author to fill in: guessing at these would put a wrong
    // attribution into every theme made with this tool.
    author: 'Your name',
    license: 'CC-BY-4.0',
    assets: declared,

    // Shared across both modes. A slot omitted here inherits nothing and simply
    // draws no artwork, so every slot the schema has is present and wired.
    decoration: {
      'home.background': { asset: 'home-background', fit: 'cover' as const },
      'home.decoration': { asset: 'home-banner', fit: 'contain' as const },
      'navigation.background': { asset: 'navigation', fit: 'cover' as const },
      'composer.background': { asset: 'composer', fit: 'cover' as const },
      'actions.background': { asset: 'actions', fit: 'cover' as const },
      'tabs.background': { asset: 'tabs', fit: 'cover' as const },
      'cards.decoration': { asset: 'cards', fit: 'cover' as const, opacity: 0.4 },
      'buttons.primary.background': { asset: 'buttons', fit: 'cover' as const },
      'emptyState.illustration': { asset: 'empty-state', fit: 'contain' as const },
    },

    // The per-mode override, demonstrated on the one slot where a single image
    // almost never works for both: the wallpaper behind everything.
    variantDecorations: {
      light: { 'shell.background': { asset: 'shell-light', fit: 'cover' as const } },
      dark: { 'shell.background': { asset: 'shell-dark', fit: 'cover' as const } },
    },

    // `template` takes the glyph's shape from the image's alpha and its colour
    // from the theme, so one drawing is correct in light and dark.
    icons: {
      'chrome.back': { asset: 'icon-back', render: 'template' as const },
      'chrome.send': { asset: 'icon-send', render: 'template' as const },
      'chrome.attach': { asset: 'icon-attach', render: 'template' as const },
    },

    materials: {
      default: 'auto' as const,
      navigation: 'auto' as const,
      composer: 'auto' as const,
      actions: 'auto' as const,
    },

    homeIdentity: {
      name: { mode: 'custom' as const, text: name },
      logo: { mode: 'custom' as const, asset: 'logo' },
    },
  };

  // Parsed, not cast: `init` must not be able to write something the app would
  // refuse, and a bad `slug` should fail here with the schema's own message.
  return { manifest: parseThemeManifest(JSON.stringify(manifest)), assets };
}

/** The files a scaffold writes, as repository-relative paths. */
export function scaffoldFiles(scaffold: ThemeScaffold): { path: string; bytes: Uint8Array }[] {
  return Object.entries(scaffold.assets).map(([id, bytes]) => {
    const asset = scaffold.manifest.assets?.[id];
    if (!asset || !('path' in asset)) throw new Error(`Scaffold asset ${id} has no path`);
    return { path: asset.path, bytes };
  });
}
