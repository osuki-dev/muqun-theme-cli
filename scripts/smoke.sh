#!/usr/bin/env bash
# Runs every command against the built bundle -- the file that actually ships.
# The unit tests run from src/; this is the only check of lib/cli.js itself.
#   bun run smoke            # after `bun run build`
#   scripts/smoke.sh path/to/cli.js
set -euo pipefail
CLI="$(cd "$(dirname "${1:-lib/cli.js}")" && pwd)/$(basename "${1:-lib/cli.js}")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

bun "$CLI" --version
bun "$CLI" --help >/dev/null

# Standalone: explicit paths.
bun "$CLI" init starter --dir "$WORK/starter"
bun "$CLI" validate "$WORK/starter"
bun "$CLI" contrast "$WORK/starter"
bun "$CLI" pack "$WORK/starter" --out "$WORK/starter.muqun-theme"
bun "$CLI" unpack "$WORK/starter.muqun-theme" --out "$WORK/unpacked"
bun "$CLI" validate "$WORK/starter.muqun-theme"

# A themes repository: defaults follow the layout, and check holds it together.
mkdir -p "$WORK/repo/src" "$WORK/repo/dist"
cd "$WORK/repo"
bun "$CLI" skill --out skills/muqun-theme/SKILL.md
bun "$CLI" init grand-voyage
bun "$CLI" check --sources
bun "$CLI" pack grand-voyage
bun "$CLI" validate grand-voyage
bun "$CLI" index
bun "$CLI" check
bun "$CLI" build
bun "$CLI" check
bun "$CLI" list --from index.json
bun "$CLI" list --from index.json --search voyage --json >/dev/null
test -f src/grand-voyage/theme.json
test -f dist/grand-voyage.muqun-theme
test -f index.json

echo "smoke ok: $CLI"
