import { Effect, FileSystem, Path } from 'effect';

import { formatThemeJson } from '../format-json.js';
import { themeOpacityPolicy } from '../opacity-policy.js';
import { packTheme, unpackTheme } from '../package.js';
import { createThemeScaffold, scaffoldFiles } from '../scaffold.js';
import { THEME_LIMITS, type ThemeManifest } from '../schema.js';
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
  yellow,
} from './format.js';
import { optimizeAssets } from './optimize.js';
import { out } from './output.js';
import type { Output } from './output.js';
import {
  DIST_DIR,
  SKILL_PATH,
  SRC_DIR,
  detectRepo,
  packageFileFor,
  packageName,
  resolveThemeDir,
  sourceDirFor,
} from './repo.js';
import { SKILL_TEXT, skillVersion } from './skill.js';
import {
  INDEX_FILE,
  buildIndex,
  indexUrl,
  packageUrl,
  parseIndex,
  readIndexSource,
  renderIndex,
  selectPage,
} from './catalog.js';
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

/**
 * Everything `validate` prints, plus the manifest it read.
 *
 * Split from `validate` so `check` can run the same report over every theme in
 * a repository and still compare ids and versions afterwards, without a second
 * parse and without reprinting anything.
 */
const inspect = (
  target: string
): Effect.Effect<{ readonly ok: boolean; readonly manifest: ThemeManifest }, CommandError, Env> =>
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
    return { ok: errors === 0, manifest };
  });

export const validate = (target: string): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.map(inspect(target), (result) => (result.ok ? ok : bad));

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

export type BuiltPackage =
  | {
      readonly ok: true;
      readonly manifest: ThemeManifest;
      readonly bytes: Uint8Array;
      readonly assets: number;
    }
  | { readonly ok: false };

/**
 * Everything `pack` does short of writing the file: read, verify, optimise,
 * zip, and unpack the result again to prove it round-trips.
 *
 * Shared by `pack`, by `build` (every source in a repository) and by
 * `check --sources`, which proves a source packs without keeping the result.
 * `quiet` drops the per-image report and the warnings, for callers that have
 * already printed `validate`'s view of the same theme.
 */
export const buildPackage = (
  dir: string,
  optimize = true,
  quiet = false
): Effect.Effect<BuiltPackage, CommandError, Env> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = path.resolve(dir);
    const { manifest: sourceManifest, raw: sourceRaw } = yield* readManifestFile(
      path.join(root, 'theme.json')
    );
    const sourceAssets = yield* declaredAssets(root, sourceManifest);

    const extra = yield* undeclaredFiles(root, sourceManifest);
    if (extra.length && !quiet)
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
      return { ok: false } as const;
    }

    let manifest = sourceManifest;
    let assets = sourceAssets;
    if (optimize) {
      const optimized = yield* optimizeAssets(sourceManifest, sourceAssets);
      manifest = optimized.manifest;
      assets = optimized.assets;
      if (!quiet) for (const line of optimizationLines(optimized.reports)) yield* out(line);
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
    if (!quiet)
      for (const line of issueLines([...placeholderWarnings, ...postWarnings])) yield* out(line);

    const bytes = yield* Effect.try({
      try: () => packTheme({ manifest, assets }),
      catch: (error) => fail(error instanceof Error ? error.message : String(error)),
    });

    // Round trip through the importer the phone runs, so "it packed" and "it
    // installs" are the same claim rather than two hopeful ones.
    const back = yield* Effect.try({
      try: () => unpackTheme(bytes),
      catch: (error) => fail(error instanceof Error ? error.message : String(error)),
    });
    if (back.manifest.id !== manifest.id) return yield* Effect.fail(fail('Round trip changed the theme id.'));
    if (Object.keys(back.assets).length !== Object.keys(assets).length)
      return yield* Effect.fail(fail('Round trip lost an asset.'));

    return { ok: true, manifest, bytes, assets: Object.keys(assets).length } as const;
  });

