#!/bin/zsh
set -euo pipefail
cd -- "$(dirname -- "$0")"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Install Node.js 22 or later, then open this launcher again.'
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci
fi
if [ "$(uname -s)" = Darwin ] && [ ! -f .data/native-wheel/redislite/bin/falkordb.so ]; then
  npm run setup:native
fi
npm run build
mkdir -p .data
echo 'Checking the real graph and restart behavior in temporary local databases...'
if ! npm test 2>&1 | tee .data/launch-checks.log; then
  echo 'Checks failed. The workspace server was not started.'
  echo 'The results are saved in .data/launch-checks.log.'
  exit 1
fi
echo 'Open http://127.0.0.1:4174 in your browser.'
echo 'Connect DeepSeek in Settings & connections. Keep this window open.'
exec npm start
