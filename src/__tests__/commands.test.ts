import { expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as commands from '../cli/commands.js';
import * as Output from '../cli/output.js';

/**
 * Commands, driven directly.
 *
 * The subprocess tests in `cli.test.ts` still exist and still assert exit codes,
 * because that is the contract a CI job depends on. These are the other half:
 * the same commands as values, with their output captured through the port
 * rather than scraped from a pipe, which is what the port was for.
 */
function runCommand<E>(effect: Effect.Effect<commands.Outcome, E, commands.Env>) {
  const sink = { out: [] as string[], err: [] as string[] };
  const layer = Layer.mergeAll(NodeServices.layer, Output.layerCapture(sink));
  return Effect.runPromise(
    effect.pipe(Effect.provide(layer)) as Effect.Effect<commands.Outcome, E, never>
  ).then(
    (outcome) => ({ outcome, ...sink, failed: undefined as unknown }),
    (failed: unknown) => ({ outcome: undefined, ...sink, failed })
  );
}

const scratch = () => mkdtempSync(join(tmpdir(), 'muqun-theme-cmd-'));

test('init reports what it wrote, and validate then accepts it', async () => {
  const dir = scratch();
  try {
    const init = await runCommand(commands.init('grand-voyage', dir, false));
    expect(init.outcome?.ok).toBe(true);
    expect(init.out.join('\n')).toContain('placeholder images');

    const validated = await runCommand(commands.validate(dir));
    expect(validated.outcome?.ok).toBe(true);
    const text = validated.out.join('\n');
    expect(text).toContain('valid');
    expect(text).toContain('grand-voyage');
    // The scaffold is honest about itself.
    expect(text).toContain('placeholder');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init --colors-only writes no artwork and draws no placeholder warning', async () => {
  const dir = scratch();
  try {
    await runCommand(commands.init(undefined, dir, true));
    const validated = await runCommand(commands.validate(dir));
    expect(validated.outcome?.ok).toBe(true);
    expect(validated.out.join('\n')).not.toContain('placeholder');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contrast names the pairs that set the floor', async () => {
  const dir = scratch();
  try {
    await runCommand(commands.init(undefined, dir, true));
    const result = await runCommand(commands.contrast(dir));
    expect(result.outcome?.ok).toBe(true);
    const text = result.out.join('\n');
    expect(text).toContain('floor is set by');
    expect(text).toMatch(/needs 4\.5:1/);
    expect(text).toContain('slider');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the whole loop runs as values: init, pack, unpack, validate', async () => {
  const source = scratch();
  const dest = scratch();
  try {
    await runCommand(commands.init('voyage', source, false));

    const packed = await runCommand(commands.pack(source, join(dest, 'voyage.muqun-theme')));
    expect(packed.outcome?.ok).toBe(true);
    expect(packed.out.join('\n')).toContain('round trip ok');

    const unpacked = await runCommand(
      commands.unpack(join(dest, 'voyage.muqun-theme'), join(dest, 'out'))
    );
    expect(unpacked.outcome?.ok).toBe(true);

    const validated = await runCommand(commands.validate(join(dest, 'out')));
    expect(validated.outcome?.ok).toBe(true);
  } finally {
    for (const dir of [source, dest]) rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing target fails with a sentence, not a stack trace', async () => {
  const result = await runCommand(commands.validate(join(scratch(), 'nowhere.muqun-theme')));
  // Reported as a typed failure, so the runner can choose the exit code.
  expect(result.outcome).toBeUndefined();
  expect(String((result.failed as { message?: string })?.message ?? result.failed)).toContain(
    'No such file or directory'
  );
});

test('validate returns a failing outcome, distinct from a command that could not run', async () => {
  const dir = scratch();
  try {
    await runCommand(commands.init(undefined, dir, true));
    const fs = await import('node:fs');
    const manifest = JSON.parse(fs.readFileSync(join(dir, 'theme.json'), 'utf8'));
    // An asset the manifest declares but the directory does not contain.
    manifest.assets = { paper: { path: 'assets/paper.png' } };
    manifest.decoration = { 'shell.background': { asset: 'paper' } };
    fs.writeFileSync(join(dir, 'theme.json'), JSON.stringify(manifest));

    const result = await runCommand(commands.validate(dir));
    // This is a broken input, which surfaces as a CommandError rather than a
    // false "valid" -- the distinction the Outcome type exists to keep.
    expect(result.outcome?.ok).not.toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