export const pack = (
  target: string,
  output?: string,
  optimize = true
): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    // `pack grand-voyage` inside a themes repository means `pack src/grand-voyage`.
    const dir = yield* resolveThemeDir(target);
    const built = yield* buildPackage(dir, optimize);
    if (!built.ok) return bad;
    // Without --out, a repository gets dist/<id>.muqun-theme and anywhere else
    // gets <id>.muqun-theme beside the author.
    const file = output ?? (yield* packageFileFor(built.manifest.id));
    yield* writeFile(path.resolve(file), built.bytes);
    yield* out(
      `${green('packed')} ${file}  ${size(built.bytes.length)}  ` +
        `${built.assets} asset(s)  ${dim('round trip ok')}`
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
  dirArg: string | undefined,
  colorsOnly: boolean
): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    /*
     * Without --dir, the theme gets a directory of its own named after its id:
     * src/<id> inside a themes repository, ./<id> anywhere else. Scaffolding
     * fourteen images into whatever directory the author happened to be in was
     * never what anyone meant.
     */
    const dir = dirArg ?? (yield* sourceDirFor(slug ?? createThemeStarter().id));
    const root = path.resolve(dir);
    // A location chosen by default is never allowed to overwrite a theme that is
    // already there. An explicit --dir is an explicit wish and still is.
    if (dirArg === undefined) {
      const taken = yield* fs
        .exists(path.join(root, 'theme.json'))
        .pipe(Effect.orElseSucceed(() => false));
      if (taken)
        return yield* Effect.fail(
          fail(`${dir} already holds a theme.json. Pick another id, or pass --dir to write there on purpose.`)
        );
    }
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

const notARepo = (rootArg: string) =>
  fail(`${rootArg} is not a themes repository: expected ${SRC_DIR}/ and ${DIST_DIR}/ directories.`);

const problemLine = (message: string): Effect.Effect<void, never, Output> =>
  out(`  ${red('error  ')} ${message}`);

const sortedNames = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const names = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as string[]));
    return [...names].sort();
  });

/** The ids of every source: a directory under `src/` holding a `theme.json`. */
const listSources = (repo: { readonly src: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ids: string[] = [];
    for (const name of yield* sortedNames(repo.src))
      if (yield* fs.exists(path.join(repo.src, name, 'theme.json')).pipe(Effect.orElseSucceed(() => false)))
        ids.push(name);
    return ids;
  });

/** The file names of every package in `dist/`. */
const listPackages = (repo: { readonly dist: string }) =>
  Effect.map(sortedNames(repo.dist), (names) => names.filter((name) => name.endsWith('.muqun-theme')));

/**
 * Every theme in a themes repository, and whether `src/` and `dist/` agree.
 *
 * The repository convention is small -- a source in `src/<id>/`, its package
 * in `dist/<id>.muqun-theme`, the catalogue in `index.json` -- and this is the
 * whole of enforcing it: each source validates, each package validates, a
 * source's directory name is its id, each has the other, the package carries
 * the source's version, and the catalogue is what `dist/` would generate. A
 * repository that also vendors the agent skill is told when that copy has
 * fallen behind the CLI checking it; that is a warning, because a stale skill
 * misinforms an agent but does not break a theme.
 *
 * With `sourcesOnly`, `dist/` and `index.json` are somebody else's job -- CI
 * builds them after a merge -- so a pull request holding only `src/<id>/` is
 * checked for the one thing it can be: every source validates and packs.
 *
 * One command, so the repository needs no script of its own and CI runs
 * exactly what a contributor runs.
 */
