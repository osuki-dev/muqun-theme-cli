import { Data, Effect, FileSystem, Path } from 'effect';

import { unpackTheme } from '../package.js';
import { parseThemeManifest, type ThemeManifest } from '../schema.js';

/**
 * Everything the commands need from the outside world.
 *
 * The domain is pure and synchronous -- `unpackTheme` takes bytes and returns a
 * manifest -- so this module is the entire boundary between it and a disk. Both
 * services come from Effect rather than being invented here, which is what lets
 * a command be tested against an in-memory filesystem.
 */

/** A failure with a sentence an author can act on, as opposed to a stack trace. */
export class CommandError extends Data.TaggedError('CommandError')<{
  readonly message: string;
}> {}

export const fail = (message: string) => new CommandError({ message });

export type LoadedTheme = {
  readonly manifest: ThemeManifest;
  /** Absent for a bare manifest, which carries no artwork to check. */
  readonly assets?: Record<string, Uint8Array>;
  /**
   * The manifest as written, before the schema dropped anything from it.
   *
   * `verifyManifest` needs it to report keys this build does not read: they are
   * gone from `manifest` by construction, so the parsed value cannot tell an
   * author about a field that was silently ignored.
   *
   * Absent when the source was a package. `unpackTheme` parses inside the
   * domain and hands back only the manifest, and the author-facing case is a
   * directory or a bare `theme.json` -- what someone validates while writing a
   * theme. Threading it through the zip path as well would mean widening a pure
   * function's return for a case nobody authors in.
   */
  readonly raw?: unknown;
};

/** Parse a manifest, turning a schema failure into a CommandError. */
export const parseManifest = (
  text: string
): Effect.Effect<{ manifest: ThemeManifest; raw: unknown }, CommandError> =>
  Effect.try({
    try: () => ({ manifest: parseThemeManifest(text), raw: JSON.parse(text) as unknown }),
    catch: (error) => fail(error instanceof Error ? error.message : String(error)),
  });

const unpack = (bytes: Uint8Array): Effect.Effect<LoadedTheme, CommandError> =>
  Effect.try({
    try: () => {
      const { manifest, assets } = unpackTheme(bytes);
      return { manifest, assets };
    },
    catch: (error) => fail(error instanceof Error ? error.message : String(error)),
  });

export const readManifestFile = (
  file: string
): Effect.Effect<{ manifest: ThemeManifest; raw: unknown }, CommandError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(file)
      .pipe(Effect.mapError(() => fail(`Expected a theme.json at ${file}.`)));
    return yield* parseManifest(text);
  });

/** Collect exactly the files the manifest declares, and nothing else. */
export const declaredAssets = (
  dir: string,
  manifest: ThemeManifest
): Effect.Effect<Record<string, Uint8Array>, CommandError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const assets: Record<string, Uint8Array> = {};
    for (const [id, asset] of Object.entries(manifest.assets ?? {})) {
      // A `url` asset is downloaded by the app after link review. It is legal in
      // a manifest and impossible in an offline package, so it is skipped rather
      // than treated as a missing file.
      if (!('path' in asset)) continue;
      assets[id] = yield* fs
        .readFile(path.join(dir, asset.path))
        .pipe(Effect.mapError(() => fail(`Asset "${id}" names ${asset.path}, which is not in ${dir}.`)));
    }
    return assets;
  });

/**
 * Read a theme from any of the three shapes an author has on disk.
 *
 * A packed `.muqun-theme`, a bare `.muqun-theme.json` manifest, or the unpacked
 * directory between them. Accepting a directory is what lets every command take
 * the same argument: someone editing `theme.json` beside an `assets/` folder
 * should not have to pack first just to see a contrast number.
 */
export const readTheme = (
  target: string
): Effect.Effect<LoadedTheme, CommandError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolved = path.resolve(target);

    const info = yield* fs
      .stat(resolved)
      .pipe(Effect.mapError(() => fail(`No such file or directory: ${target}`)));

    if (info.type === 'Directory') {
      const { manifest, raw } = yield* readManifestFile(path.join(resolved, 'theme.json'));
      const assets = yield* declaredAssets(resolved, manifest);
      return { manifest, assets, raw };
    }

    if (/\.(muqun-theme|zip)$/i.test(resolved)) {
      const bytes = yield* fs
        .readFile(resolved)
        .pipe(Effect.mapError(() => fail(`Could not read ${target}.`)));
      return yield* unpack(bytes);
    }

    const text = yield* fs
      .readFileString(resolved)
      .pipe(Effect.mapError(() => fail(`Could not read ${target}.`)));
    return yield* parseManifest(text);
  });

/** Files in the directory that the manifest does not declare. */
export const undeclaredFiles = (
  dir: string,
  manifest: ThemeManifest
): Effect.Effect<string[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const declared = new Set(
      Object.values(manifest.assets ?? {}).flatMap((asset) => ('path' in asset ? [asset.path] : []))
    );
    const found: string[] = [];
    const walk = (relative: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const entries = yield* fs
          .readDirectory(path.join(dir, relative))
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        for (const entry of entries) {
          const next = relative ? `${relative}/${entry}` : entry;
          const info = yield* fs.stat(path.join(dir, next)).pipe(Effect.option);
          if (info._tag === 'Some' && info.value.type === 'Directory') yield* walk(next);
          else if (next !== 'theme.json' && !declared.has(next)) found.push(next);
        }
      }).pipe(Effect.orElseSucceed(() => undefined));
    yield* walk('');
    return found;
  });

/** Write a file, creating the directories above it. */
export const writeFile = (
  file: string,
  bytes: Uint8Array
): Effect.Effect<void, CommandError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs
      .makeDirectory(path.dirname(file), { recursive: true })
      .pipe(Effect.mapError(() => fail(`Could not create ${path.dirname(file)}.`)));
    yield* fs
      .writeFile(file, bytes)
      .pipe(Effect.mapError(() => fail(`Could not write ${file}.`)));
  });

export const writeText = (
  file: string,
  text: string
): Effect.Effect<void, CommandError, FileSystem.FileSystem | Path.Path> =>
  writeFile(file, new TextEncoder().encode(text));
