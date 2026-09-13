/**
 * The Muqun theme format: the domain, listed in one place.
 *
 * Everything exported here is pure TypeScript over `zod` and `fflate`. There is
 * no React Native, no native module, no Effect and no filesystem access behind
 * this file, so the same code that decides whether a phone will accept a package
 * also runs here. `purity.test.ts` walks the import graph from this file to keep
 * it that way. The CLI in `cli.ts` is a layer of argument parsing and printing
 * on top of it.
 */
export {
  THEME_ICONS,
  THEME_LIMITS,
  ThemeValidationError,
  decorationSchema,
  iconsSchema,
  parseThemeManifest,
  themeColorsSchema,
  themeJsonSchema,
  themeManifestSchema,
  themeMaterialsSchema,
  type ThemeDecoration,
  type ThemeIconName,
  type ThemeImage,
  type ThemeManifest,
  type ThemeSlot,
} from './schema.js';

export { packTheme, unpackTheme, type ThemePackage } from './package.js';

export { inspectThemeImage, type ThemeImageInfo } from './image-inspection.js';

export {
  clampThemeOpacity,
  jointArtworkOpacity,
  themeOpacityPolicy,
  type OpacityIssue,
} from './opacity-policy.js';

export { auditThemeContrast, contrastRatio, type ThemeContrastIssue } from './contrast.js';

export { ThemeJsonFormatError, formatThemeJson } from './format-json.js';

export { cloneThemeData } from './clone.js';

export { sha256 } from './digest.js';

export { THEME_STARTER_JSON, createThemeStarter } from './starter.js';

export { createThemeScaffold, scaffoldFiles, type ThemeScaffold } from './scaffold.js';

export { isPlaceholderImage, parseHexColor, solidPng } from './placeholder-png.js';

export {
  assetUsage,
  verifyAssets,
  verifyManifest,
  type AssetReport,
  type VerifyIssue,
} from './verify.js';
