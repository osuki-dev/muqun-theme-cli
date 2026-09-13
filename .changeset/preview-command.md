---
"@osuki-dev/muqun-theme": minor
---

`preview` shows a theme in a browser while it is being edited.
`muqun-theme preview <dir|id>` serves the theme directory from
`http://127.0.0.1:4173/` (or `--port`), reading from disk on every request,
and opens `https://muqun.dev/themes/preview/?source=…` on it, where the page
re-reads the theme every two seconds and redraws when a byte changes.
`--no-open` only prints the addresses; `--site` points at another checkout of
the website. Ctrl-C stops the server.
