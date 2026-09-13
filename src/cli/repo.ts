import { Effect, FileSystem, Path } from 'effect';

/**
 * The themes repository convention.
 *
 * A themes repository is a directory holding `src/` and `dist/`: a theme is
 * authored in `src/<id>/` (theme.json beside assets/) and packed to
 * `dist/<id>.muqun-theme`. That is the whole convention, and it is detected
 * rather than configured: when a command runs inside such a directory, `init`
 * writes into `src/`, `pack` writes into `dist/`, a bare id resolves to its
 * source directory, and `check` knows what to walk.
 *
 * Both directories are required so an ordinary project with a `src/` of its
 * own is never mistaken for one.
 */
export type ThemesRepo = {
  readonly root: string;
  readonly src: string;
  readonly dist: string;
};

export const SRC_DIR = 'src';
export const DIST_DIR = 'dist';
export const SKILL_PATH = 'skills/muqun-theme/SKILL.md';

export const packageName = (id: string): string => `${id}.muqun-theme`;

const isDirectory = (
  target: string
): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.stat(target).pipe(Effect.option);
    return info._tag === 'Some' && info.value.type === 'Directory';
  });

/** The repository at `dir`, or undefined when `dir` is not laid out as one. */
export const detectRepo = (
  dir: string
): Effect.Effect<ThemesRepo | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = path.resolve(dir);
    const src = path.join(root, SRC_DIR);
    const dist = path.join(root, DIST_DIR);
    if ((yield* isDirectory(src)) && (yield* isDirectory(dist))) return { root, src, dist };
    return undefined;
  });

/** The repository the command was run from, if any. */
export const currentRepo = (): Effect.Effect<
  ThemesRepo | undefined,
  never,
  FileSystem.FileSystem | Path.Path
> => detectRepo('.');

/**
 * Where a theme lives when only its id was given.
 *
 * Inside a repository that is `src/<id>`; anywhere else it is `<id>` in the
 * current directory. Relative on purpose, so the path printed back to the
 * author reads the way they would have typed it.
 */
export const sourceDirFor = (
  id: string
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(currentRepo(), (repo) => (repo ? `${SRC_DIR}/${id}` : id));

/** Where a pack goes when no --out was given. */
export const packageFileFor = (
  id: string
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(currentRepo(), (repo) =>
    repo ? `${DIST_DIR}/${packageName(id)}` : packageName(id)
  );

/**
 * A theme named by id rather than by path.
 *
 * `pack grand-voyage` inside a repository means `pack src/grand-voyage`. The
 * fallback applies only when the argument names nothing on disk, so an actual
 * directory called `grand-voyage` in the current directory still wins.
 */
export const resolveThemeDir = (
  target: string
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (yield* isDirectory(path.resolve(target))) return target;
    const repo = yield* currentRepo();
    if (repo && (yield* isDirectory(path.join(repo.src, target)))) return `${SRC_DIR}/${target}`;
    return target;
  });
