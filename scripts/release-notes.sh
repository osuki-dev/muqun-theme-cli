#!/usr/bin/env bash
# Prints the CHANGELOG.md section for one version (written by changesets),
# for use as GitHub release notes: scripts/release-notes.sh 1.0.0
#
# The first release has no CHANGELOG.md yet -- changesets writes it with the
# first version bump -- so a missing file or section is a note, not a failure.
set -euo pipefail
VERSION="${1:?version}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHANGELOG="$ROOT/CHANGELOG.md"

if [ ! -f "$CHANGELOG" ]; then
  echo "_No changelog entry for $VERSION._"
  exit 0
fi

NOTES="$(awk -v v="## $VERSION" '
  $0 == v { on = 1; next }
  on && /^## / { exit }
  on { print }
' "$CHANGELOG" | sed -e '1{/^$/d;}' -e '${/^$/d;}')"

if [ -z "$NOTES" ]; then
  echo "_No changelog entry for $VERSION._"
else
  printf '%s\n' "$NOTES"
fi
