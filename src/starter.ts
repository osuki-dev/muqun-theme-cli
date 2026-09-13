import { parseThemeManifest, type ThemeManifest } from './schema.js';
import { THEME_STARTER_JSON } from './starter-data.js';

export { THEME_STARTER_JSON };

/**
 * The starter manifest, parsed fresh for each caller.
 *
 * Colours only, because that is what the app's own starter is, and this stays a
 * faithful snapshot of it -- `__tests__/skill.test.ts` pins it to the authoring
 * skill, so it cannot quietly grow. The complete theme `init` writes is a
 * different thing built on top of this one: see `scaffold.ts`, which is this
 * package's own artefact and has no upstream counterpart.
 *
 * Parsed rather than cast: the snapshot is revalidated on every call, so a bad
 * edit to `starter-data.ts` fails here instead of producing a theme that only
 * falls over once someone tries to install it. Each caller gets its own copy,
 * which `init` then edits.
 */
export function createThemeStarter(): ThemeManifest {
  return parseThemeManifest(THEME_STARTER_JSON);
}
