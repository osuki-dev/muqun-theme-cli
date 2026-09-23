# Home layout authoring guidance

This describes the local first-release implementation under development. It is
authoring guidance for this workspace, not a public promise that Editorial is
already released. A theme supplies visual roles; the reader chooses the Home
layout separately in Settings.

## Classic and Editorial are separate choices

`Classic` keeps the established Home composition: the identity block, the
single optional Home artwork, gateway and SSH content, and the existing
server cards. `Editorial` is the Japanese editorial composition: a masthead,
start and continue actions, attention, connections, and a compact control
area. Both compositions use the same Home data and actions.

The manifest does not select a layout. A theme cannot request Editorial,
rename Classic, or add another layout. The first release exposes only the
reader's `classic` and `editorial` preference; missing or unknown saved values
fall back to Classic. Do not add a layout field to a manifest.

The CLI's local browser preview can render the two current compositions with
preview-only controls:

```sh
muqun-theme preview <theme-dir> --layout editorial --device tablet --mode dark
```

`--layout` accepts `classic` or `editorial`, `--device` accepts `phone` or
`tablet`, and `--mode` accepts `light` or `dark`. These flags become website
preview parameters; they do not change the installed app preference and do not
belong in a theme manifest.

## Use the existing Home slots

The current schema gives an author these Home-facing roles:

| Slot or field | Use | Authoring guidance |
| --- | --- | --- |
| `decoration["home.background"]` | Home wallpaper | Keep it quiet enough for native text and controls. It can inherit from `shell.background` when the app resolves the slot. |
| `decoration["home.artwork"]` | Single foreground in both layouts | Use transparent, wordless artwork and width-specific crops. |
| `decoration["launch.artwork"]` | Optional startup override | Omission or null falls back to Home artwork, then branding. |
| `homeIdentity.name` and `homeIdentity.logo` | Home identity | Independent custom/default/hidden choices. |
| `homeIdentity.artwork` | Home artwork default visibility | Omitted/default shows declared artwork; hidden defaults it off. |

Both layouts draw at most one foreground. Do not repeat the subject in the wallpaper.
Layout owns placement; the theme supplies fit, focal point, asset and opacity.

For a custom theme, omitting `homeIdentity.name` or `.logo` hides that part of
the identity. `mode: "default"` explicitly restores Muqun's mark or name, and
`mode: "custom"` supplies the theme's text or asset. Hiding one does not hide
the other. The app's own branding remains the default when no custom theme is
active.

## Compact and regular overrides

An image slot may have a base image and optional `compact` and `regular`
overrides. The width override has three states:

- omitted: use the base image at that width;
- an image object: use that image at that width;
- `null`: explicitly disable the slot at that width.

The same inheritance and explicit-null rule applies to mode-specific
`variantDecorations`. Use `null` when reserving no artwork is the intended
small-screen result; do not use a transparent placeholder to create an empty
band. If the resolved Home artwork's local file is missing, not installed, or
fails to decode, Home removes the artwork region and remains operable.

Classic contains one foreground above its content. Editorial standard and Cover
use measured artwork regions. Review phone and tablet crops; use contain to preserve
the full composition, or cover with a focal point that protects important details.
Keep the source artwork inside the existing asset budgets: a
256 KiB manifest, at most 32 assets, at most 8 MiB and 16 megapixels per asset,
and a 25 MiB compressed or 50 MiB expanded package. The gallery preview is a
1024×640 PNG or WebP with the light treatment on the left and dark on the
right.

## Design for the no-art and long-label paths

Artwork is optional. Classic keeps its existing empty-state illustration and
server flow when no Home artwork is available. Editorial drops its artwork panel
and continues with the token-based masthead and sections; it does not leave a
blank reserved region. A hidden identity member also consumes no placeholder
space.

Long translated identity names and action labels are expected. On narrow
content, or when the system text scale is large, Editorial collapses to one
reading column and stacks the artwork rather than clipping text. Classic keeps
its native action hit regions and wrapping status lane. Leave readable copy to
the app: do not bake labels, status, or fake identity into artwork.

## Author checklist

### Home control icons

`icons["chrome.scan"]` replaces Home's gateway QR scanner glyph and
`icons["chrome.settings"]` replaces Home's settings glyph in both layouts.
Use 96x96 transparent PNG/WebP with a recognizable silhouette and
`render: "template"`; keep padding consistent with the built-in 20 dp glyph.
`original` preserves fixed artwork colors and must be readable in both modes.
These replace glyphs only, not button backgrounds, labels or 44 dp hit targets.
Missing, uninstalled or undecodable images fall back to the built-in icon.
Older apps ignore the optional names; no schema version bump is needed.

### Verification

1. Declare only the existing slots and `homeIdentity` fields in the manifest.
2. Test the light and dark artwork against both palettes, including native
   text over `home.background`.
3. Test a narrow/compact device and a wider/regular device. Check that an
   explicit `null` override really removes the image where intended.
4. Read the Home with the artwork hidden or unavailable and with a long identity
   label. The content and actions must still be clear.
5. Run `muqun-theme validate`, `muqun-theme contrast`, and the repository
   `muqun-theme check --sources` command. These commands inspect the current
   manifest contract; use the preview-only controls when checking Editorial in
   the browser.

## Cover header preset (local development)

`homePresentation: { "header": "cover" }` opts Editorial into the cover
composition. Omitted or `standard` keeps the standard header. This is not a
third Home layout. Classic ignores the hint. `homeIdentity.name` supplies the
large title and retains its existing visibility semantics; never bake working
controls into an image. `home.artwork` supplies the transparent foreground,
with `home.background` supplying quiet paper/scenery underneath. No custom
button coordinates are accepted. Use a focal point when cover-fitting a tall
character. On compact widths, work actions overlap only the lower cover edge;
on widths of at least 752 dp and regular font scale, the cover occupies 45%
of the inner page while recent work and connections occupy the remaining column.
Missing artwork or large accessibility text retains the standard reading flow.
Keep the subject's face clear of the left utility controls and lower action rail.
The native title is measured from its rendered glyphs and shrinks to the available
column, so review short and long custom names instead of estimating by character count.
The work-card rail stays under the cover on phones and overlaps its lower edge on wider
layouts; its 28 dp edge fades appear only while more cards remain offscreen. Keep the
lower foreground quiet enough that those native cards remain legible while scrolling.

`homePresentation.toolbarBackground` independently controls the Home toolbar button
surfaces (gateway selector, scan and settings). Omitted or `true` preserves the
theme surface color and configured surface opacity. `false` removes the button
surface and its artwork without changing touch targets or icon colors. This is
independent of the `header` preset; Cover themes must explicitly opt out.

### Composer and creation icons

`chrome.attach` replaces the shared attachment button in OpenCode, terminal and
new-task composers. Its shape and active fill use the current appearance profile.
`chrome.create` replaces the OpenCode header's new-session Plus glyph; it does not
replace Stop while a response runs. Prefer a legible paperclip and plus silhouette.
Both slots accept `template` (theme tint) or `original`; missing or broken assets
fall back to native icons. Older Apps ignore the new name and keep their Plus.
