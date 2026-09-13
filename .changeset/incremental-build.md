---
"@osuki-dev/muqun-theme": minor
---

`build` is incremental. Each index entry now carries a `sourceDigest`, a hash
of `theme.json` and every declared asset. With the previous `dist/` and
`index.json` present, a source whose digest is unchanged, and whose package
still has the bytes the index records, is kept rather than repacked, so a
merge that touched one theme repacks one theme and everything else keeps its
`sha256`. `build --force` repacks all.
