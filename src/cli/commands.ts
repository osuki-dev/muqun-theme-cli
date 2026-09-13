import { Effect, FileSystem, Path } from 'effect';

import { formatThemeJson } from '../format-json.js';
import { themeOpacityPolicy } from '../opacity-policy.js';
import { packTheme, unpackTheme } from '../package.js';
import { createThemeScaffold, scaffoldFiles } from '../scaffold.js';
import { THEME_LIMITS } from '../schema.js';
import { createThemeStarter } from '../starter.js';
import { verifyAssets, verifyManifest } from '../verify.js';
import {
  bold,
  countErrors,
  dim,
  green,
  issueLines,
  optimizationLines,
  red,
  size,
  travel,
} from './format.js';
import { optimizeAssets } from './optimize.js';
import { out } from './output.js';
import type { Output } from './output.js';
import {
  CommandError,
  declaredAssets,
  fail,
  readManifestFile,
  readTheme,
  undeclaredFiles,
  writeFile,
  writeText,
} from './theme-source.js';

/**
 * The commands.
 *
 * Each is an Effect over three things and nothing else: the filesystem, the
 * output port, and pure domain functions. The argument parsing that used to be
 * tangled through here lives in `main.ts`, and the printing lives in
 * `format.ts`, so what remains is the decision each command actually makes.
 */
export type Env = FileSystem.FileSystem | Path.Path | Output;

/** Commands report failure by value, so the runner can set an exit code. */
export type Outcome = { readonly ok: boolean };
const ok: Outcome = { ok: true };
const bad: Outcome = { ok: false };

export const validate = (target: string): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const { manifest, assets, raw } = yield* readTheme(target);
    const issues = [...verifyManifest(manifest, raw)];
    let count = 0;
    if (assets) {
      const verified = verifyAssets(manifest, assets);
      issues.push(...verified.issues);
      count = verified.reports.length;
    }
    const errors = countErrors(issues);

    yield* out(
      `${errors ? red('invalid') : green('valid')} ${bold(manifest.name)} ` +
        dim(`(${manifest.id} ${manifest.version})`)
    );
    if (assets) {
      const bytes = Object.values(assets).reduce((total, asset) => total + asset.length, 0);
      yield* out(dim(`  ${count}/${THEME_LIMITS.assets} asset(s), ${size(bytes)} of artwork`));
    }
    for (const line of issueLines(issues)) yield* out(line);
    return errors ? bad : ok;
  });

/**
 * The opacity floor, and the colour pairs that set it.
 *
 * The floor alone tells an author their slider stops at 80% without telling them
 * why. The pairs are the actionable half: the group's floor is the highest of
 * them, so the list names precisely which colours to change. Both modes print
 * because the app clamps them to a shared floor.
 */
export const contrast = (target: string): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const { manifest } = yield* readTheme(target);
    yield* out(`${bold(manifest.name)} ${dim(manifest.id)}`);

    let problems = 0;
    const floors: Record<'surface' | 'terminal', number[]> = { surface: [], terminal: [] };

    for (const mode of ['light', 'dark'] as const) {
      const policy = themeOpacityPolicy(manifest.variants[mode]);
      floors.surface.push(policy.surface.minimum);
      floors.terminal.push(policy.terminal.minimum);
      yield* out(
        `  ${bold(mode.padEnd(5))} interface ${(policy.surface.minimum * 100).toFixed(0)}%` +
          `  terminal ${(policy.terminal.minimum * 100).toFixed(0)}%` +
          (policy.ansiIssues.length ? dim(`  ${policy.ansiIssues.length} ANSI below 4.5:1`) : '')
      );
      for (const [label, group] of [
        ['interface', policy.surface],
        ['terminal', policy.terminal],
      ] as const) {
        const binding = group.explain().filter((pair) => pair.floor > 0);
        if (!binding.length) continue;
        yield* out(dim(`    ${label} floor is set by:`));
        for (const pair of binding.slice(0, 5))
          yield* out(
            `      ${(pair.floor * 100).toFixed(0).padStart(3)}%  ${pair.path} ` +
              dim(`(needs ${pair.required}:1)`)
          );
      }
      for (const issue of [...policy.surface.baselineIssues, ...policy.terminal.baselineIssues]) {
        problems += 1;
        yield* out(
          `    ${red('fails at full opacity')} ${issue.path} ` +
            `${issue.ratio.toFixed(2)}:1 < ${issue.required}:1`
        );
      }
    }

    const shared = {
      surface: Math.max(...floors.surface),
      terminal: Math.max(...floors.terminal),
    };
    for (const [role, floor] of Object.entries(shared))
      yield* out(`  ${role.padEnd(9)} slider ${(floor * 100).toFixed(0)}%-100%  ${travel(floor)}`);
    if (
      Math.min(...floors.surface) < shared.surface ||
      Math.min(...floors.terminal) < shared.terminal
    )
      yield* out(
        dim('  Both modes share the stricter floor, so the tighter palette decides the slider.')
      );
    return problems ? bad : ok;
  });

