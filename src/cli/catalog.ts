import { createHash } from 'node:crypto';

import { Effect, FileSystem, Path } from 'effect';

import { sha256 } from '../digest.js';
import { unpackTheme } from '../package.js';
import type { ThemeManifest } from '../schema.js';
import { DIST_DIR, type ThemesRepo } from './repo.js';
import { CommandError, declaredAssets, fail, readManifestFile } from './theme-source.js';

/**
 * The catalogue of a themes repository, as one file.
 *
 * `index.json` at the repository root lists every packed theme with the
 * metadata a reader needs before downloading anything: name, description,
 * tags, version, size, digest. It is generated from `dist/` by `muqun-theme
 * index`, held current by `muqun-theme check`, and read back by `muqun-theme
 * list` and by the website -- one request instead of one per theme, and the
 * same answer from both. Only packed themes are listed, because the index is
 * what a reader can install; a source without a package is `check`'s problem.
 *
 * Everything in it derives from repository content and nothing else, so two
 * runs over the same tree produce the same bytes and a stale index is a diff.
 */
export const INDEX_FILE = 'index.json';
export const INDEX_FORMAT = 'muqun-themes-index';
export const DEFAULT_REPO = 'osuki-dev/muqun-themes';
/**
 * The built artefacts live on their own branch. `main` holds sources and is
 * what people review; CI runs `build` after a merge and publishes `dist/` and
 * `index.json` to `release`, rebuilt whole each time so binaries never pile up
 * in history.
 */
export const DEFAULT_REF = 'release';

export type IndexEntry = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author?: string;
  readonly license?: string;
  readonly source?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly minAppVersion?: string;
  /** Repository-relative path of the package, e.g. `dist/grand-voyage.muqun-theme`. */
  readonly package: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly assets: number;
  /**
   * A digest of the source the package was built from: `theme.json` and every
   * declared asset. `build` compares it to the current source to decide
   * whether a package needs repacking, which is what lets a repository of many
   * themes rebuild -- and re-upload -- only the ones a merge actually touched.
   * Absent when the index was written without the source at hand.
   */
  readonly sourceDigest?: string;
};

/**
 * The digest of a theme source, as `build` uses it.
 *
 * Over the bytes of `theme.json` and of every declared asset, each prefixed
 * by its id and path so a renamed file changes the digest too. Deliberately
 * the source and not the package: packing converts artwork and rewrites
 * digests, so two packs of one source need not be byte-identical, but one
 * source has exactly one digest.
 */
export const sourceDigest = (
  dir: string,
  manifest: ThemeManifest
): Effect.Effect<string, CommandError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const hash = createHash('sha256');
    const json = yield* fs
      .readFile(path.join(dir, 'theme.json'))
      .pipe(Effect.mapError(() => fail(`Expected a theme.json in ${dir}.`)));
    hash.update('theme.json\0').update(json).update('\0');
    const assets = yield* declaredAssets(dir, manifest);
    for (const id of Object.keys(assets).sort()) {
      const asset = manifest.assets?.[id];
      const file = asset && 'path' in asset ? asset.path : '';
      hash.update(`${id}\0${file}\0`).update(assets[id]!).update('\0');
    }
    return hash.digest('hex');
  });

export type ThemesIndex = {
  readonly format: typeof INDEX_FORMAT;
  readonly themes: readonly IndexEntry[];
};

const PACKAGE_SUFFIX = '.muqun-theme';

