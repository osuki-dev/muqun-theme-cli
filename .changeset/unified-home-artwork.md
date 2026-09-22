---
"@osuki-dev/muqun-theme": major
---

Unify Home artwork authoring and synchronize previews with the current Classic and Editorial layouts.

This is a breaking theme-contract change. Replace `home.hero` and `home.decoration` with one `home.artwork` foreground in `decoration` and every light/dark override. When both old slots exist, choose the intended foreground rather than rendering both. Rename `homeIdentity.hero` to `homeIdentity.artwork`; keep `home.background` as separate wallpaper.

Use the optional `launch.artwork` slot only when startup needs different artwork. Without a resolved override (including an explicit null override), startup falls back to `home.artwork`, then branding. Provide compact/regular overrides and focal points for phone and tablet crops. Legacy foreground slots have no aliases and are no longer recognized by validation; the old identity field is rejected.

The starter now creates one Home foreground asset shared with the example startup override, avoiding duplicate illustrations. The bundled authoring skill, schema, and layout guidance use the new contract. Editorial themes may configure `homePresentation.header` and independent `toolbarBackground`, with custom scan/settings glyphs. CLI preview accepts layout, device, and mode selections for the website preview.

Upgrade the CLI and theme sources together, then run `muqun-theme validate`, `muqun-theme pack`, and `muqun-theme check` before distribution. Consumers must use App and website builds supporting the unified artwork contract; older clients do not render the new foreground slot. No Gateway or Herdr update is required for this theme-only change.
