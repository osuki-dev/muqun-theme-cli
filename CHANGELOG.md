# @osuki-dev/muqun-theme

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
