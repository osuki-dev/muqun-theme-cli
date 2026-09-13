import { sha256 } from './digest.js';
import { inspectThemeImage, type ThemeImageInfo } from './image-inspection.js';
import { isPlaceholderImage } from './placeholder-png.js';
import {
  THEME_ICONS,
  THEME_LIMITS,
  THEME_MATERIAL_SURFACES,
  THEME_MATERIALS,
  THEME_SLOTS,
  themeManifestSchema,
  type ThemeManifest,
} from './schema.js';

export type AssetReport = {
  id: string;
  path: string;
  bytes: number;
  info?: ThemeImageInfo;
  digest?: string;
  /** Set when the image failed inspection; `info` is then absent. */
  imageError?: string;
  /** Set when the manifest declared a `sha256` that the bytes do not produce. */
  digestMismatch?: { declared: string; actual: string };
  /** Slots the asset is actually drawn in. Empty means declared but never used. */
  usedIn: string[];
  /** Still the flat tint `init` generated, rather than real artwork. */
  placeholder?: boolean;
};

export type VerifyIssue = { severity: 'error' | 'warning'; path: string; message: string };

/**
 * Which slots draw each asset.
 *
 * Both the shared `decoration` table and the per-mode `variantDecorations`
 * override it, and either may carry `compact`/`regular` variants underneath, so
 * all three layers are walked. Used for two separate purposes below: telling an
 * author about artwork nothing draws, and sizing the memory budget by the slot
 * the picture actually fills.
 */
export function assetUsage(manifest: ThemeManifest): Map<string, Set<string>> {
  const usage = new Map<string, Set<string>>();
  const note = (asset: string, slot: string) =>
    usage.set(asset, (usage.get(asset) ?? new Set()).add(slot));
  const walk = (table: ThemeManifest['decoration'] | undefined) => {
    for (const [slot, decoration] of Object.entries(table ?? {})) {
      if (!decoration) continue;
      for (const entry of [decoration, decoration.regular, decoration.compact])
        if (entry && typeof entry === 'object') note(entry.asset, slot);
    }
  };
  walk(manifest.decoration);
  walk(manifest.variantDecorations?.light);
  walk(manifest.variantDecorations?.dark);
  for (const [name, icon] of Object.entries(manifest.icons ?? {}))
    if (icon) note(icon.asset, `icons.${name}`);
  if (manifest.homeIdentity?.logo?.mode === 'custom')
    note(manifest.homeIdentity.logo.asset, 'homeIdentity.logo');
  return usage;
}

/**
 * A phone at 3x, which is the largest screen `compact` artwork ever fills.
 *
 * `THEME_LIMITS.imagePixels` is 16 megapixels, and that is a ceiling against a
 * decode bomb rather than advice. It says nothing about the number an author can
 * act on: an image is decoded to width x height x 4 bytes and held for as long
 * as its slot is on screen, so a 1254x1254 drawing behind a 44pt navigation bar
 * costs 6.3 MB to show a strip it could have filled at a twentieth of that.
 */
const FULL_SCREEN_EDGE = 3000;
/** Bars, docks and tiles. None of them is ever a third of the screen. */
const CHROME_EDGE = 1024;
/**
 * The slots that genuinely cover a screen.
 *
 * `home.background` belongs here as much as `shell.background` does: it does not
 * sit beside the wallpaper, it replaces it on Home. Budgeting it as chrome
 * warned about correctly-sized wallpaper, which is the kind of false alarm that
 * teaches an author to stop reading warnings.
 */
const FULL_SCREEN_SLOTS: ReadonlySet<string> = new Set(['shell.background', 'home.background']);

/**
 * Everything that can be checked about a package's images without decoding one.
 *
 * The app validates artwork at install time, in the native asset layer, which is
 * exactly the wrong moment for an author to find out. Three of those checks are
 * pure byte inspection and belong here: the container is a static PNG/JPEG/WebP
 * and not an animation, the pixel count is within the limit, and a declared
 * `sha256` matches the file it names.
 */
