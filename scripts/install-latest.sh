#!/usr/bin/env bash
#
# install-latest.sh — download the latest GitHub release asset (Willhaben-ImmoMap.zip)
# and unpack it into a folder ready for "Load unpacked" in chrome://extensions.
#
# Usage:
#   ./scripts/install-latest.sh [TARGET_DIR]
#
#   TARGET_DIR   Where to unpack (default: <repo>/build/unpacked).
#                The directory is wiped and recreated on each run.
#                NOTE: `npm run build` wipes all of build/, so re-run this after a build.
#
# Overrides (env):
#   REPO   owner/repo to pull from  (default: derived from this repo's `origin` remote)
#   ASSET  asset filename           (default: Willhaben-ImmoMap.zip)
#
set -euo pipefail

ASSET="${ASSET:-Willhaben-ImmoMap.zip}"

# Resolve the repo this script lives in, so paths/remote work regardless of cwd.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

TARGET="${1:-$repo_root/build/unpacked}"

# Derive owner/repo from the origin remote of the repo this script lives in,
# so the script works unchanged on any fork. Fall back to the upstream fork.
REPO="${REPO:-}"
if [[ -z "$REPO" ]]; then
  origin_url="$(git -C "$script_dir" remote get-url origin 2>/dev/null || true)"
  # handles git@github.com:owner/repo.git and https://github.com/owner/repo(.git)
  REPO="$(printf '%s' "$origin_url" | sed -E 's#(git@github\.com:|https://github\.com/)##; s#\.git$##')"
fi
REPO="${REPO:-ZeRo-244/willhaben-chrome-extension}"

URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

echo "Repo:   $REPO"
echo "Asset:  $ASSET"
echo "Target: $TARGET"
echo "URL:    $URL"
echo

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading…"
# -f: fail on HTTP errors (e.g. 404 if no release/asset), -L: follow redirects
curl -fL --progress-bar "$URL" -o "$tmp/$ASSET"

echo "Unpacking…"
rm -rf "$TARGET"
mkdir -p "$TARGET"
unzip -q "$tmp/$ASSET" -d "$TARGET"

if [[ ! -f "$TARGET/manifest.json" ]]; then
  echo "WARNING: no manifest.json at the root of the unpacked folder." >&2
fi

echo
echo "Done. Load it in Chrome:"
echo "  1. chrome://extensions  → enable Developer mode"
echo "  2. Load unpacked → select: $TARGET"
