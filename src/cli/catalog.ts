import { createHash } from 'node:crypto';

import { Effect, FileSystem, Path } from 'effect';

import { sha256 } from '../digest.js';
import { inspectThemeImage } from '../image-inspection.js';
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
/**
 * Where the published catalogue is read from.
 *
 * `main` of osuki-dev/muqun-themes holds sources; after every merge CI packs
 * what changed and mirrors `index.json` and `dist/*.muqun-theme` into an R2
 * bucket that the website serves at this address, with open CORS and short
 * caching. The website's gallery and the app read the same place, so there is
 * one catalogue rather than one per reader, and none of them depends on a
 * GitHub URL or on the repository's visibility. The `release` branch of the
 * repository carries the same files as a fallback.
 */
export const DEFAULT_API = 'https://muqun.dev/api/themes/';

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
   * Repository-relative path of the theme's preview image, e.g.
   * `dist/previews/grand-voyage.webp`: the asset the manifest names as
   * `preview`, published beside the package so a gallery can show it without
   * downloading the package. Absent when the manifest declares none.
   */
  readonly preview?: string;
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

/**
 * Where preview images are published: `dist/previews/<id>.<ext>`.
 *
 * A theme's `preview` is one of its own assets, so a gallery could always get
 * it by downloading the package -- megabytes of artwork to show one card. The
 * image is copied out beside the package instead, as the bytes the package
 * holds (already optimised by `pack`), under an extension that says what the
 * bytes are rather than what the source file was called. The directory
 * mirrors the index: `build` writes it, `check` holds it current.
 */
export const PREVIEWS_DIR = 'previews';

export type PackagePreview = {
  readonly id: string;
  /** The file name under `dist/previews/`, e.g. `grand-voyage.webp`. */
  readonly file: string;
  readonly bytes: Uint8Array;
};

const PREVIEW_EXTENSION = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;

/**
 * The preview a packed theme publishes, or nothing.
 *
 * Nothing when the manifest declares no `preview`, and nothing when the bytes
 * it names are not an image the app would accept: the index says `preview`
 * only where a gallery can actually draw one.
 */
export const packagePreview = (
  manifest: ThemeManifest,
  assets: Record<string, Uint8Array>
): PackagePreview | undefined => {
  if (manifest.preview === undefined) return undefined;
  const bytes = assets[manifest.preview];
  if (!bytes) return undefined;
  try {
    const { format } = inspectThemeImage(bytes);
    return { id: manifest.id, file: `${manifest.id}.${PREVIEW_EXTENSION[format]}`, bytes };
  } catch {
    return undefined;
  }
};

/** The repository-relative path of a preview file, as the index records it. */
export const previewPath = (file: string): string => `${DIST_DIR}/${PREVIEWS_DIR}/${file}`;

export type Catalogue = {
  readonly index: ThemesIndex;
  /** Every preview the index names, with its bytes, in index order. */
  readonly previews: readonly PackagePreview[];
};

/**
 * The catalogue from what is packed in `dist/`: the index, and the preview
 * images it names. One walk over the packages, so the two cannot disagree.
 */
export const buildCatalogue = (
  repo: ThemesRepo
): Effect.Effect<Catalogue, CommandError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = (yield* fs.readDirectory(repo.dist).pipe(Effect.orElseSucceed(() => [])))
      .filter((name) => name.endsWith(PACKAGE_SUFFIX))
      .sort();

    const themes: IndexEntry[] = [];
    const previews: PackagePreview[] = [];
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
      const preview = packagePreview(manifest, assets);
      if (preview) previews.push(preview);
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
        ...(preview && { preview: previewPath(preview.file) }),
        ...(digest._tag === 'Some' && { sourceDigest: digest.value }),
      });
    }
    return { index: { format: INDEX_FORMAT, themes }, previews };
  });

/** Build the index from what is packed in `dist/`. */
export const buildIndex = (
  repo: ThemesRepo
): Effect.Effect<ThemesIndex, CommandError, FileSystem.FileSystem | Path.Path> =>
  Effect.map(buildCatalogue(repo), (catalogue) => catalogue.index);

export const renderIndex = (index: ThemesIndex): string => `${JSON.stringify(index, null, 2)}\n`;

/** Parse a published index, refusing anything that is not one. */
export const parseIndex = (text: string): Effect.Effect<ThemesIndex, CommandError> =>
  Effect.try({
    try: () => {
      if (/^\s*</.test(text))
        throw new Error(`That is a web page, not an index. Point --from at the ${INDEX_FILE} itself.`);
      const value = JSON.parse(text) as { format?: unknown; themes?: unknown };
      if (value?.format !== INDEX_FORMAT || !Array.isArray(value.themes))
        throw new Error(`Not a themes index: expected "format": "${INDEX_FORMAT}" and a "themes" array.`);
      return value as ThemesIndex;
    },
    catch: (error) => fail(error instanceof Error ? error.message : String(error)),
  });

/** The index under a base URL: `<base>index.json`. */
export const indexUrl = (base: string): string => `${withSlash(base)}${INDEX_FILE}`;

/**
 * A repository-relative path as a URL, given where its index came from.
 *
 * Packages and previews sit beside the index under the same base, on the API
 * and on the release branch alike, so the base is the index URL minus its
 * file name. A local index has no base to speak of, and gets no URL.
 */
const fileUrl = (source: string, relative: string): string | undefined => {
  if (!/^https?:\/\//.test(source)) return undefined;
  const base = source.endsWith(INDEX_FILE) ? source.slice(0, -INDEX_FILE.length) : withSlash(source);
  return `${base}${relative}`;
};

/** A package's download URL. */
export const packageUrl = (source: string, entry: IndexEntry): string | undefined =>
  fileUrl(source, entry.package);

/** A theme's preview image URL, when it publishes one. */
export const previewUrl = (source: string, entry: IndexEntry): string | undefined =>
  entry.preview === undefined ? undefined : fileUrl(source, entry.preview);

const withSlash = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/**
 * The text of an index, from a URL or a local file.
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
    return yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(from, { headers: { accept: 'application/json, text/plain' } });
        if (response.status === 404) throw new Error(`${from} was not found.`);
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
