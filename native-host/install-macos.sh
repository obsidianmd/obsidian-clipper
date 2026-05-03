#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="md.obsidian.clipper.video_asr"
HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$HOST_DIR/video_asr_host.py"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"
EXTENSION_ID="${1:-}"

if [[ -z "$EXTENSION_ID" ]]; then
	echo "Usage: ./install-macos.sh <chrome-extension-id>" >&2
	exit 1
fi

chmod +x "$HOST_SCRIPT"
mkdir -p "$MANIFEST_DIR"

cat > "$MANIFEST_PATH" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Obsidian Clipper video ASR host",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
JSON

echo "Installed native host manifest: $MANIFEST_PATH"
