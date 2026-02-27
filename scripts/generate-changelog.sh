#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Get version from package.json
VERSION=$(grep -o '"version": "[^"]*"' "$ROOT_DIR/package.json" | head -1 | sed 's/"version": "//;s/"//')

# Get latest tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -z "$LAST_TAG" ]; then
	echo "Error: No tags found"
	exit 1
fi

if [ "$VERSION" = "$LAST_TAG" ]; then
	echo "Error: package.json version ($VERSION) is the same as the latest tag ($LAST_TAG). Bump the version first."
	exit 1
fi

OUTPUT="$ROOT_DIR/changelogs/$VERSION.md"

echo "Generating changelog for $VERSION (commits since $LAST_TAG)"

# Collect commits
NEW=""
IMPROVED=""
FIXES=""

while IFS= read -r subject; do
	if echo "$subject" | grep -qiE '^bump version|^version bump'; then
		continue
	elif echo "$subject" | grep -qiE '^fix'; then
		subject=$(echo "$subject" | sed -E 's/^fix: /Fix /i;s/^fix/Fix/')
		FIXES+="- $subject"$'\n'
	elif echo "$subject" | grep -qiE '^add|^new'; then
		NEW+="- $subject"$'\n'
	else
		IMPROVED+="- $subject"$'\n'
	fi
done < <(git log "$LAST_TAG"..HEAD --format="%s" --no-merges)

# Generate changelog
{
	NEEDS_SPACER=false
	if [ -n "$NEW" ]; then
		echo "## New"
		echo ""
		printf "%s" "$NEW"
		NEEDS_SPACER=true
	fi
	if [ -n "$IMPROVED" ]; then
		if $NEEDS_SPACER; then echo ""; fi
		echo "## Improved"
		echo ""
		printf "%s" "$IMPROVED"
		NEEDS_SPACER=true
	fi
	if [ -n "$FIXES" ]; then
		if $NEEDS_SPACER; then echo ""; fi
		echo "## Fixes"
		echo ""
		printf "%s" "$FIXES"
	fi
} > "$OUTPUT"

echo "Saved to changelogs/$VERSION.md"
