---
'@osuki-dev/muqun-theme': minor
---

`chrome.attach` is the third chrome glyph a theme may replace, beside
`chrome.back` and `chrome.send`. It is the composer's attachment control, drawn
at 17pt in the primary colour by default.

`src/schema.ts` stays byte-identical to the app's `src/theme/schema.ts` and the
vendored skill is regenerated from it, both pinned by tests. `init` now
scaffolds a placeholder for the new glyph as it does for the other two, so an
author sees the mechanism rather than having to read about it.

No `schemaVersion` change: `iconsSchema` is an open record, so a pack naming
`chrome.attach` already parsed — it was simply not drawn. Older app builds keep
ignoring it, which is the forward compatibility the contract provides.
