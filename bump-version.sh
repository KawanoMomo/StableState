#!/usr/bin/env bash
# Usage: ./bump-version.sh [version]
# If no version given, reads from VERSION file.
set -euo pipefail
cd "$(dirname "$0")"

VER="${1:-$(cat VERSION | tr -d '[:space:]')}"

echo "Bumping to v${VER}"

# 1. VERSION file
echo "$VER" > VERSION

# 2. vscode-stablestate/package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VER}\"/" vscode-stablestate/package.json

# 3. stablestate.html — badge
sed -i "s/v[0-9.]\+<\/span>/v${VER}<\/span>/" stablestate.html

echo "Done. Updated files:"
grep -n "v${VER}\|\"${VER}\"" \
  VERSION vscode-stablestate/package.json stablestate.html 2>/dev/null || true