/** Build the index from what is packed in `dist/`. */
export const buildIndex = (
  repo: ThemesRepo
): Effect.Effect<ThemesIndex, CommandError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = (yield* fs.readDirectory(repo.dist).pipe(Effect.orElseSucceed(() => [])))
      .filter((name) => name.endsWith(PACKAGE_SUFFIX))
      .sort();

    const themes: IndexEntry[] = [];
    for (const name of names) {
      const file = path.join(repo.dist, name);
      const bytes = yield* fs
        .readFile(file)
        .pipe(Effect.mapError(() => fail(`Could not read ${DIST_DIR}/${name}.`)));
      const { manifest, assets } = yield* Effect.try({
        try: () => unpackTheme(bytes),
        catch: (error) =>
          fail(`${DIST_DIR}/${name}: ${error instanceof Error ? error.message : String(error)}`),
      });
      // The source digest, when the source is here to digest. A package whose
      // source is gone or broken is check's problem; the index still lists it.
      const source = path.join(repo.src, manifest.id);
      const digest = yield* readManifestFile(path.join(source, 'theme.json')).pipe(
        Effect.flatMap((loaded) => sourceDigest(source, loaded.manifest)),
        Effect.option
      );
      themes.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        ...(manifest.author !== undefined && { author: manifest.author }),
        ...(manifest.license !== undefined && { license: manifest.license }),
        ...(manifest.source !== undefined && { source: manifest.source }),
        ...(manifest.description !== undefined && { description: manifest.description }),
        ...(manifest.tags !== undefined && { tags: manifest.tags }),
        ...(manifest.minAppVersion !== undefined && { minAppVersion: manifest.minAppVersion }),
        package: `${DIST_DIR}/${name}`,
        bytes: bytes.length,
        sha256: sha256(bytes),
        assets: Object.keys(assets).length,
        ...(digest._tag === 'Some' && { sourceDigest: digest.value }),
      });
    }
    return { format: INDEX_FORMAT, themes };
  });

export const renderIndex = (index: ThemesIndex): string => `${JSON.stringify(index, null, 2)}\n`;

/** Parse a published index, refusing anything that is not one. */
export const parseIndex = (text: string): Effect.Effect<ThemesIndex, CommandError> =>
  Effect.try({
    try: () => {
      const value = JSON.parse(text) as { format?: unknown; themes?: unknown };
      if (value?.format !== INDEX_FORMAT || !Array.isArray(value.themes))
        throw new Error(`Not a themes index: expected "format": "${INDEX_FORMAT}" and a "themes" array.`);
      return value as ThemesIndex;
    },
    catch: (error) => fail(error instanceof Error ? error.message : String(error)),
  });

export const indexUrl = (repo: string, ref: string): string =>
  `https://raw.githubusercontent.com/${repo}/${ref}/${INDEX_FILE}`;

export const packageUrl = (repo: string, ref: string, entry: IndexEntry): string =>
  `https://raw.githubusercontent.com/${repo}/${ref}/${entry.package}`;

/**
 * The text of an index, from a URL or a local file.
 *
 * `GITHUB_TOKEN` is sent when present, which is what makes a private
 * repository readable and is otherwise ignored. A local path is how the
 * command is tested and how a repository can list itself before publishing.
 */
export const readIndexSource = (
  from: string
): Effect.Effect<string, CommandError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    if (!/^https?:\/\//.test(from)) {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs
        .readFileString(from)
        .pipe(Effect.mapError(() => fail(`Could not read ${from}.`)));
    }
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = { accept: 'application/json, text/plain' };
    if (token) headers.authorization = `Bearer ${token}`;
    return yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(from, { headers });
        if (response.status === 404)
          throw new Error(
            `${from} was not found. The repository may be private (set GITHUB_TOKEN), ` +
              `or it has no ${INDEX_FILE} yet.`
          );
        if (!response.ok) throw new Error(`${from} answered ${response.status} ${response.statusText}.`);
        return await response.text();
      },
      catch: (error) => fail(error instanceof Error ? error.message : String(error)),
    });
  });

export type ListQuery = {
  readonly search?: string;
  readonly page: number;
  readonly perPage: number;
};

export type ListPage = {
  readonly entries: readonly IndexEntry[];
  readonly page: number;
  readonly pages: number;
  /** Themes in the index. */
  readonly total: number;
  /** Themes matching the search, before paging. */
  readonly matched: number;
};

const haystack = (entry: IndexEntry): string =>
  [entry.id, entry.name, entry.author, entry.description, ...(entry.tags ?? [])]
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
    .toLowerCase();

/** Search is a case-insensitive substring over id, name, author, description and tags. */
export const selectPage = (index: ThemesIndex, query: ListQuery): ListPage => {
  const needle = query.search?.trim().toLowerCase();
  const matched = needle ? index.themes.filter((entry) => haystack(entry).includes(needle)) : index.themes;
  const perPage = Math.max(1, query.perPage);
  const pages = Math.max(1, Math.ceil(matched.length / perPage));
  const page = Math.max(1, query.page);
  const start = (page - 1) * perPage;
  return {
    entries: matched.slice(start, start + perPage),
    page,
    pages,
    total: index.themes.length,
    matched: matched.length,
  };
};
