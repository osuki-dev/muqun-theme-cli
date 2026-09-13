#!/usr/bin/env bash
# Runs every command against the built bundle -- the file that actually ships.
# The unit tests run from src/; this is the only check of lib/cli.js itself.
#   bun run smoke            # after `bun run build`
#   scripts/smoke.sh path/to/cli.js
set -euo pipefail
CLI="${1:-lib/cli.js}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

bun "$CLI" --version
bun "$CLI" --help >/dev/null
bun "$CLI" init --dir "$WORK/starter"
bun "$CLI" validate "$WORK/starter"
bun "$CLI" contrast "$WORK/starter"
bun "$CLI" pack "$WORK/starter" --out "$WORK/starter.muqun-theme"
bun "$CLI" unpack "$WORK/starter.muqun-theme" --out "$WORK/unpacked"
bun "$CLI" validate "$WORK/starter.muqun-theme"
echo "smoke ok: $CLI"
