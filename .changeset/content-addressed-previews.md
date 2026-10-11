---
"@osuki-dev/muqun-theme": patch
---

Publish gallery previews with a SHA-256 content digest in their filenames so updated artwork receives a fresh image-cache address. Identical preview bytes retain the same address across unrelated theme changes. Rebuild the catalogue with this CLI to adopt the new paths; no theme version or artwork changes are required. Published mirrors should retain older preview objects for readers holding earlier catalogues.
