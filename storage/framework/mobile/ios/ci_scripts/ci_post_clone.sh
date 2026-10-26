#!/bin/sh
set -eu
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(git -C "$PROJECT_DIR" rev-parse --show-toplevel)}"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.com/install -o /tmp/stacks-install-bun.sh
  bash /tmp/stacks-install-bun.sh "bun-v1.4.3"
  export PATH="$HOME/.bun/bin:$PATH"
fi
cd "$ROOT"
bun install --frozen-lockfile
bun --config="$PROJECT_DIR/ci_scripts/bunfig.toml" -e 'import { restoreIosShell } from "@stacksjs/mobile/testing"; restoreIosShell(process.argv[1])' "$PROJECT_DIR"
