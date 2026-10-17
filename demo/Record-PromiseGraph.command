#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node record.mjs
result=$?
printf '\nRecorder exited with status %s. Press Enter to close.\n' "$result"
read -r
exit "$result"
