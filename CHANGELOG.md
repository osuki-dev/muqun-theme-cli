# @osuki-dev/muqun-theme

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
