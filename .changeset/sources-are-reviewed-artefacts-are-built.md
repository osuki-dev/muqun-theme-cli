---
"@osuki-dev/muqun-theme": minor
---

Sources are reviewed; artefacts are built.

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
