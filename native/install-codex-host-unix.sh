#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.obsidian_clipper.codex"
BROWSER="chrome"
EXTENSION_ID=""

while [[ $# -gt 0 ]]; do
	case "$1" in
		--browser)
			BROWSER="${2:-}"
			shift 2
			;;
		--extension-id)
			EXTENSION_ID="${2:-}"
			shift 2
			;;
		*)
			echo "Unknown argument: $1" >&2
			exit 2
			;;
	esac
done

if [[ -z "$EXTENSION_ID" ]]; then
	echo "Usage: $0 --browser chrome|edge --extension-id EXTENSION_ID" >&2
	exit 2
fi

case "$BROWSER" in
	chrome|google-chrome)
		BROWSER="chrome"
		;;
	edge|microsoft-edge)
		BROWSER="edge"
		;;
	*)
		echo "Unsupported browser: $BROWSER" >&2
		exit 2
		;;
esac

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/obsidian-clipper-codex-host"
MANIFEST_PATH="$SCRIPT_DIR/$HOST_NAME.$BROWSER.json"

cat > "$HOST_SCRIPT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/obsidian-clipper-codex-host.mjs"
EOF
chmod +x "$HOST_SCRIPT"

cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Obsidian Web Clipper Codex CLI native bridge",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

OS_NAME="$(uname -s)"
if [[ "$OS_NAME" == "Darwin" ]]; then
	if [[ "$BROWSER" == "edge" ]]; then
		TARGET_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
	else
		TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
	fi
else
	if [[ "$BROWSER" == "edge" ]]; then
		TARGET_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"
	else
		TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
	fi
fi

mkdir -p "$TARGET_DIR"
ln -sf "$MANIFEST_PATH" "$TARGET_DIR/$HOST_NAME.json"

echo "Installed $HOST_NAME for $BROWSER"
echo "Manifest: $MANIFEST_PATH"
echo "Registered: $TARGET_DIR/$HOST_NAME.json"
echo "Host: $HOST_SCRIPT"
