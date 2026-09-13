import * as NodeServices from '@effect/platform-node/NodeServices';
import * as NodeStdio from '@effect/platform-node/NodeStdio';
import * as NodeTerminal from '@effect/platform-node/NodeTerminal';
import { Effect, Layer, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { DEFAULT_REF, DEFAULT_REPO } from './catalog.js';
import * as commands from './commands.js';
import { red } from './format.js';
import * as Output from './output.js';
import type { CommandError } from './theme-source.js';

import pkg from '../../package.json' with { type: 'json' };

/**
 * Argument parsing, help and exit codes.
 *
 * This is the only module that knows the CLI is a CLI. Everything below it --
 * the commands, the formatting, the domain -- is ordinary values and Effects,
 * which is why the command tests do not need a subprocess.
 */

// From package.json, so a changesets bump reaches `--version` without a
// second edit. Bun inlines the JSON at build time.
const VERSION: string = pkg.version;

const targetArgument = Argument.String('target').pipe(
  Argument.withDescription(
    'a .muqun-theme package, a .muqun-theme.json manifest, or a directory holding theme.json'
  )
);

/**
 * Commands return an outcome rather than failing, so "this theme is broken" and
 * "this command could not run" stay distinguishable. Both end as exit code 1;
 * only the second prints to stderr.
 */
const runOutcome = <R>(
  effect: Effect.Effect<commands.Outcome, CommandError, R>
): Effect.Effect<void, never, R | Output.Output> =>
  effect.pipe(
    Effect.flatMap((outcome) =>
      Effect.sync(() => {
        if (!outcome.ok) process.exitCode = 1;
      })
    ),
    // Schema failures arrive as multi-line "<path>: <message>" text. That is the
    // right level of detail for someone editing the file; it is only the wrong
    // level on a phone, where nobody can act on it.
    Effect.catchTag('CommandError', (error) =>
      Effect.gen(function* () {
        yield* Output.err(red(error.message));
        yield* Effect.sync(() => {
          process.exitCode = 1;
        });
      })
    )
  );

const validate = Command.make('validate', { target: targetArgument }).pipe(
  Command.withDescription('schema, references, images, digests and limits'),
  Command.withHandler(({ target }) => runOutcome(commands.validate(target)))
);

const contrast = Command.make('contrast', { target: targetArgument }).pipe(
  Command.withDescription('opacity floors and the colour pairs that set them'),
  Command.withHandler(({ target }) => runOutcome(commands.contrast(target)))
);

const init = Command.make('init', {
  slug: Argument.String('slug').pipe(
    Argument.withDescription('theme id, lowercase with dashes'),
    Argument.optional
  ),
  dir: Flag.String('dir').pipe(
    Flag.withAlias('d'),
    Flag.withDescription(
      'where to write the theme (default: src/<id> in a themes repository, ./<id> elsewhere)'
    ),
    Flag.optional
  ),
  colorsOnly: Flag.Boolean('colors-only').pipe(
    Flag.withDescription('write only a palette, with no assets'),
    Flag.withDefault(false)
  ),
}).pipe(
  Command.withDescription('scaffold a complete theme, with placeholder art'),
  Command.withHandler(({ slug, dir, colorsOnly }) =>
    runOutcome(commands.init(Option.getOrUndefined(slug), Option.getOrUndefined(dir), colorsOnly))
  )
);

const pack = Command.make('pack', {
  dir: Argument.String('theme').pipe(
    Argument.withDescription(
      'a directory holding theme.json, or a theme id inside a themes repository'
    )
  ),
  out: Flag.String('out').pipe(
    Flag.withAlias('o'),
    Flag.withDescription(
      'where to write the .muqun-theme (default: dist/<id>.muqun-theme in a themes repository)'
    ),
    Flag.optional
  ),
  /*
   * The escape hatch is a flag rather than a per-asset field in the manifest,
   * and that is forced rather than preferred: `assetSchema` is a zod
   * `strictObject`, so any key it does not define fails the whole manifest. An
   * opt-out living in `theme.json` would mean changing the app's schema, which
   * is the app's to change and not this tool's.
   */
  noOptimize: Flag.Boolean('no-optimize').pipe(
    Flag.withDescription('keep artwork exactly as authored, with no WebP conversion'),
    Flag.withDefault(false)
  ),
}).pipe(
  Command.withDescription('build a .muqun-theme and verify it round trips'),
  Command.withHandler(({ dir, out, noOptimize }) =>
    runOutcome(commands.pack(dir, Option.getOrUndefined(out), !noOptimize))
  )
);

const unpack = Command.make('unpack', {
  file: Argument.String('file').pipe(Argument.withDescription('a .muqun-theme package')),
  positional: Argument.String('dir').pipe(
    Argument.withDescription('where to extract it'),
    Argument.optional
  ),
  out: Flag.String('out').pipe(
    Flag.withAlias('o'),
    Flag.withDescription('where to extract it'),
    Flag.optional
  ),
}).pipe(
  Command.withDescription('extract a package for editing'),
  Command.withHandler(({ file, positional, out }) =>
    Effect.gen(function* () {
      // `unpack <file> <dir>` and `unpack <file> --out <dir>` both worked before
      // Effect parsed the arguments, and both still do.
      const target = Option.getOrUndefined(out) ?? Option.getOrUndefined(positional);
      if (!target) {
        yield* Output.err(red('unpack needs an output directory.'));
        yield* Effect.sync(() => {
          process.exitCode = 1;
        });
        return;
      }
      yield* runOutcome(commands.unpack(file, target));
    })
  )
);

const check = Command.make('check', {
  root: Argument.String('root').pipe(
    Argument.withDescription('a themes repository: a directory holding src/ and dist/ (default: .)'),
    Argument.optional
  ),
  sources: Flag.Boolean('sources').pipe(
    Flag.withDescription(
      'check only that every source validates and packs; dist/ and index.json are built by CI'
    ),
    Flag.withDefault(false)
  ),
}).pipe(
  Command.withDescription('every theme in a themes repository, and that src/ and dist/ agree'),
  Command.withHandler(({ root, sources }) =>
    runOutcome(commands.check(Option.getOrUndefined(root), sources))
  )
);

const build = Command.make('build', {
  root: Argument.String('root').pipe(
    Argument.withDescription('a themes repository: a directory holding src/ and dist/ (default: .)'),
    Argument.optional
  ),
}).pipe(
  Command.withDescription('pack every source into dist/ and regenerate index.json'),
  Command.withHandler(({ root }) => runOutcome(commands.build(Option.getOrUndefined(root))))
);

const skill = Command.make('skill', {
  out: Flag.String('out').pipe(
    Flag.withAlias('o'),
    Flag.withDescription('write the skill to this file instead of printing it'),
    Flag.optional
  ),
}).pipe(
  Command.withDescription('the agent authoring skill, printed or written to a file'),
  Command.withHandler(({ out }) => runOutcome(commands.skill(Option.getOrUndefined(out))))
);

const index = Command.make('index', {
  root: Argument.String('root').pipe(
    Argument.withDescription('a themes repository: a directory holding src/ and dist/ (default: .)'),
    Argument.optional
  ),
}).pipe(
  Command.withDescription('write index.json, the catalogue of every packed theme'),
  Command.withHandler(({ root }) => runOutcome(commands.index(Option.getOrUndefined(root))))
);

const list = Command.make('list', {
  search: Flag.String('search').pipe(
    Flag.withAlias('s'),
    Flag.withDescription('keep themes whose id, name, author, description or tags contain this'),
    Flag.optional
  ),
  page: Flag.Int('page').pipe(Flag.withDescription('which page to show'), Flag.withDefault(1)),
  perPage: Flag.Int('per-page').pipe(Flag.withDescription('themes per page'), Flag.withDefault(20)),
  repo: Flag.String('repo').pipe(
    Flag.withDescription('GitHub repository holding the themes'),
    Flag.withDefault(DEFAULT_REPO)
  ),
  ref: Flag.String('ref').pipe(
    Flag.withDescription('branch or tag to read from'),
    Flag.withDefault(DEFAULT_REF)
  ),
  from: Flag.String('from').pipe(
    Flag.withDescription('read the index from this file or URL instead of GitHub'),
    Flag.optional
  ),
  json: Flag.Boolean('json').pipe(
    Flag.withDescription('print the page as JSON'),
    Flag.withDefault(false)
  ),
}).pipe(
  Command.withDescription('the published themes, searchable and paged'),
  Command.withHandler(({ search, page, perPage, repo, ref, from, json }) =>
    runOutcome(
      commands.list({
        search: Option.getOrUndefined(search),
        page,
        perPage,
        repo,
        ref,
        from: Option.getOrUndefined(from),
        json,
      })
    )
  )
);

const root = Command.make('muqun-theme').pipe(
  Command.withDescription('build and check Muqun themes'),
  Command.withSubcommands([init, validate, contrast, pack, unpack, check, build, index, list, skill])
);

const AppLayer = Layer.mergeAll(
  NodeServices.layer,
  NodeStdio.layer,
  NodeTerminal.layer,
  Output.layer
);

/**
 * Asking for help is not an error.
 *
 * Effect treats a bare invocation as a missing subcommand -- it prints the help
 * but exits 1, and writes "Help requested" to stderr. Running the tool with no
 * arguments to find out what it does is the most ordinary thing a person can do
 * with it, and a CI job that does so should not fail. `help` is mapped for the
 * same reason: it worked before Effect parsed the arguments, so it still does.
 */
const normalize = (argv: readonly string[]): readonly string[] =>
  argv.length === 0 || argv[0] === 'help' ? ['--help'] : argv;

export const run = (argv: readonly string[]): Promise<void> =>
  Effect.runPromise(
    Command.runWith(root, { version: VERSION })(normalize(argv)).pipe(
      Effect.provide(AppLayer)
    ) as Effect.Effect<void, unknown, never>
  ).then(
    () => undefined,
    (error: unknown) => {
      console.error(red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  );
