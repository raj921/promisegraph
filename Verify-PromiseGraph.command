#!/bin/zsh
set -euo pipefail
cd -- "$(dirname -- "$0")"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Install Node.js 22 or later, then open this verifier again.'
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci
fi
if [ "$(uname -s)" = Darwin ] && [ ! -f .data/native-wheel/redislite/bin/falkordb.so ]; then
  npm run setup:native
fi
echo 'Checking isolated graph data, live DeepSeek and the browser workflow.'
echo 'Live AI checks use your configured DeepSeek account and synthetic test sources.'
npm run verify
