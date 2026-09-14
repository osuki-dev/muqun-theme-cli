---
"@osuki-dev/muqun-theme": minor
---

`home.hero` is a decoration slot this build knows, and `homeIdentity.hero` its
`default`/`hidden` switch — parity with the Muqun app, which now draws the
theme's own illustration between Home's header row and the server list. The
slot is validated like `emptyState.illustration`: an image reference with
`fit`, `opacity`, `focalPoint` and per-mode and per-width overrides, sized
against the same 1024px budget.

`check` and `validate` stop reporting `home.hero` as a slot they have never
heard of, and `init` now scaffolds a seventeenth placeholder, `home-hero.png`,
wired to the slot with the switch written out beside the Home name and logo.
No `schemaVersion` bump: the field is additive, and a pack that declares it
still installs on an app that has not heard of it.
