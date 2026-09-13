#!/usr/bin/env bun
/**
 * The theme toolchain, as a command.
 *
 * Every check here is performed by the same modules the app imports, so a
 * package this accepts is a package the importer accepts by construction rather
 * than by agreement. That is the whole point: an author should not discover the
 * twenty-five megabyte ceiling, or the rule against undeclared files, from a red
 * message on a phone.
 *
 * This file is deliberately the whole of the executable. The command tree lives
 * in `cli/main.ts` and the commands in `cli/commands.ts`; the domain they drive
 * is listed in `index.ts` and never imports either of them, which is what keeps
 * Effect out of the modules shared with the app.
 *
 * `bun build` bundles this file and everything it imports into `lib/cli.js`.
 * That one file is what npm installs; there are no runtime dependencies.
 *
 * Runs under Bun, not Node: `pack` converts artwork to WebP through `Bun.Image`,
 * which has no Node equivalent without a native dependency.
 *
 * `package.json` requires Bun >= 1.4.0. The true floor for `Bun.Image` is
 * 1.3.14, which is where the API was introduced; 1.4 is the version this tool
 * is supported on, and the lower number is recorded here rather than quietly
 * substituted for it.
 */
import { run } from './cli/main.js';

await run(process.argv.slice(2));
