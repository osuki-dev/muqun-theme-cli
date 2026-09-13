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

# preview runs until told to stop, so it goes in the background on a port
# nothing else holds, is asked for the manifest, and is stopped again. A
# signal is its normal ending, so a clean exit after one is part of the check.
PORT="$(bun -e 'const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() }); console.log(s.port); s.stop()')"
bun "$CLI" preview grand-voyage --no-open --port "$PORT" &
PREVIEW=$!
trap 'kill "$PREVIEW" 2>/dev/null || true; rm -rf "$WORK"' EXIT
for _ in $(seq 1 50); do
  curl -fsS "http://127.0.0.1:$PORT/theme.json" -o "$WORK/served.json" 2>/dev/null && break
  sleep 0.2
done
test -s "$WORK/served.json"
curl -fsS -D - "http://127.0.0.1:$PORT/theme.json" -o /dev/null | grep -qi '^access-control-allow-origin: \*'
kill "$PREVIEW"
wait "$PREVIEW"
trap 'rm -rf "$WORK"' EXIT

echo "smoke ok: $CLI"