export const check = (
  rootArg = '.',
  sourcesOnly = false
): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const repo = yield* detectRepo(rootArg);
    if (!repo) return yield* Effect.fail(notARepo(rootArg));

    let failed = false;
    const problem = (message: string) =>
      Effect.gen(function* () {
        failed = true;
        yield* problemLine(message);
      });
    const exists = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false));

    const skillFile = path.join(repo.root, SKILL_PATH);
    if (yield* exists(skillFile)) {
      const text = yield* fs.readFileString(skillFile).pipe(Effect.orElseSucceed(() => ''));
      yield* out(bold(SKILL_PATH));
      if (text === SKILL_TEXT) yield* out(dim(`  matches this CLI (skill v${skillVersion()})`));
      else
        yield* out(
          `  ${yellow('warning')} differs from the skill this CLI carries (v${skillVersion()})` +
            dim(` -- run: muqun-theme skill --out ${SKILL_PATH}`)
        );
    }

    const sourceIds = yield* listSources(repo);
    const packages = yield* listPackages(repo);

    /** `validate`'s report under a heading, surviving a manifest that will not parse. */
    const report = (label: string, target: string) =>
      Effect.gen(function* () {
        yield* out(bold(label));
        const result = yield* inspect(target).pipe(
          Effect.catchTag('CommandError', (error) =>
            Effect.gen(function* () {
              yield* problem(error.message);
              return undefined;
            })
          )
        );
        if (result && !result.ok) failed = true;
        return result?.manifest;
      });

    for (const id of sourceIds) {
      const source = yield* report(`${SRC_DIR}/${id}`, path.join(repo.src, id));
      if (source && source.id !== id)
        yield* problem(`theme id "${source.id}" does not match its directory ${SRC_DIR}/${id}/`);

      if (sourcesOnly) {
        // Prove it packs, and keep nothing: CI builds dist/ after the merge.
        if (!source) continue;
        const built = yield* buildPackage(path.join(repo.src, id), true, true).pipe(
          Effect.catchTag('CommandError', (error) =>
            Effect.gen(function* () {
              yield* problem(error.message);
              return { ok: false } as const;
            })
          )
        );
        if (built.ok) yield* out(dim(`  packs to ${size(built.bytes.length)}, ${built.assets} asset(s)`));
        else failed = true;
        continue;
      }

      const file = packageName(id);
      if (!packages.includes(file)) {
        yield* problem(`${DIST_DIR}/${file} is missing -- run: muqun-theme pack ${id}`);
        continue;
      }
      const packed = yield* report(`${DIST_DIR}/${file}`, path.join(repo.dist, file));
      if (!source || !packed) continue;
      if (packed.id !== source.id)
        yield* problem(
          `${DIST_DIR}/${file} holds "${packed.id}", not "${source.id}" -- run: muqun-theme pack ${id}`
        );
      else if (packed.version !== source.version)
        yield* problem(
          `${DIST_DIR}/${file} is ${packed.version} but ${SRC_DIR}/${id} is ${source.version}` +
            ` -- run: muqun-theme pack ${id}`
        );
    }

    if (!sourcesOnly) {
      for (const file of packages) {
        const id = file.slice(0, -'.muqun-theme'.length);
        if (sourceIds.includes(id)) continue;
        yield* out(bold(`${DIST_DIR}/${file}`));
        yield* problem(`has no source in ${SRC_DIR}/${id}/ -- every package is built from a source here`);
      }

      // The catalogue is generated from dist/, so "current" is a byte comparison.
      // A package that would not unpack was already reported above; skip the
      // comparison then rather than blaming the index for it.
      const expected = yield* buildIndex(repo).pipe(
        Effect.catchTag('CommandError', () => Effect.succeed(undefined))
      );
      if (expected) {
        yield* out(bold(INDEX_FILE));
        const current = yield* fs.readFileString(path.join(repo.root, INDEX_FILE)).pipe(Effect.option);
        if (current._tag === 'None') yield* problem(`${INDEX_FILE} is missing -- run: muqun-theme index`);
        else if (current.value !== renderIndex(expected))
          yield* problem(`${INDEX_FILE} does not match ${DIST_DIR}/ -- run: muqun-theme index`);
        else yield* out(dim(`  current (${expected.themes.length} theme(s))`));
      }
    }

    yield* out('');
    if (failed) {
      yield* out(red('check failed'));
      return bad;
    }
    yield* out(
      `${green('check ok')} ${dim(sourceIds.length ? `${sourceIds.length} theme(s)` : 'no themes yet')}`
    );
    return ok;
  });

/**
 * The agent authoring skill, printed or written to a file.
 *
 * The skill is what makes an agent produce an installable theme rather than a
 * plausible mockup, so a themes repository keeps a copy where its agents look.
 * This is how that copy is made and refreshed; `check` says when it is stale.
 */
export const skill = (outFile?: string): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    if (!outFile) {
      yield* out(SKILL_TEXT.replace(/\n$/, ''));
      return ok;
    }
    yield* writeText(outFile, SKILL_TEXT);
    yield* out(`${green('wrote')} ${outFile} ${dim(`(skill v${skillVersion()})`)}`);
    return ok;
  });

/**
 * Write the repository's catalogue, `index.json`, from what is packed.
 *
 * `check` holds it current; `list` and the website read it. Generated rather
 * than maintained, so it can never disagree with `dist/`.
 */
export const index = (rootArg = '.'): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const repo = yield* detectRepo(rootArg);
    if (!repo)
      return yield* Effect.fail(
        fail(
          `${rootArg} is not a themes repository: expected ${SRC_DIR}/ and ${DIST_DIR}/ directories.`
        )
      );
    const catalogue = yield* buildIndex(repo);
    yield* writeText(path.join(repo.root, INDEX_FILE), renderIndex(catalogue));
    yield* out(`${green('wrote')} ${INDEX_FILE} ${dim(`(${catalogue.themes.length} theme(s))`)}`);
    return ok;
  });

export type ListOptions = {
  /** A local file or URL to read the index from, instead of GitHub. */
  readonly from?: string;
  readonly repo: string;
  readonly ref: string;
  readonly search?: string;
  readonly page: number;
  readonly perPage: number;
  readonly json: boolean;
};

/**
 * The published themes, searched and paged.
 *
 * One request for the index, then everything else happens here, so the command
 * stays usable when the catalogue is long and works the same against a local
 * file. `--json` is the same page as data, for scripts and for anything that
 * wants to render it differently.
 */
