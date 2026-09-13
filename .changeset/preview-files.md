---
'@osuki-dev/muqun-theme': minor
---

A theme's preview image is published beside its package. When a manifest
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
