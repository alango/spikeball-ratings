#!/usr/bin/env bash
# One-time setup for the Playwright MCP browser (see scripts/playwright-mcp.sh).
# Idempotent — safe to re-run after clearing ~/.cache or moving machines.
#
# Installs the Chromium build matching the pinned MCP version, then stages Chromium's
# system libraries under $HOME. The normal route for step 2 is
# `playwright install-deps`, which needs root; this machine has no sudo, so instead we
# `apt-get download` the packages (works unprivileged) and unpack them with `dpkg -x`.
# Only the three shared libraries are needed — the rest of install-deps' list is fonts
# and xvfb, which headless Chromium doesn't use.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS_DIR="$HOME/.cache/playwright-deps"
LIBS=(libnspr4 libnss3 libasound2t64 libasound2-data)

# Single source of truth for the pin: the launcher the MCP server actually uses.
MCP_VERSION="$(sed -n 's/^MCP_VERSION=//p' "$HERE/playwright-mcp.sh")"
echo "==> @playwright/mcp@$MCP_VERSION"

# The MCP package pins an exact playwright version, which fixes the Chromium revision.
PW_VERSION="$(npm view "@playwright/mcp@$MCP_VERSION" dependencies.playwright)"
echo "==> installing Chromium for playwright@$PW_VERSION"
npx -y "playwright@$PW_VERSION" install chromium

if ! command -v apt-get >/dev/null 2>&1; then
  echo "==> not a Debian/Ubuntu system; skipping library staging"
  exit 0
fi

echo "==> staging Chromium system libraries in $DEPS_DIR"
mkdir -p "$DEPS_DIR/debs" "$DEPS_DIR/root"
(
  cd "$DEPS_DIR/debs"
  apt-get download "${LIBS[@]}"
  for deb in *.deb; do dpkg -x "$deb" "$DEPS_DIR/root"; done
)

echo "==> done. Restart Claude Code if the MCP server was already running."
