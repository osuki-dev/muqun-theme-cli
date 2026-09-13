---
"@osuki-dev/muqun-theme": minor
---

`init` scaffolds a placeholder preview cover (`assets/preview.png`, 1024x640)
and names it in `preview`, so a fresh theme already has what galleries show.
`check --sources --require-preview` refuses a source without one; the themes
repository's CI uses it.
