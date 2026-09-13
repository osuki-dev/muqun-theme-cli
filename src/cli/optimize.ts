import { Effect } from 'effect';

import { sha256 } from '../digest.js';
import { inspectThemeImage } from '../image-inspection.js';
import type { ThemeManifest } from '../schema.js';
import { CommandError, fail } from './theme-source.js';

/**
 * Automatic WebP optimisation, at pack time.
 *
 * Measured on the One Piece pack: ten PNGs, 22.2 MB, became 3.9 MB of WebP at
 * quality 94 -- 18%, and the app's own `inspectThemeImage` accepts the result.
 * A theme is downloaded to a phone, so that is not a micro-optimisation; it is
 * the difference between a pack that fits under the 25 MiB ceiling and one that
 * does not.
 *
 * This module is the one place that depends on the Bun runtime. It lives under
 * `cli/` rather than in the domain for that reason: `index.ts` must stay
 * importable by anything, and the domain must not assume a global exists.
 */

/** Measured, not guessed. See the note above. */
export const QUALITY = 94;

export type AssetOptimization = {
  readonly id: string;
  readonly fromPath: string;
  readonly fromFormat: string;
  readonly fromBytes: number;
  /** Present only when the converted image was actually adopted. */
  readonly toPath?: string;
  readonly toBytes?: number;
  readonly quality?: number;
  /** Why the original was kept. Absent when it was converted. */
  readonly skipped?: string;
  /** The manifest declared a digest, and it now describes the converted bytes. */
  readonly digestRewritten?: boolean;
};

export type OptimizeResult = {
  readonly manifest: ThemeManifest;
  readonly assets: Record<string, Uint8Array>;
  readonly reports: readonly AssetOptimization[];
};

const isBunAvailable = (): boolean =>
  typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

/** Replace the extension, keeping the rest of the packaged path intact. */
const toWebpPath = (path: string): string => path.replace(/\.(png|jpe?g)$/i, '.webp');

/**
 * Convert one image, or explain why it was left alone.
 *
 * Every reason to keep the original is a reason the author should see, so none
 * of them is silent and none of them is fatal: a pack whose artwork cannot be
 * improved is still a perfectly good pack.
 */
type BunImage = {
  webp: (options: { quality: number }) => { bytes: () => Promise<Uint8Array> };
};
type BunGlobal = { Bun: { Image: new (input: Uint8Array) => BunImage } };

const convert = (
  bytes: Uint8Array
): Effect.Effect<{ bytes: Uint8Array } | { skipped: string }, never> =>
  // Never fails: an image that cannot be converted is kept as-is and reported,
  // so one awkward file does not take the whole pack down with it.
  Effect.promise(async () => {
    try {
      const { Image } = (globalThis as unknown as BunGlobal).Bun;
      return { bytes: await new Image(bytes).webp({ quality: QUALITY }).bytes() };
    } catch (error) {
      return {
        skipped: `could not be converted (${error instanceof Error ? error.message : String(error)})`,
      };
    }
  });

/**
 * Convert every packaged image to WebP where that is an improvement.
 *
 * Digest handling is the part worth stating plainly, because the manifest's
 * `sha256` is a claim the *author* made, not something this tool computes:
 *
 *   1. Before anything is converted, a declared digest is checked against the
 *      source bytes. That check is `verifyAssets`, run by `pack` first, and a
 *      mismatch refuses the pack. A claim that was already false is never
 *      papered over by conversion.
 *   2. Only then is the image converted.
 *   3. The digest is recomputed over the converted bytes and rewritten, and the
 *      rewrite is reported per asset. It is not silent, and it only ever
 *      replaces a claim that was true about the bytes the author supplied.
 */
export const optimizeAssets = (
  manifest: ThemeManifest,
  assets: Record<string, Uint8Array>
): Effect.Effect<OptimizeResult, CommandError> =>
  Effect.gen(function* () {
    if (!isBunAvailable())
      return yield* Effect.fail(
        fail('Image optimisation needs the Bun runtime. Run this with `bun`, or pass --no-optimize.')
      );

    const declared = manifest.assets ?? {};
    // Paths that are already spoken for, so a conversion cannot collide with an
    // asset that was authored as WebP under the target name.
    const taken = new Set(
      Object.values(declared).flatMap((asset) =>
        'path' in asset ? [asset.path.toLowerCase()] : []
      )
    );

    const nextAssets: Record<string, Uint8Array> = {};
    const nextDeclared: Record<string, (typeof declared)[string]> = {};
    const reports: AssetOptimization[] = [];

    for (const [id, asset] of Object.entries(declared)) {
      const bytes = assets[id];
      if (!('path' in asset) || !bytes) {
        nextDeclared[id] = asset;
        if (bytes) nextAssets[id] = bytes;
        continue;
      }

      const keep = (skipped: string) => {
        nextDeclared[id] = asset;
        nextAssets[id] = bytes;
        reports.push({
          id,
          fromPath: asset.path,
          fromFormat: format,
          fromBytes: bytes.length,
          skipped,
        });
      };

      let format: string;
      try {
        format = inspectThemeImage(bytes).format;
      } catch {
        // A malformed image is `verifyAssets`'s error to report, not ours to
        // convert around. Pass it through untouched so the real message survives.
        nextDeclared[id] = asset;
        nextAssets[id] = bytes;
        continue;
      }

      if (format === 'webp') {
        keep('already WebP');
        continue;
      }

      const target = toWebpPath(asset.path);
      if (target !== asset.path && taken.has(target.toLowerCase())) {
        keep(`${target} is already taken by another asset`);
        continue;
      }

      const converted = yield* convert(bytes);
      if ('skipped' in converted) {
        keep(converted.skipped);
        continue;
      }

      // The app's own gate, applied to our output before anyone ships it.
      try {
        inspectThemeImage(converted.bytes);
      } catch (error) {
        keep(`converted image failed inspection (${error instanceof Error ? error.message : ''})`);
        continue;
      }

      if (converted.bytes.length >= bytes.length) {
        keep('WebP was not smaller');
        continue;
      }

      taken.delete(asset.path.toLowerCase());
      taken.add(target.toLowerCase());
      nextAssets[id] = converted.bytes;
      nextDeclared[id] = asset.sha256
        ? { path: target, sha256: sha256(converted.bytes) }
        : { path: target };
      reports.push({
        id,
        fromPath: asset.path,
        fromFormat: format,
        fromBytes: bytes.length,
        toPath: target,
        toBytes: converted.bytes.length,
        quality: QUALITY,
        digestRewritten: Boolean(asset.sha256),
      });
    }

    return {
      manifest: { ...manifest, assets: nextDeclared },
      assets: nextAssets,
      reports,
    };
  });
