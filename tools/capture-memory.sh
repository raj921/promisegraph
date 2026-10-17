#!/bin/bash
# Queue memory for later processing by Claude
# This bypasses the additionalContext visibility issue

set -euo pipefail
umask 077

# Queue file location
QUEUE_FILE="${PROMISEGRAPH_QUEUE_FILE:-${CLAUDE_PROJECT_DIR:-.}/.memory-queue.jsonl}"

# JSON escape function (macOS compatible)
json_escape() {
    # JSON.stringify preserves Unicode and escapes every JSON control character.
    printf '%s' "$1" | node -e 'let text="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>text+=chunk);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(text).slice(1,-1)));'
}

# Parse arguments
MEMORY=""
BACKGROUND=""
IMPORTANCE="normal"

while [[ $# -gt 0 ]]; do
    case $1 in
        --memory)
            MEMORY="$2"
            shift 2
            ;;
        --background)
            BACKGROUND="$2"
            shift 2
            ;;
        --importance)
            IMPORTANCE="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

if [[ -z "${MEMORY}" ]]; then
    echo "Error: --memory required" >&2
    exit 1
fi

case "${IMPORTANCE}" in normal|high) ;; *) echo "Invalid importance" >&2; exit 1 ;; esac

# Escape for JSON
MEMORY_ESC=$(json_escape "${MEMORY}")
BACKGROUND_ESC=$(json_escape "${BACKGROUND}")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Append to queue
mkdir -p "$(dirname "${QUEUE_FILE}")"
cat >> "${QUEUE_FILE}" <<EOF
{"memory":"${MEMORY_ESC}","background":"${BACKGROUND_ESC}","importance":"${IMPORTANCE}","queued_at":"${TIMESTAMP}"}
EOF

exit 0