export function verifyAssets(
  manifest: ThemeManifest,
  assets: Record<string, Uint8Array>
): { reports: AssetReport[]; issues: VerifyIssue[] } {
  const usage = assetUsage(manifest);
  const reports: AssetReport[] = [];
  const issues: VerifyIssue[] = [];
  for (const [id, declared] of Object.entries(manifest.assets ?? {})) {
    const bytes = assets[id];
    if (!bytes) continue;
    const path = 'path' in declared ? declared.path : declared.url;
    const report: AssetReport = {
      id,
      path,
      bytes: bytes.length,
      digest: sha256(bytes),
      usedIn: [...(usage.get(id) ?? [])],
    };
    try {
      report.info = inspectThemeImage(bytes);
    } catch (error) {
      report.imageError = error instanceof Error ? error.message : String(error);
      issues.push({ severity: 'error', path: `assets.${id}`, message: report.imageError });
    }
    if (declared.sha256 && declared.sha256 !== report.digest) {
      report.digestMismatch = { declared: declared.sha256, actual: report.digest! };
      issues.push({
        severity: 'error',
        path: `assets.${id}.sha256`,
        message: `declared ${declared.sha256.slice(0, 12)}… but the bytes are ${report.digest!.slice(0, 12)}…`,
      });
    }
    // Warnings from here down. A pack that ignores all of them still installs
    // and still draws; an author with a reason to ship something large is not
    // stopped by a linter.
    if (report.info) {
      const fullScreen = report.usedIn.some((slot) => FULL_SCREEN_SLOTS.has(slot));
      const budget = fullScreen ? FULL_SCREEN_EDGE : CHROME_EDGE;
      const edge = Math.max(report.info.width, report.info.height);
      if (edge > budget)
        issues.push({
          severity: 'warning',
          path: `assets.${id}`,
          message:
            `${report.info.width}x${report.info.height} is larger than ${budget}px on its ` +
            `longest edge (${((report.info.width * report.info.height * 4) / 1_000_000).toFixed(1)} MB decoded)`,
        });
    }
    if (!report.usedIn.length)
      issues.push({
        severity: 'warning',
        path: `assets.${id}`,
        message: 'declared but never drawn',
      });
    // Warning rather than error on purpose: packing a theme whose artwork is
    // still the scaffold is a completely reasonable thing to do while working on
    // it. The point is that nobody does it without being told.
    if (isPlaceholderImage(bytes)) {
      report.placeholder = true;
      issues.push({
        severity: 'warning',
        path: `assets.${id}`,
        message: 'still the placeholder written by `muqun-theme init`',
      });
    }
    reports.push(report);
  }
  return { reports, issues };
}

/** The keys the manifest schema keeps; anything else is dropped on parse. */
const MANIFEST_KEYS = new Set(Object.keys(themeManifestSchema.shape));

/**
 * Names a pack may legitimately use that this build has never heard of.
 *
 * Every open part of the schema funnels through here, because they all have the
 * same two facts: the name is accepted so an older app is not broken by a newer
 * pack, and the author still has to be told, because nothing at runtime ever
 * will. `docs/theme-contract.md` in the app repository is the argument.
 */
function unknownNames(
  values: Iterable<string>,
  known: readonly string[],
  path: (name: string) => string,
  noun: string
): VerifyIssue[] {
  const set = new Set<string>(known);
  return [...values]
    .filter((name) => !set.has(name))
    .map((name) => ({
      severity: 'warning' as const,
      path: path(name),
      message: `not ${noun} this build knows (known: ${known.join(', ')})`,
    }));
}

/**
 * Manifest-level checks the schema deliberately does not make.
 *
 * The open parts of the schema -- icon names, decoration slots, material
 * surfaces and values, and the manifest root itself -- accept names this build
 * does not know, because a name an older app has not heard of is
 * indistinguishable from one that was not supplied, and failing the whole theme
 * over it would make every future addition a breaking change for everyone who
 * has not updated. The cost of that tolerance is that a typo is silent at
 * runtime. This is where it stops being silent: reported to the author, who can
 * still fix it, and only as a warning, because the pack does install.
 *
 * `raw` is the parsed JSON before the schema saw it. Unknown root keys are
 * *dropped* by `parseThemeManifest`, so by the time a `ThemeManifest` exists
 * they are gone and cannot be reported from it.
 */
export function verifyManifest(manifest: ThemeManifest, raw?: unknown): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const declared = (value: unknown) =>
    value && typeof value === 'object' ? Object.keys(value) : [];

  if (raw && typeof raw === 'object')
    for (const key of Object.keys(raw))
      if (!MANIFEST_KEYS.has(key))
        issues.push({
          severity: 'warning',
          path: key,
          message: 'not a field this build reads; it will be ignored',
        });

  issues.push(
    ...unknownNames(
      declared(manifest.icons),
      THEME_ICONS,
      (name) => `icons.${name}`,
      'a glyph'
    )
  );
  for (const [path, value] of [
    ['decoration', manifest.decoration],
    ['variantDecorations.light', manifest.variantDecorations?.light],
    ['variantDecorations.dark', manifest.variantDecorations?.dark],
  ] as const)
    issues.push(
      ...unknownNames(
        declared(value),
        THEME_SLOTS,
        (name) => `${path}.${name}`,
        'a slot'
      )
    );
  issues.push(
    ...unknownNames(
      declared(manifest.materials),
      THEME_MATERIAL_SURFACES,
      (name) => `materials.${name}`,
      'a surface'
    )
  );
  // The value, not the key. An unrecognised material parsed to `auto` rather
  // than failing, which is right for a reader and invisible to an author -- so
  // it is read back off `raw`, where what they actually wrote still exists.
  if (raw && typeof raw === 'object' && 'materials' in raw)
    for (const [surface, value] of Object.entries(
      (raw as { materials?: Record<string, unknown> }).materials ?? {}
    ))
      if (typeof value === 'string' && !THEME_MATERIALS.includes(value as 'auto'))
        issues.push({
          severity: 'warning',
          path: `materials.${surface}`,
          message: `"${value}" is not a material this build has; it will render as auto (known: ${THEME_MATERIALS.join(', ')})`,
        });
  const count = Object.keys(manifest.assets ?? {}).length;
  if (count > THEME_LIMITS.assets)
    issues.push({
      severity: 'error',
      path: 'assets',
      message: `${count} assets declared, at most ${THEME_LIMITS.assets} are allowed`,
    });
  return issues;
}
