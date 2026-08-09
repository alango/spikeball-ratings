#!/usr/bin/env bash
# Launcher for the Playwright MCP server (see .mcp.json) — used to check the UI in a
# real browser rather than deriving layout from CSS.
#
# Two things this wraps, both learned the hard way:
#   1. The server defaults to the Google Chrome *channel*, which isn't installed here;
#      --browser chromium uses Playwright's own build instead.
#   2. This WSL image lacks Chromium's system libraries (libnspr4, libnss3, libasound2)
#      and sudo isn't available, so `playwright install-deps` can't run. Instead the
#      libraries are staged unpacked under $HOME by scripts/setup-playwright.sh and
#      found via LD_LIBRARY_PATH. Setting it here (rather than in .mcp.json) keeps the
#      committed config free of machine-specific paths.
#
# The MCP version is pinned: it determines the required Chromium revision, so letting
# it float would silently break the browser on the next upstream release.
set -euo pipefail

MCP_VERSION=0.0.79
DEPS_LIB="$HOME/.cache/playwright-deps/root/usr/lib/x86_64-linux-gnu"

if [ -d "$DEPS_LIB" ]; then
  export LD_LIBRARY_PATH="$DEPS_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

# Keep screenshots/snapshots/console logs in one gitignored directory instead of
# scattering them through the repo root (relative filenames resolve inside it).
exec npx -y "@playwright/mcp@$MCP_VERSION" \
  --browser chromium \
  --headless \
  --isolated \
  --output-dir .playwright-mcp \
  "$@"