export const list = (options: ListOptions): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const source = options.from ?? indexUrl(options.repo, options.ref);
    const catalogue = yield* parseIndex(yield* readIndexSource(source));
    const page = selectPage(catalogue, options);
    const remote = options.from === undefined;

    if (options.json) {
      const entries = page.entries.map((entry) => ({
        ...entry,
        ...(remote && { url: packageUrl(options.repo, options.ref, entry) }),
      }));
      yield* out(JSON.stringify({ source, ...page, entries }, null, 2));
      return page.page <= page.pages ? ok : bad;
    }

    if (page.total === 0) {
      yield* out(`no themes published yet ${dim(`(${source})`)}`);
      return ok;
    }
    const wanted = JSON.stringify(options.search ?? '');
    if (page.matched === 0) {
      yield* out(`no themes match ${wanted} ${dim(`(${page.total} in ${source})`)}`);
      return ok;
    }
    if (page.page > page.pages) {
      yield* out(red(`page ${page.page} is past the end: ${page.pages} page(s) of ${options.perPage}.`));
      return bad;
    }

    yield* out(
      dim(
        `${page.matched} theme(s)` +
          (options.search ? ` matching ${wanted}` : '') +
          `  page ${page.page}/${page.pages}  ${source}`
      )
    );
    const width = Math.max(...page.entries.map((entry) => entry.id.length));
    const indent = ' '.repeat(width + 2);
    for (const entry of page.entries) {
      yield* out(
        `${bold(entry.id.padEnd(width))}  ${entry.name}  ${dim(`v${entry.version}`)}` +
          (entry.author ? dim(`  by ${entry.author}`) : '') +
          dim(`  ${size(entry.bytes)}`)
      );
      if (entry.description) yield* out(dim(`${indent}${entry.description}`));
      if (entry.tags?.length)
        yield* out(dim(`${indent}${entry.tags.map((tag) => `#${tag}`).join(' ')}`));
    }
    if (page.page < page.pages)
      yield* out(
        dim(
          `  next: muqun-theme list --page ${page.page + 1}` +
            (options.search ? ` --search ${wanted}` : '')
        )
      );
    if (remote)
      yield* out(dim(`  packages: https://github.com/${options.repo}/tree/${options.ref}/${DIST_DIR}`));
    return ok;
  });

/**
 * Pack every source and regenerate the catalogue: `dist/` and `index.json`
 * from `src/`, in one step.
 *
 * This is what CI runs after a merge, so a pull request only ever carries a
 * source. `dist/` is made to mirror `src/` exactly -- a package whose source
 * is gone is removed -- and the index is written last, from the result, so it
 * cannot describe anything that is not there. A source that will not pack
 * fails the build before the index is touched.
 */
export const build = (rootArg = '.'): Effect.Effect<Outcome, CommandError, Env> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const repo = yield* detectRepo(rootArg);
    if (!repo) return yield* Effect.fail(notARepo(rootArg));

    let failed = false;
    const kept = new Set<string>();
    for (const id of yield* listSources(repo)) {
      yield* out(bold(`${SRC_DIR}/${id}`));
      const built = yield* buildPackage(path.join(repo.src, id), true).pipe(
        Effect.catchTag('CommandError', (error) =>
          Effect.gen(function* () {
            yield* problemLine(error.message);
            return { ok: false } as const;
          })
        )
      );
      if (!built.ok) {
        failed = true;
        continue;
      }
      if (built.manifest.id !== id) {
        yield* problemLine(`theme id "${built.manifest.id}" does not match its directory ${SRC_DIR}/${id}/`);
        failed = true;
        continue;
      }
      const file = packageName(id);
      yield* writeFile(path.join(repo.dist, file), built.bytes);
      kept.add(file);
      yield* out(
        `  ${green('packed')} ${DIST_DIR}/${file}  ${size(built.bytes.length)}  ${built.assets} asset(s)`
      );
    }

    for (const file of yield* listPackages(repo)) {
      if (kept.has(file)) continue;
      yield* fs
        .remove(path.join(repo.dist, file))
        .pipe(Effect.mapError(() => fail(`Could not remove ${DIST_DIR}/${file}.`)));
      yield* out(dim(`  removed ${DIST_DIR}/${file}: it has no source`));
    }

    yield* out('');
    if (failed) {
      yield* out(red('build failed'));
      return bad;
    }
    const catalogue = yield* buildIndex(repo);
    yield* writeText(path.join(repo.root, INDEX_FILE), renderIndex(catalogue));
    yield* out(
      `${green('built')} ${catalogue.themes.length} theme(s) ${dim(`into ${DIST_DIR}/ and ${INDEX_FILE}`)}`
    );
    return ok;
  });
