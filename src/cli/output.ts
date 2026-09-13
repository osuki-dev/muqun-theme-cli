import { Context, Effect, Layer } from 'effect';

/**
 * Where a command's words go.
 *
 * The other port a CLI needs -- the filesystem -- comes from Effect itself
 * (`FileSystem.FileSystem`), so this is the only one worth declaring here. It
 * exists so a command can be tested by reading what it said, rather than by
 * spawning a subprocess and scraping stdout, which is what the old tests had to
 * do for every assertion.
 */
export type OutputService = {
  readonly out: (line: string) => Effect.Effect<void>;
  readonly err: (line: string) => Effect.Effect<void>;
};

export const Output = Context.Service<Output, OutputService>()('muqun-theme/Output');
export type Output = OutputService;

const make = (write: (line: string) => void, fail: (line: string) => void): OutputService => ({
  out: (line) => Effect.sync(() => write(line)),
  err: (line) => Effect.sync(() => fail(line)),
});

/** Real stdout and stderr. */
export const layer = Layer.succeed(Output)(
  make(
    (line) => console.log(line),
    (line) => console.error(line)
  )
);

/** Collects everything said, for tests. */
export const layerCapture = (sink: { out: string[]; err: string[] }) =>
  Layer.succeed(Output)(
    make(
      (line) => sink.out.push(line),
      (line) => sink.err.push(line)
    )
  );

export const out = (line: string): Effect.Effect<void, never, Output> =>
  Effect.flatMap(Output, (service) => service.out(line));

export const err = (line: string): Effect.Effect<void, never, Output> =>
  Effect.flatMap(Output, (service) => service.err(line));
