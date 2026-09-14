# @osuki-dev/muqun-theme

## 1.9.0

### Minor Changes

- [#23](https://github.com/osuki-dev/muqun-theme-cli/pull/23) [`fd9f4f5`](https://github.com/osuki-dev/muqun-theme-cli/commit/fd9f4f56d12c71e7290520354bd0828d18c155b3) Thanks [@ryuhzk](https://github.com/ryuhzk)! - `home.hero` is a decoration slot this build knows, and `homeIdentity.hero` its
  `default`/`hidden` switch — parity with the Muqun app, which now draws the
  theme's own illustration between Home's header row and the server list. The
  slot is validated like `emptyState.illustration`: an image reference with
  `fit`, `opacity`, `focalPoint` and per-mode and per-width overrides, sized
  against the same 1024px budget.

  `check` and `validate` stop reporting `home.hero` as a slot they have never
  heard of, and `init` now scaffolds a seventeenth placeholder, `home-hero.png`,
  wired to the slot with the switch written out beside the Home name and logo.
  No `schemaVersion` bump: the field is additive, and a pack that declares it
  still installs on an app that has not heard of it.

## 1.8.1

### Patch Changes

- [#21](https://github.com/osuki-dev/muqun-theme-cli/pull/21) [`26d3d11`](https://github.com/osuki-dev/muqun-theme-cli/commit/26d3d11c362e7855f0e7f85e92832d56bba1e99b) Thanks [@ryuhzk](https://github.com/ryuhzk)! - The vendored agent skill is 1.4.0: every theme is asked for a 1024x640 preview
  cover, light on the left half and dark on the right, named in `preview`.

## 1.8.0

### Minor Changes

- [#19](https://github.com/osuki-dev/muqun-theme-cli/pull/19) [`a5fd650`](https://github.com/osuki-dev/muqun-theme-cli/commit/a5fd650c17e77586ff612891e3056141fff3e311) Thanks [@ryuhzk](https://github.com/ryuhzk)! - A theme's preview image is published beside its package. When a manifest
  declares `preview`, `build` copies that asset out of the packed theme -- the
  bytes as packed, so the optimised WebP -- into `dist/previews/<id>.<ext>`,
  with the extension (`webp`, `png` or `jpg`) chosen by inspecting the bytes,
  and the index entry gains `preview: "dist/previews/<id>.<ext>"`. A gallery
  can show the picture without downloading the package.

  `dist/previews/` mirrors the index: a theme that stops declaring a preview,
  or whose source is gone, loses its file, and `build` removes anything the
  index does not name. `check` reports a missing, stale or stray preview file
  and names `muqun-theme build` as the fix. `list --json` carries `previewUrl`
  beside `url` when the index came from a URL and the entry has a preview.

- [#19](https://github.com/osuki-dev/muqun-theme-cli/pull/19) [`d9d4cc5`](https://github.com/osuki-dev/muqun-theme-cli/commit/d9d4cc59dde435488acb2dc4b0997ff1c8ed0463) Thanks [@ryuhzk](https://github.com/ryuhzk)! - `init` scaffolds a placeholder preview cover (`assets/preview.png`, 1024x640)
  and names it in `preview`, so a fresh theme already has what galleries show.
  `check --sources --require-preview` refuses a source without one; the themes
  repository's CI uses it.

## 1.7.1

### Patch Changes

- [#17](https://github.com/osuki-dev/muqun-theme-cli/pull/17) [`60521ba`](https://github.com/osuki-dev/muqun-theme-cli/commit/60521bae418e9c1464e83ee8feb05661e197afc9) Thanks [@ryuhzk](https://github.com/ryuhzk)! - `validate` no longer warns that a theme's `preview` image is "declared but
  never drawn". The gallery draws it.

## 1.7.0

### Minor Changes

- [#15](https://github.com/osuki-dev/muqun-theme-cli/pull/15) [`306a0fe`](https://github.com/osuki-dev/muqun-theme-cli/commit/306a0fee22ca9dbfa9a9ed33de0940349cbcb23e) Thanks [@BANG88](https://github.com/BANG88)! - `chrome.attach` is the third chrome glyph a theme may replace, beside
  `chrome.back` and `chrome.send`. It is the composer's attachment control, drawn
  at 17pt in the primary colour by default.

  `src/schema.ts` stays byte-identical to the app's `src/theme/schema.ts` and the
  vendored skill is regenerated from it, both pinned by tests. `init` now
  scaffolds a placeholder for the new glyph as it does for the other two, so an
  author sees the mechanism rather than having to read about it.

  No `schemaVersion` change: `iconsSchema` is an open record, so a pack naming
  `chrome.attach` already parsed — it was simply not drawn. Older app builds keep
  ignoring it, which is the forward compatibility the contract provides.

## 1.6.0

### Minor Changes

- [#13](https://github.com/osuki-dev/muqun-theme-cli/pull/13) [`8c33ad3`](https://github.com/osuki-dev/muqun-theme-cli/commit/8c33ad33d02518f655376abfcda2a1eb852ccc3d) Thanks [@ryuhzk](https://github.com/ryuhzk)! - `preview` shows a theme in a browser while it is being edited.
  `muqun-theme preview <dir|id>` serves the theme directory from
  `http://127.0.0.1:4173/` (or `--port`), reading from disk on every request,
  and opens `https://muqun.dev/themes/preview/?source=…` on it, where the page
  re-reads the theme every two seconds and redraws when a byte changes.
  `--no-open` only prints the addresses; `--site` points at another checkout of
  the website. Ctrl-C stops the server.

## 1.5.0

### Minor Changes

- [`0662e40`](https://github.com/osuki-dev/muqun-theme-cli/commit/0662e40a2c3b620b2911ebb477a5f28ef09e9cea) Thanks [@ryuhzk](https://github.com/ryuhzk)! - `validate` now says what a theme leaves plain: how many of the ten decoration
  slots are filled and which are unset, and whether a `preview` image is
  declared. Notes, not warnings; a palette-only theme is still clean.

## 1.4.0

### Minor Changes

- [#8](https://github.com/osuki-dev/muqun-theme-cli/pull/8) [`f7473f7`](https://github.com/osuki-dev/muqun-theme-cli/commit/f7473f74774b38a4e87a2b456f0ba7b7f130c58d) Thanks [@ryuhzk](https://github.com/ryuhzk)! - `list` reads `https://muqun.dev/api/themes/` by default. `--repo` and `--ref`
  are gone; `--from` still takes any URL or a local `index.json`.

## 1.3.0

### Minor Changes

- [#6](https://github.com/osuki-dev/muqun-theme-cli/pull/6) [`f4f289a`](https://github.com/osuki-dev/muqun-theme-cli/commit/f4f289a5d3a5d22fd2f10a5ffbae0c198f94fac2) Thanks [@ryuhzk](https://github.com/ryuhzk)! - `build` is incremental. Each index entry now carries a `sourceDigest`, a hash
  of `theme.json` and every declared asset. With the previous `dist/` and
  `index.json` present, a source whose digest is unchanged, and whose package
  still has the bytes the index records, is kept rather than repacked, so a
  merge that touched one theme repacks one theme and everything else keeps its
  `sha256`. `build --force` repacks all.

## 1.2.0

### Minor Changes

- [#3](https://github.com/osuki-dev/muqun-theme-cli/pull/3) [`3b629a8`](https://github.com/osuki-dev/muqun-theme-cli/commit/3b629a8359c2365a78cc99d6b377b35c89193e14) Thanks [@ryuhzk](https://github.com/ryuhzk)! - Sources are reviewed; artefacts are built.

  - `build [root]` packs every source in `src/` into `dist/`, removes packages
    whose source is gone, and regenerates `index.json` from the result. This is
    what CI runs after a merge.
  - `check --sources` validates every source and packs it in memory to prove it
    can be, keeping nothing and ignoring `dist/` and `index.json`. This is what
    CI runs on a pull request, which now carries only `src/<id>/`.
  - `list` defaults to the `release` branch, where CI publishes `dist/` and
    `index.json`.
  - `pack` is now a thin write around the shared packing step, so `pack`,
    `build` and `check --sources` cannot disagree about what packs.

## 1.1.0

### Minor Changes

- [#1](https://github.com/osuki-dev/muqun-theme-cli/pull/1) [`24e8faf`](https://github.com/osuki-dev/muqun-theme-cli/commit/24e8faf36715914a016649d5ac46bea78515a356) Thanks [@ryuhzk](https://github.com/ryuhzk)! - The themes repository convention: a directory holding `src/` and `dist/`, with
  an `index.json` catalogue generated from `dist/`.

  - `check [root]` validates every source in `src/<id>/` and every package in
    `dist/<id>.muqun-theme`, and fails when a source has no package, a package
    has no source, a directory name is not its theme's `id`, a package's
    `version` is behind its source, or `index.json` is missing or stale. It
    warns when a vendored `skills/muqun-theme/SKILL.md` differs from the skill
    this CLI carries.
  - `index [root]` writes `index.json`: one entry per packed theme with id, name,
    version, author, license, description, tags, package path, size, sha256 and
    asset count. Deterministic, so `check` holds it current by comparison.
  - `list` reads that index from GitHub (`osuki-dev/muqun-themes` by default)
    with `--search`, `--page` and `--per-page`; `--json` for scripts, `--from`
    for a local file or another URL, `--repo`/`--ref` for another source, and
    `GITHUB_TOKEN` for a private repository.
  - `skill [--out file]` prints the agent authoring skill or writes it to a file.
    The skill is inlined into the executable at build time.
  - Inside a themes repository, `init <id>` defaults to `src/<id>`, `pack <id>`
    reads `src/<id>` and writes `dist/<id>.muqun-theme`, and `validate` and
    `contrast` accept a bare id. Elsewhere, `init` now defaults to `./<id>`
    instead of the current directory, and a default location never overwrites a
    theme that already exists.