export const pack = (
  dir: string,
  output?: string,
  optimize = true
): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = path.resolve(dir);
    const { manifest: sourceManifest, raw: sourceRaw } = yield* readManifestFile(
      path.join(root, 'theme.json')
    );
    const sourceAssets = yield* declaredAssets(root, sourceManifest);

    const extra = yield* undeclaredFiles(root, sourceManifest);
    if (extra.length)
      yield* out(
        dim(
          `Leaving out ${extra.length} file(s) the manifest does not declare: ` +
            `${extra.slice(0, 6).join(', ')}${extra.length > 6 ? '…' : ''}`
        )
      );

    /*
     * Order matters here, and it is the whole answer to "what happens to a
     * digest the author declared".
     *
     * This check runs against the bytes on disk, before anything is converted.
     * A `sha256` in the manifest is a claim the author made about those bytes;
     * if it is already false, the pack is refused and they see it. Only a claim
     * that was true is allowed to be recomputed and rewritten by optimisation
     * below, and that rewrite is then reported per asset.
     */
    const verifiedSource = verifyAssets(sourceManifest, sourceAssets);
    const sourceErrors = [
      ...verifyManifest(sourceManifest, sourceRaw),
      ...verifiedSource.issues,
    ].filter(
      (issue) => issue.severity === 'error'
    );
    if (sourceErrors.length) {
      yield* out(red('refusing to pack:'));
      for (const line of issueLines(sourceErrors)) yield* out(line);
      return bad;
    }

    let manifest = sourceManifest;
    let assets = sourceAssets;
    if (optimize) {
      const optimized = yield* optimizeAssets(sourceManifest, sourceAssets);
      manifest = optimized.manifest;
      assets = optimized.assets;
      for (const line of optimizationLines(optimized.reports)) yield* out(line);
    }

    /*
     * Placeholder detection reads a marker in a PNG `tEXt` chunk, and converting
     * to WebP drops it -- so asking the optimised bytes whether they are still
     * scaffold artwork would always answer no, exactly when the answer matters.
     * The source is the honest thing to ask.
     */
    const placeholderWarnings = verifiedSource.issues.filter((issue) =>
      issue.message.includes('placeholder')
    );
    const postWarnings = verifyAssets(manifest, assets).issues.filter(
      (issue) => issue.severity === 'warning' && !issue.message.includes('placeholder')
    );
    for (const line of issueLines([...placeholderWarnings, ...postWarnings])) yield* out(line);

    const bytes = yield* Effect.try({
      try: () => packTheme({ manifest, assets }),
      catch: (error) => fail(error instanceof Error ? error.message : String(error)),
    });
    const target = path.resolve(output ?? `${manifest.id}.muqun-theme`);
    yield* writeFile(target, bytes);

    // Round trip through the importer the phone runs, so "it packed" and "it
    // installs" are the same claim rather than two hopeful ones.
    const back = yield* Effect.try({
      try: () => unpackTheme(bytes),
      catch: (error) => fail(error instanceof Error ? error.message : String(error)),
    });
    if (back.manifest.id !== manifest.id) return yield* Effect.fail(fail('Round trip changed the theme id.'));
    if (Object.keys(back.assets).length !== Object.keys(assets).length)
      return yield* Effect.fail(fail('Round trip lost an asset.'));

    yield* out(
      `${green('packed')} ${path.basename(target)}  ${size(bytes.length)}  ` +
        `${Object.keys(assets).length} asset(s)  ${dim('round trip ok')}`
    );
    yield* out(dim(`  package limit ${size(THEME_LIMITS.packageBytes)}`));
    return ok;
  });

export const unpack = (file: string, dir: string): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const bytes = yield* fs
      .readFile(path.resolve(file))
      .pipe(Effect.mapError(() => fail(`No such file or directory: ${file}`)));
    const { manifest, assets } = yield* Effect.try({
      try: () => unpackTheme(bytes),
      catch: (error) => fail(error instanceof Error ? error.message : String(error)),
    });

    const root = path.resolve(dir);
    yield* writeText(path.join(root, 'theme.json'), formatThemeJson(JSON.stringify(manifest)));
    for (const [id, content] of Object.entries(assets)) {
      const asset = (manifest.assets ?? {})[id];
      if (!asset || !('path' in asset)) continue;
      yield* writeFile(path.join(root, asset.path), content);
    }
    yield* out(
      `${green('unpacked')} ${manifest.id} into ${dir} ` +
        dim(`(theme.json + ${Object.keys(assets).length} asset(s))`)
    );
    return ok;
  });

export const init = (
  slug: string | undefined,
  dir: string,
  colorsOnly: boolean
): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(dir);
    yield* fs
      .makeDirectory(path.join(root, 'assets'), { recursive: true })
      .pipe(Effect.mapError(() => fail(`Could not create ${dir}.`)));

    if (colorsOnly) {
      const starter = createThemeStarter();
      const manifest = slug ? { ...starter, id: slug, name: slug } : starter;
      yield* writeText(path.join(root, 'theme.json'), formatThemeJson(JSON.stringify(manifest)));
      yield* out(
        `${green('created')} ${path.join(dir, 'theme.json')} ` +
          dim('(colours only, and already passes the contrast gate)')
      );
      return ok;
    }

    const scaffold = yield* Effect.try({
      try: () => createThemeScaffold(slug),
      catch: (error) => fail(error instanceof Error ? error.message : String(error)),
    });
    yield* writeText(
      path.join(root, 'theme.json'),
      formatThemeJson(JSON.stringify(scaffold.manifest))
    );
    const files = scaffoldFiles(scaffold);
    for (const file of files) yield* writeFile(path.join(root, file.path), file.bytes);

    const slots = Object.keys(scaffold.manifest.decoration ?? {}).length + 1;
    yield* out(
      `${green('created')} ${path.join(dir, 'theme.json')} ` +
        dim(`(${slots} decoration slots, ${files.length} placeholder images)`)
    );
    yield* out(
      dim('  Replace the flat tints in assets/ with real artwork, or delete slots you do not want.')
    );
    yield* out(dim(`  Next: muqun-theme contrast ${dir}    then: muqun-theme pack ${dir}`));
    return ok;
  });
