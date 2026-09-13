# @osuki-dev/muqun-theme

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
