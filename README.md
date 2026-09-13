# @osuki-dev/muqun-theme

Build and check [Muqun](https://github.com/osuki-dev/muqun-app) themes from a terminal.

A Muqun theme is a `.muqun-theme` file: a ZIP holding a `theme.json` manifest and
an `assets/` folder of artwork. The app validates one when you import it, and a
rejected package is a red message on a phone — which is the worst possible place
to discover that a drawing was one byte over the ceiling, that an asset the
manifest declares was never in the archive, or that your palette leaves the
translucency slider with nowhere to go.

This package moves all of those checks to where the theme is being written.

**Who it is for:** anyone authoring a Muqun theme by hand, generating one from a
script or an agent, or checking one in CI before shipping it.

The checks are not a reimplementation. `schema.ts`, `package.ts`,
`opacity-policy.ts` and `image-inspection.ts` are the app's own modules, lifted
out unchanged apart from their imports. A package this tool accepts is a package
the app accepts by construction rather than by agreement.

## Install

```sh
bun install -g @osuki-dev/muqun-theme
muqun-theme validate my-theme.muqun-theme
```

Or without installing anything:

```sh
bunx @osuki-dev/muqun-theme validate my-theme.muqun-theme
```

**This is a Bun tool.** It requires **Bun 1.4 or newer** and will not run under
Node: `pack` converts artwork to WebP through `Bun.Image`, which has no Node
equivalent short of a native dependency. No React Native and no native modules.

The install is a single file. `bunx` downloads one package and runs it; there is
no dependency tree behind it.

## Commands

```
muqun-theme init [id] [--dir dir]        scaffold a complete theme, with placeholder art
             [--colors-only]             ...or just a palette, with no assets
muqun-theme validate <target>            schema, references, images, digests, limits
muqun-theme contrast <target>            opacity floors and the colours that set them
muqun-theme pack <dir|id> [--out file]   build a .muqun-theme, optimising artwork to WebP
             [--no-optimize]             ...keeping artwork exactly as authored
muqun-theme unpack <file> [--out dir]    extract a package for editing
muqun-theme preview [dir|id] [--port n]  show a theme in a browser while you edit it, via the website
             [--no-open] [--site base]   ...printing the address only, or using another checkout of the site
muqun-theme check [root] [--sources]     every theme in a themes repository, src/ and dist/ agreeing
muqun-theme build [root]                 pack every source into dist/ and regenerate index.json
muqun-theme index [root]                 write index.json, the catalogue of every packed theme
muqun-theme list [--search q] [--page n] the published themes, from GitHub, searched and paged
muqun-theme skill [--out file]           the agent authoring skill, printed or written to a file
```

The author's loop is **init → edit → check → pack**:

```sh
muqun-theme init grand-voyage --dir ./grand-voyage   # a complete, installable theme
# replace the placeholder art in ./grand-voyage/assets, edit the colours
muqun-theme preview ./grand-voyage                   # watch it in a browser as you go
muqun-theme contrast ./grand-voyage                  # what the palette costs in translucency
muqun-theme validate ./grand-voyage                  # everything the app will check on import
muqun-theme pack ./grand-voyage --out grand-voyage.muqun-theme
```

`<target>` accepts any of the three shapes a theme has on disk: a packed
`.muqun-theme`, a bare `.muqun-theme.json` manifest, or a directory holding
`theme.json` beside `assets/`. You never have to pack something just to check it.
Inside a [themes repository](#themes-repositories) a bare id works too.

### Exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | The target is usable. Warnings may have been printed. |
| `1`  | The target is broken, or the command was used wrongly. |

**Warnings never fail a command.** Only errors do. That distinction is what makes
`muqun-theme validate` safe to put in a CI job: a theme that draws a picture
bigger than it needs to is still a theme, and the tool says so without failing
your build.

Colour is disabled automatically when output is not a terminal, and `NO_COLOR=1`
disables it explicitly.

### `init`

Scaffolds a theme that is **complete and installable the moment it is created**.
Not a skeleton with holes: every colour, every decoration slot, both icons, the
Home identity and the material settings are filled in and wired to a file that
exists. `pack` works on it before you have changed anything.

```
$ muqun-theme init grand-voyage
created grand-voyage/theme.json (10 decoration slots, 14 placeholder images)
  Replace the flat tints in assets/ with real artwork, or delete slots you do not want.
  Next: muqun-theme contrast grand-voyage    then: muqun-theme pack grand-voyage
```

Without `--dir`, the theme gets a directory named after its id: `./<id>`, or
`src/<id>` inside a themes repository. A default location is never allowed to
overwrite a theme that is already there; `--dir` writes wherever you say.

That writes `theme.json` plus fourteen PNGs in `assets/` — about 47 KB in total:

```
assets/shell-light.png      assets/shell-dark.png       assets/home-background.png
assets/home-banner.png      assets/navigation.png       assets/composer.png
assets/actions.png          assets/tabs.png             assets/cards.png
assets/buttons.png          assets/empty-state.png      assets/icon-back.png
assets/icon-send.png        assets/logo.png
```

The point is that the format is **discoverable by deletion**. Every section the
schema supports is already there, so you find out that per-mode wallpaper, a
custom Home name or a replaceable back arrow exist by seeing them in your own
`theme.json` and removing what you do not want — rather than by reading the app's
source to learn they were available.

Each placeholder is sized for the slot it fills, so a fresh scaffold produces no
warnings about artwork larger than it needs.

#### The placeholders are meant to be replaced

They are flat tints pulled from the palette, deliberately not art. Each one also
carries a marker in a PNG `tEXt` chunk, so the tools can tell you when one is
still in place:

```
$ muqun-theme validate ./grand-voyage
valid grand-voyage (grand-voyage 1.0.0)
  14/32 asset(s), 46.6 KiB of artwork
  warning 14x still the placeholder written by `muqun-theme init`
          shell-light, shell-dark, home-background, home-banner, navigation, composer, actions, tabs, +6 more
```

Replace one and the count goes down. It is a warning rather than an error,
because packing a work-in-progress is a perfectly reasonable thing to do — the
point is that nobody ships a scaffold without having been told.

#### `--colors-only`

If you only want a palette, say so and no artwork is written:

```
$ muqun-theme init --colors-only --dir ./palette
created palette/theme.json (colours only, and already passes the contrast gate)
```

This is the app's own starter, unchanged — the same manifest the authoring skill
shows an agent. With no slug the theme is called `my-theme`.

### `validate`

Parses the manifest, resolves every asset reference, and then checks the things
the schema cannot express.

```
$ muqun-theme validate one-piece-grand-voyage-webp.muqun-theme
valid One Piece — Grand Voyage (one-piece-grand-voyage 1.0.0)
  10/32 asset(s), 3.81 MiB of artwork
  warning 6x 1254x1254 is larger than 1024px on its longest edge (6.3 MB decoded)
          panel-light, panel-dark, action-light, action-dark, empty-light, empty-dark
```

Exit code `0` — those are warnings, and that pack installs. Issues that share a
message are collapsed into a count, so one repeated problem cannot bury the rest
of the report.

A schema failure prints the path of the offending value and exits `1`. Here
`colors.text` has been set to a CSS colour name, which the format does not accept:

```
$ muqun-theme validate ./my-theme
variants.light.colors.text: Expected an opaque #RRGGBB color
```

#### What `validate` checks, and what each failure means

**Errors** — the app will refuse the theme:

| Failure | What it means |
| ------- | ------------- |
| `<path>: Expected an opaque #RRGGBB color` | A UI or terminal colour is missing, malformed, or carries alpha where alpha is not allowed. Only `primarySubtle`, `dangerSubtle` and `terminal.selection` may be 8-digit. |
| `<path>: Unrecognized key` | An unknown field. The manifest is strict everywhere except `icons`, so a typo is an error rather than a silently ignored setting. |
| `Unknown asset: <id>` | A `decoration`, `icons` or `homeIdentity` entry names an asset that `assets` does not declare. |
| `Theme manifest exceeds 256 KiB` | The manifest is over the limit, measured as UTF-8 bytes rather than characters. |
| `At most 32 assets are allowed` | Too many declared assets. |
| `Unsupported or malformed static theme image` | A packaged file is not a valid PNG, JPEG or WebP, is animated (APNG or animated WebP), or is over 16 megapixels. |
| `assets.<id>.sha256: declared … but the bytes are …` | The manifest declares a checksum that does not describe the file it names. Either the art changed and the manifest did not, or the file is not the one you think it is. |
| `Invalid theme package: unsupported or unsafe path` | A ZIP entry is not `theme.json` or `assets/<name>.<ext>`. Path traversal, absolute paths, nested directories and symlinks all land here. |
| `Invalid theme package: undeclared files` | The archive contains a file the manifest never declares. |
| `Invalid theme package: declared image is missing` | The manifest declares a packaged asset the archive does not contain. |
| `Invalid theme package: package exceeds 25 MiB` | The compressed archive is over the limit. |
| `Invalid theme package: expanded size limit` | An entry, or the archive as a whole, expands past its ceiling. |
| `Invalid theme package: size or checksum mismatch` | The archive is corrupt. |

**Warnings** — the theme still works:

| Warning | What it means |
| ------- | ------------- |
| `larger than <n>px on its longest edge` | The drawing costs more memory than its slot needs. See below. |
| `declared but never drawn` | An asset is in the package and in `assets`, but nothing references it. Dead weight in the download. |
| `not a glyph this build draws` | An `icons` key that is not a known glyph name. Deliberately tolerated — see the icons note in the format section. |

The size warning is the one worth explaining. The hard limit is 16 megapixels,
and that is a guard against a decode bomb rather than advice. The number you can
act on is different: an image is decoded to `width × height × 4` bytes and held
for as long as its slot is on screen, so a 1254×1254 drawing behind a 44pt
navigation bar costs 6.3 MB to show a strip it could have filled at a twentieth
of that. Full-screen artwork (`shell.background`) gets a phone-at-3× budget of
3000px; every other slot is chrome, and 1024px on the longest edge is already
generous.

### `contrast`

This is the command that explains a number you will otherwise meet as a mystery.

Muqun lets a reader make surfaces and the terminal translucent so artwork shows
through. Translucency costs contrast: text over a 60%-opaque surface is partly
text over whatever is behind it. So the app computes the lowest opacity at which
your palette still meets [WCAG](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
ratios — 4.5:1 for text and 3:1 for large or non-text marks — and clamps the
slider there. That is the **opacity floor**.

`contrast` prints the floor for both modes, and the colour pairs that set it.

```
$ muqun-theme contrast one-piece-grand-voyage-webp.muqun-theme
One Piece — Grand Voyage one-piece-grand-voyage
  light interface 80%  terminal 80%
    interface floor is set by:
       80%  colors.textSubtle/surfaceRaised (needs 4.5:1)
       79%  colors.primary/primarySubtle/surfaceRaised (needs 4.5:1)
       79%  colors.danger/dangerSubtle/surfaceRaised (needs 4.5:1)
       78%  colors.textSubtle/background (needs 4.5:1)
       78%  colors.primary/primarySubtle/background (needs 4.5:1)
    terminal floor is set by:
       80%  terminal.link/background (needs 4.5:1)
       80%  terminal.ansi.1/background (needs 4.5:1)
       80%  terminal.ansi.2/background (needs 4.5:1)
       80%  terminal.ansi.3/background (needs 4.5:1)
       80%  terminal.ansi.5/background (needs 4.5:1)
  dark  interface 80%  terminal 80%
    interface floor is set by:
       80%  colors.textSubtle/surfaceRaised (needs 4.5:1)
       80%  colors.primary/primarySubtle/surfaceRaised (needs 4.5:1)
       80%  colors.danger/dangerSubtle/surfaceRaised (needs 4.5:1)
       76%  colors.textSubtle/surface (needs 4.5:1)
       76%  colors.primary/primarySubtle/surface (needs 4.5:1)
    terminal floor is set by:
       80%  terminal.ansi.0/background (needs 4.5:1)
       80%  terminal.ansi.8/background (needs 4.5:1)
       75%  terminal.ansi.5/background (needs 4.5:1)
       74%  terminal.ansi.1/background (needs 4.5:1)
       73%  terminal.ansi.4/background (needs 4.5:1)
  surface   slider 80%-100%  20 points of travel
  terminal  slider 80%-100%  20 points of travel
```

Each listed pair is the floor **that pair alone** would impose. The group's floor
is the highest of them, so the list is the answer the single number cannot give:
raise `colors.textSubtle` against `surfaceRaised` and the 80% moves. Chase the
79% entries and nothing happens, because the 80% is still there.

A few things the output is telling you:

- **`slider 80%-100%`** is what the reader actually gets. `20 points of travel`
  is a comfortable range; under 10 points is flagged, and a floor of 100% means
  translucency is impossible for that palette.
- **`Both modes share the stricter floor`** appears when light and dark disagree.
  One slider controls both, so the tighter palette decides for the other.
- **`4 ANSI below 4.5:1`** means some terminal ANSI colours fail against the
  terminal background even at full opacity. They are excluded from the floor
  calculation rather than pinning it at 100% — arbitrary ANSI combinations are
  not a contrast claim the theme can make — but they are still hard to read.
- **`fails at full opacity`** is the serious one. A declared pairing misses its
  ratio even with no translucency at all, which no slider position can fix. This
  exits `1`.

The starter is deliberately a tight example:

```
$ muqun-theme contrast ./grand-voyage
  surface   slider 99%-100%  only 1 point of travel
  terminal  slider 97%-100%  only 3 points of travel
  Both modes share the stricter floor, so the tighter palette decides the slider.
```

It is valid and installable, but its muted greys leave almost no room. Strengthen
the foreground colours and the travel opens up.

### `pack` and `unpack`

`pack` collects exactly the files the manifest declares — anything else in the
directory is listed and left out — verifies them, **converts artwork to WebP**,
writes the archive, and then unpacks its own output to confirm the result round
trips. "It packed" and "it installs" are the same claim rather than two hopeful
ones.

#### Artwork is optimised automatically

A theme is downloaded to a phone, so image size is not a detail. `pack` converts
every packaged PNG and JPEG to WebP at quality 94, and reports what it did to
each one:

```
$ muqun-theme pack ./one-piece --out one-piece.muqun-theme
  webp      scene-light      png 2.08 MiB -> 286.0 KiB (13%, q94) sha256 rewritten
  webp      scene-dark       png 2.07 MiB -> 256.8 KiB (12%, q94) sha256 rewritten
  webp      scene-wide-light png 2.45 MiB -> 492.6 KiB (20%, q94) sha256 rewritten
  webp      scene-wide-dark  png 2.22 MiB -> 366.9 KiB (16%, q94) sha256 rewritten
  webp      panel-light      png 2.33 MiB -> 373.5 KiB (16%, q94) sha256 rewritten
  webp      panel-dark       png 1.90 MiB -> 238.5 KiB (12%, q94) sha256 rewritten
  webp      action-light     png 2.80 MiB -> 700.4 KiB (24%, q94) sha256 rewritten
  webp      action-dark      png 3.27 MiB -> 899.3 KiB (27%, q94) sha256 rewritten
  webp      empty-light      png 1.50 MiB -> 201.7 KiB (13%, q94) sha256 rewritten
  webp      empty-dark       png 1.58 MiB -> 205.4 KiB (13%, q94) sha256 rewritten
  10 image(s) optimised: 22.20 MiB -> 3.93 MiB (18%)
packed one-piece.muqun-theme  3.93 MiB  10 asset(s)  round trip ok
```

That is a real pack: **22.2 MB of PNG became 3.9 MB of WebP**, visually
indistinguishable, and the app's own `inspectThemeImage` is run over every
converted image before it is accepted. Quality 94 was chosen by measuring, not by
taste.

The conversion is conservative in four ways, each of them reported rather than
silent. Artwork already in WebP is left alone. A conversion that comes out
*larger* than the original is discarded. An image Bun cannot convert, or whose
output fails inspection, keeps its original bytes. And the packaged path moves
from `.png` to `.webp` only when the converted image is actually adopted.

Alpha survives: a template icon's transparency is carried through as a WebP
`ALPH` chunk, so glyphs keep their shape.

<sub>Bun's WebP codec is bundled rather than borrowed from the OS, and CI checks
that on every run rather than trusting the documentation — `Bun.Image.backend`
reports `bun` on Linux and `system` on macOS, and both produce WebP the app
accepts, with alpha intact.</sub>

#### What happens to a `sha256` you declared

The manifest's `sha256` is a claim *you* made about *your* bytes — this tool does
not compute digests for you — so conversion handles it in a fixed order:

1. **Before anything is converted**, every declared digest is checked against the
   file on disk. If one does not match, `pack` refuses and tells you which:

   ```
   refusing to pack:
     error   assets.scene-light.sha256 declared aaaaaaaaaaaa… but the bytes are 1c1604efda53…
   ```

   A claim that was already false is never papered over by conversion, and
   nothing is written.

2. **Only then** is the image converted, and the digest recomputed over the new
   bytes and rewritten — reported per asset as `sha256 rewritten`.

An asset with no declared digest never gains one. Adding a claim you did not make
would be as wrong as silently rewriting one you did.

#### `--no-optimize`

If you want your exact bytes preserved:

```sh
muqun-theme pack ./one-piece --out one-piece.muqun-theme --no-optimize
```

The escape hatch is a flag rather than a per-asset field in `theme.json`, and
that is forced rather than chosen: the manifest's asset entries are validated by
a strict schema that rejects any key it does not define, so an opt-out living in
the manifest would mean changing the app's format — which is the app's to change,
not this tool's.

```
$ muqun-theme pack ./grand-voyage --out ./grand-voyage.muqun-theme
packed grand-voyage.muqun-theme  2.5 KiB  0 asset(s)  round trip ok
  package limit 25.00 MiB
```

`pack` refuses to build a package that `validate` would reject, so a checksum
mismatch or an animated WebP stops here rather than shipping.

`unpack` is the reverse, and writes a formatted `theme.json` you can edit:

```
$ muqun-theme unpack ./grand-voyage.muqun-theme --out ./editable
unpacked grand-voyage into ./editable (theme.json + 0 asset(s))
```

The cycle is lossless. Unpacking a package and repacking it reproduces the same
manifest and the same asset bytes.

### `preview`

`preview` shows a theme in a browser while you edit it, drawn the way the
gallery on [muqun.dev](https://muqun.dev/themes/) draws it, and redraws as the
files change:

```
$ muqun-theme preview ./grand-voyage
serving grand-voyage (grand-voyage) from ./grand-voyage
  local   http://127.0.0.1:4173/
  preview https://muqun.dev/themes/preview/?source=http://127.0.0.1:4173/
  Edits to theme.json and assets/ show within a couple of seconds. Ctrl-C to stop.
```

It starts a small HTTP server on `127.0.0.1` — port `4173`, or `--port` — and
opens the website's preview page pointed at it. Nothing is uploaded. The page
runs in your browser and fetches `theme.json` and each declared asset from
that local address every two seconds, redrawing only when the bytes differ;
the server reads from disk on every request, so a saved edit is on screen at
the next poll, a newly declared asset included. It serves exactly `theme.json`
and the paths the manifest currently declares under `assets`; anything else in
the directory is a 404, and nothing outside it is reachable. If the manifest
stops parsing mid-edit the page says so and keeps the last good picture, and
the server keeps serving.

The first time, Chrome asks whether the page may reach your local network;
that is the preview page reaching this server, so allow it. The server answers
the browser's private-network preflight, and the page names the loopback
address space it expects, which is what turns a silent refusal into that one
prompt.

`--no-open` prints the addresses without launching a browser — opening the
local address in one lands on the preview page too. `--site` points the page
at another checkout of the website, `--site http://localhost:4321` while
working on the site itself. Inside a themes repository a bare id works, as it
does for `pack`. Ctrl-C stops the server.

## Themes repositories

A themes repository is a directory holding `src/` and `dist/`:

```
src/<id>/theme.json         a theme as it is authored, beside its assets/
dist/<id>.muqun-theme       the same theme, packed
index.json                  the catalogue of everything in dist/, generated
```

That is the whole convention, and the tool detects it rather than being
configured with it. Run inside such a directory:

- `init <id>` writes `src/<id>/`, and refuses to overwrite one that exists.
- `pack <id>` reads `src/<id>/` and writes `dist/<id>.muqun-theme`.
- `validate <id>`, `contrast <id>` and `preview <id>` accept the bare id.
- `index` rewrites `index.json` from `dist/`; `build` packs every source and
  then does the same.

Both directories are required, so an ordinary project with a `src/` of its own
is never mistaken for one.

**Sources are reviewed; artefacts are built.** In
[`osuki-dev/muqun-themes`](https://github.com/osuki-dev/muqun-themes) a pull
request carries only `src/<id>/`, and CI runs `check --sources` on it. After
the merge, CI runs `build` and publishes `dist/` and `index.json` to the
`release` branch, rebuilt whole every time so binaries never accumulate in
history. `list` and the website read from that branch. Nobody commits a
package or an index by hand, and two themes landing at once cannot conflict
over `index.json`.

### `check`

Every theme in the repository, and whether `src/` and `dist/` agree:

```
$ muqun-theme check
src/grand-voyage
valid Grand Voyage (grand-voyage 1.0.0)
  10/32 asset(s), 3.81 MiB of artwork
dist/grand-voyage.muqun-theme
valid Grand Voyage (grand-voyage 1.0.0)
  10/32 asset(s), 3.81 MiB of artwork
index.json
  current (1 theme(s))

check ok 1 theme(s)
```

It fails, with exit code `1` and a line saying what to run, when:

- a source or a package does not validate;
- a source's directory name is not its `id`;
- a source has no package, or a package has no source;
- a package's `version` is not its source's, which is how "edited but not
  repacked" is caught;
- `index.json` is missing or is not what `dist/` would generate.

**`check --sources`** is the pull-request form: `dist/` and `index.json` are
left to CI, so every source is validated and packed in memory to prove it can
be, and nothing is kept. That is what a contributor runs before opening a PR,
and exactly what CI runs on it.

One command either way, so a repository needs no script of its own.

### `build`

Every source in `src/`, packed into `dist/`, then `index.json` regenerated from
the result:

```
$ muqun-theme build
src/grand-voyage
  webp      scene-light      png 2.08 MiB -> 286.0 KiB (13%, q94) sha256 rewritten
  …
  packed dist/grand-voyage.muqun-theme  3.93 MiB  10 asset(s)
  removed dist/old-theme.muqun-theme: it has no source

built 1 theme(s) into dist/ and index.json
```

`dist/` is made to mirror `src/`: a package whose source is gone is removed.
The index is written last, from what was actually produced, so it cannot list
anything that is not there, and a source that will not pack fails the build
before the index is touched. This is what CI runs after a merge; a contributor
never needs to.

**It is incremental.** Each index entry carries a `sourceDigest`, a hash of
the source it was packed from: `theme.json` and every declared asset. With the
previous `dist/` and `index.json` in place, a source whose digest is unchanged,
and whose package still has the bytes the index says, is kept rather than
repacked:

```
src/amber-dusk
  kept dist/amber-dusk.muqun-theme  source unchanged since it was packed
src/blue-harbor
  webp      shell-light      png 10.9 KiB -> 4.3 KiB (40%, q94)
  packed dist/blue-harbor.muqun-theme  22.9 KiB  14 asset(s)

built 2 theme(s) into dist/ and index.json, 1 kept from the previous build
```

So a merge that touched one theme repacks one theme, everything else keeps its
bytes and its `sha256`, and whatever mirrors `dist/` can upload only what
differs. The digest is of the source rather than of the version field, so an
asset swapped without a version bump is still a change. `--force` repacks
everything.

### `index`

Writes `index.json` at the repository root: one entry per package in `dist/`,
sorted by id, with the metadata a reader wants before downloading anything.

```jsonc
{
  "format": "muqun-themes-index",
  "themes": [
    {
      "id": "grand-voyage", "name": "Grand Voyage", "version": "1.0.0",
      "author": "…", "license": "…", "description": "…", "tags": ["…"],  // when the manifest has them
      "package": "dist/grand-voyage.muqun-theme",
      "bytes": 4123456, "sha256": "…", "assets": 10,
      "sourceDigest": "…"       // what build compares to skip an unchanged source
    }
  ]
}
```

Everything in it derives from `dist/` and nothing else, so two runs over the
same tree produce the same bytes and `check` can hold it current by comparing.
Only packed themes are listed: the index is what a reader can install. It is
what `list` reads, and what the website's gallery reads, so both give the same
answer from one request.

### `list`

The published themes, from the API at `https://muqun.dev/api/themes/`:

```
$ muqun-theme list --search sea
2 theme(s) matching "sea"  page 1/1  https://muqun.dev/api/themes/index.json
grand-voyage  Grand Voyage  v1.0.0  by …  3.93 MiB
              A long horizon, warm brass and deep water.
              #warm #sea
…
  download: https://muqun.dev/api/themes/dist/<id>.muqun-theme
```

`--search` matches id, name, author, description and tags, case-insensitively.
`--page` and `--per-page` (default 20) page the result. `--json` prints the
same page as data, each entry with the `url` its package downloads from.
`--from` reads an `index.json` from another URL or a local file instead.

### `skill`

The agent authoring skill, printed or written:

```sh
muqun-theme skill                  # to stdout
muqun-theme skill --out SKILL.md   # to a file
```

The usual way to install it is from this repository, into whatever agent you
use:

```sh
bunx skills add osuki-dev/muqun-theme-cli
```

`muqun-theme skill` is the same file, carried inside the executable, for when
that is more convenient.

## The `.muqun-theme` format

Enough detail to author one without reading the app's source. The app remains the
source of truth — see the note at the end.

### Package layout

A `.muqun-theme` is a ZIP with a flat, closed structure:

```
theme.json          required, exactly this name, at the root
assets/             optional directory
assets/<name>.png   artwork, one level deep only
```

Nothing else is permitted. Asset filenames match `[a-zA-Z0-9_-]+` with a `.png`,
`.jpg`, `.jpeg` or `.webp` extension. There are no nested directories, no
symlinks, no other file types, and every file in the archive must be declared in
the manifest. `.muqun-theme.json` — the manifest on its own, with no artwork — is
also a valid thing to hand the app.

### Manifest shape

```jsonc
{
  "format": "muqun-theme",     // required, exactly this
  "schemaVersion": 1,          // required, exactly 1
  "id": "grand-voyage",        // required, ^[a-z][a-z0-9-]*$, 1-64 chars
  "name": "Grand Voyage",      // required, 1-64 printable chars
  "version": "1.0.0",          // required, exactly three numeric parts
  "author": "…",               // optional, up to 100 chars
  "license": "…",              // optional, up to 100 chars
  "source": "https://…",       // optional, HTTPS only

  "variants": {                // required, both modes, no inheritance
    "light": { "colors": { … }, "terminal": { … }, "surfaces": { … } },
    "dark":  { "colors": { … }, "terminal": { … }, "surfaces": { … } }
  },

  "assets": { … },             // optional
  "decoration": { … },         // optional
  "variantDecorations": { … }, // optional
  "icons": { … },              // optional
  "materials": { … },          // optional
  "homeIdentity": { … }        // optional
}
```

Unknown keys are an error everywhere except inside `icons`.

### Colours

Every variant declares all **17** UI tokens. There are no defaults and no
inheritance between modes: a half-filled variant is a rejected theme, so there is
never a half-themed screen.

```
background  surface  surfaceRaised          the three surfaces, in depth order
border  borderStrong                        separators
text  textMuted  textSubtle  textDisabled   type, in descending emphasis
primary  onPrimary  primarySubtle           the accent, its label, its tint
danger  dangerSubtle  success  warning  info  semantic colours
```

All are opaque `#RRGGBB` except `primarySubtle` and `dangerSubtle`, which may be
`#RRGGBBAA` — they are tints painted *over* a surface rather than replacing it.

`terminal` carries its own surface plus the ANSI 16:

```jsonc
"terminal": {
  "background": "#050B12",
  "foreground": "#E6EAF2",
  "cursor": "#FF5A4A",
  "link": "#6E8BFF",
  "selection": "#FF5A4A24",   // may carry alpha
  "ansi": [ /* exactly 16 opaque colours: 0-7 normal, 8-15 bright */ ],
  "backgroundOpacity": 0.9    // optional, 0..1
}
```

`variants.<mode>.surfaces.backgroundOpacity` does the same for the interface.
Both default to `1`, are independent, and are clamped to the floor `contrast`
reports. Text, icons, explicit ANSI backgrounds and safety scrims never fade.

### Assets and artwork

```jsonc
"assets": {
  "paper": { "path": "assets/paper.webp", "sha256": "…" },  // packaged
  "crest": { "url": "https://example.com/crest.png" }       // downloaded
}
```

Asset ids match `^[a-z][a-z0-9-]*$`. `sha256` is optional; when present it must be
the lowercase hex SHA-256 of the actual file bytes, and `validate` checks it. An
offline `.muqun-theme` must use `path` — a `url` asset cannot be packaged, and a
package that declares one is rejected.

Artwork is placed by referencing an asset from a **decoration slot**:

```jsonc
"decoration": {
  "shell.background": { "asset": "paper", "fit": "cover", "opacity": 0.6 }
}
```

The ten slots:

| Slot | What it decorates |
| ---- | ----------------- |
| `shell.background` | Shared wallpaper behind everything. The only full-screen slot. |
| `home.background` | Overrides the wallpaper on Home. |
| `home.decoration` | A contained 2:1 banner on Home, max width 560. Not wallpaper. |
| `navigation.background` | The navigation bar. |
| `composer.background` | The input composer. |
| `actions.background` | The actions bar. |
| `tabs.background` | The tab strip. |
| `cards.decoration` | Cards. |
| `buttons.primary.background` | Primary buttons. |
| `emptyState.illustration` | Empty states. Use a square, `contain`-fit image. |

Each slot takes `asset`, plus optional `fit` (`cover`, `contain`, `tile`),
`opacity` (0..1), and `focalPoint` (`{x, y}`, each 0..1). It may also carry
`compact` and `regular` sub-entries to serve phone and tablet different artwork.

`variantDecorations.light` and `variantDecorations.dark` override `decoration`
per mode. The resolution rule is worth memorising: **omitting a slot inherits,
and `null` explicitly disables it.** Missing artwork reserves no space, so every
slot is safely optional.

### Icons, materials, home identity

```jsonc
"icons": { "chrome.back": { "asset": "arrow", "render": "template" } }
```

Known glyph names are `chrome.back` and `chrome.send`. `icons` is the one open
part of the schema: an unknown name is ignored rather than failing the theme, so
an older app keeps its own glyph instead of refusing a newer pack outright. The
cost is that a typo is silent at runtime, which is why `validate` reports unknown
names as a warning.

`render` defaults to `template`: the drawing supplies the shape through its alpha
and the theme supplies the colour, so one image is correct in both modes. Use
`original` only for a mark whose colours are fixed — a plain arrow in fixed black
disappears in dark mode.

```jsonc
"materials": { "navigation": "glass" }   // auto | solid | glass
```

Applies to `default`, `navigation`, `composer` and `actions`. `glass` falls back
to `solid` where unsupported.

```jsonc
"homeIdentity": {
  "name": { "mode": "custom", "text": "Grand Voyage" },  // or default | hidden
  "logo": { "mode": "custom", "asset": "crest" }         // or default | hidden
}
```

A pack that says nothing here gets nothing: once a theme is applied, Home is the
theme's, and the app does not print its own name over your illustration. Ask for
it back with `"mode": "default"`. This never renames the launcher icon.

### Limits

Every one of these is enforced by `validate` and by the app:

| Limit | Value |
| ----- | ----- |
| Manifest size | 256 KiB (UTF-8 bytes) |
| Assets per theme | 32 |
| Single asset | 8 MiB |
| Image dimensions | 16 megapixels |
| Package, compressed | 25 MiB |
| Package, expanded | 50 MiB |

### What a theme may not contain

No scripts, HTML, CSS, SVG, fonts, or animation of any kind. No base64-embedded
images, no local filesystem paths, no credentials. Artwork is static PNG, JPEG or
WebP, and it is inspected as bytes rather than trusted by extension.

## Architecture

The package is a domain and a command, and the split between them is enforced
rather than intended.

```
src/
  schema  package  image-inspection  opacity-policy      the domain: pure, synchronous,
  contrast  clone  format-json  digest  verify           zod and fflate only
  scaffold  placeholder-png  starter
  index.ts                                               the domain, listed in one place

  cli/
    output.ts        the one port this package declares: where words go
    theme-source.ts  the whole boundary to a disk, over Effect's FileSystem
    repo.ts          the themes repository convention: src/, dist/, and the defaults they set
    catalog.ts       index.json: built from dist/, read back for list, searched and paged
    skill.ts         the agent skill, inlined into the executable at build time
    preview-server.ts  the local server behind preview: the theme directory over HTTP, read fresh per request
    format.ts        every printed line, as pure functions
    commands.ts      the eleven commands, as Effects
    main.ts          argument parsing, help, exit codes
  cli.ts             the executable
```

**The domain does not know Effect exists.** Everything reachable from `index.ts`
is plain TypeScript over `zod` and `fflate`, which is what lets those modules
stay byte-identical to the app's own. That is checked, not promised:
`src/__tests__/purity.test.ts` walks the real import graph from `index.ts` —
static imports, re-exports, `import()` and `require()` alike — and fails if
anything in it reaches for `effect` or steps into `cli/`.

**Effect lives in the command layer**, where the work is genuinely effectful:
reading a theme off a disk, writing a pack, printing, and choosing an exit code.
It is Effect 4.0, currently a release candidate pinned to an exact version; its
CLI module is published under `effect/unstable/cli` and may change before 4.0
final. None of that reaches an install, because of the next point.

**It ships as one file.** `bun build` bundles `cli.ts` and everything it imports
— Effect included — into `lib/cli.js`, and that file is the whole of what npm
installs. There are no runtime dependencies and no `src/` in the tarball.

**I/O goes through ports.** The filesystem and path services are Effect's own
(`FileSystem.FileSystem`, `Path.Path`), and the single port this package
declares is `Output` — stdout and stderr behind an interface. Together they are
why `src/__tests__/commands.test.ts` can run a command and read what it said,
instead of spawning a process and scraping a pipe. The subprocess tests still
exist alongside them, because exit codes are the contract a CI job depends on and
those deserve to be tested the way they are used.

**One schema, not two.** The manifest is validated by `zod`, and only by `zod`.
Effect ships its own schema library; using it here would mean two definitions of
the `.muqun-theme` format, one of which would eventually disagree with the app.
`skill.test.ts` pins `themeJsonSchema()` output byte-for-byte against the
authoring skill, so that drift would fail a test.

## Agent skill

`skills/muqun-theme/SKILL.md` is the authoring contract handed to an AI agent
asked to make a Muqun theme. It carries the workflow, the resource and surface
rules, the boundaries, the full JSON Schema and a complete starter manifest — so
an agent can produce an installable pack without reading the app's source. It
is installed into an agent from this repository, and is carried inside the
executable as well:

```sh
bunx skills add osuki-dev/muqun-theme-cli
muqun-theme skill --out SKILL.md
```

**It is generated upstream.** The file is produced in the Muqun app repository
from `src/theme/authoring.ts` and `src/theme/schema.ts`, and vendored here
verbatim. Edits belong upstream — an edit to the copy is lost the next time the
app regenerates it, and would put the copy at odds with the contract the app
enforces. The file says so at the top.

The copy is pinned rather than trusted: `src/__tests__/skill.test.ts` asserts
that the skill's JSON Schema and starter manifest are byte-for-byte what
`themeJsonSchema()` and `createThemeStarter()` produce, and that the limits its
prose quotes match `THEME_LIMITS`. A copy that falls out of step with the code
fails a test instead of quietly misinforming an agent.

One section is not generated: **Checking your work**, appended at the end, which
points an agent at `muqun-theme validate` and `muqun-theme contrast`. That
tooling does not exist upstream, so it has nowhere else to be documented.

## Not built yet

Two things the authoring loop will eventually want. Neither exists, and neither
is stubbed — this section is here so the next person is not guessing at intent.

### `publish` — submitting to the themes gallery

A themes gallery is planned for the Muqun website, where people browse, install
and submit themes. `muqun-theme publish` will mean **submit this pack to that
gallery**, completing the loop as `init → edit → check → pack → publish`.

It is not implemented because there is no gallery and no API to write against,
and guessing at an endpoint's shape now would mean rewriting it later.

Nothing in the current design blocks it. `pack` already produces the exact bytes
a submission would upload, `validate` already answers the question a gallery
would have to ask before accepting one, and `verifyAssets` already returns
structured issues rather than printed text. When the API exists, `publish` is
roughly: pack, refuse on any error, refuse on a package whose artwork is still
the `init` placeholder, then upload.

Three things would be worth settling before writing it, because they are cheaper
to decide than to change once themes are live:

- **Identity.** `id` is unique within one manifest but nothing makes it unique
  across a gallery. Whether two authors may both publish `ocean` — and if not,
  who owns the name — is a gallery decision that reaches back into the format.
- **Versioning.** `version` exists and is validated, but nothing currently
  rejects re-publishing the same version with different bytes. A gallery almost
  certainly wants that to be an error.
- **Authorship.** `author` is free text. A gallery that shows who made a theme
  will want it tied to an account rather than to a string the pack chose.

None of those needs code today. They need an answer before the first upload.

### Previewing without installing the app

This is a real gap. `contrast` tells you what a palette costs in translucency and
which pairs are responsible, and `validate` tells you the pack is well-formed —
but neither shows you what the theme *looks like*. Today the only way to see a
theme is to install it on a device.

A `muqun-theme preview <target> --out preview.html` writing a static page — both
modes side by side, the three surfaces with real text on them, the ANSI 16, and
each decoration slot with its artwork in place — would close it, and needs
nothing this package does not already have.

It is deliberately not built on spec, for the same reason `publish` is not: a
preview that diverges from what the app actually renders is worse than no
preview, and getting that right means checking it against the app rather than
against the schema.

## Source of truth

The `.muqun-theme` format is defined by the Muqun app, not by this package. The
modules here are the app's own, extracted so they can run outside it, and this
README documents the format as of the extraction. Where the two ever disagree,
the app is correct and this package has drifted — please
[open an issue](https://github.com/osuki-dev/muqun-theme-cli/issues).

## License

Apache-2.0
