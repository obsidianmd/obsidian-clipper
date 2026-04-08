#!/bin/bash

set -e

NEW_VERSION="$1"

if [ -z "$NEW_VERSION" ]; then
	echo "Usage: ./bump-version.sh <version>"
	echo "Example: ./bump-version.sh 1.0.1"
	exit 1
fi

if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
	echo "Error: Version must be in semver format (X.Y.Z)"
	exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# JSON files to update
JSON_FILES=(
	"package.json"
	"src/manifest.chrome.json"
	"src/manifest.firefox.json"
	"src/manifest.safari.json"
	"dev/manifest.json"
)

LANDING="landing/index.html"
PACKAGE_LOCK="package-lock.json"

PBXPROJ="xcode/Clipper for AppFlowy/Clipper for AppFlowy.xcodeproj/project.pbxproj"

echo "Bumping version to $NEW_VERSION"
echo ""

# Update JSON files
for file in "${JSON_FILES[@]}"; do
	filepath="$ROOT_DIR/$file"
	old_version=$(grep -o '"version": "[^"]*"' "$filepath" | head -1 | sed 's/"version": "//;s/"//')
	sed -i '' "s/\"version\": \"$old_version\"/\"version\": \"$NEW_VERSION\"/" "$filepath"
	echo "Updated $file: $old_version -> $NEW_VERSION"
done

# Update MARKETING_VERSION in Xcode project
pbxpath="$ROOT_DIR/$PBXPROJ"
old_marketing=$(grep -o 'MARKETING_VERSION = [^;]*' "$pbxpath" | head -1 | sed 's/MARKETING_VERSION = //')
sed -i '' "s/MARKETING_VERSION = $old_marketing;/MARKETING_VERSION = $NEW_VERSION;/g" "$pbxpath"
marketing_count=$(grep -c "MARKETING_VERSION = $NEW_VERSION;" "$pbxpath")
echo "Updated project.pbxproj MARKETING_VERSION: $old_marketing -> $NEW_VERSION ($marketing_count occurrences)"

# Increment CURRENT_PROJECT_VERSION
old_build=$(grep -o 'CURRENT_PROJECT_VERSION = [0-9]*' "$pbxpath" | head -1 | sed 's/CURRENT_PROJECT_VERSION = //')
new_build=$((old_build + 1))
sed -i '' "s/CURRENT_PROJECT_VERSION = $old_build;/CURRENT_PROJECT_VERSION = $new_build;/g" "$pbxpath"
build_count=$(grep -c "CURRENT_PROJECT_VERSION = $new_build;" "$pbxpath")
echo "Updated project.pbxproj CURRENT_PROJECT_VERSION: $old_build -> $new_build ($build_count occurrences)"

# Update landing page version
landingpath="$ROOT_DIR/$LANDING"
old_landing=$(grep -o 'v[0-9]*\.[0-9]*\.[0-9]*' "$landingpath" | head -1 | sed 's/v//')
sed -i '' "s/v$old_landing/v$NEW_VERSION/g" "$landingpath"
echo "Updated $LANDING: $old_landing -> $NEW_VERSION"

# Update package-lock.json (top-level and root package entry only)
lockpath="$ROOT_DIR/$PACKAGE_LOCK"
old_lock=$(grep -o '"version": "[^"]*"' "$lockpath" | head -1 | sed 's/"version": "//;s/"//')
# Only replace the first two occurrences (top-level and "" package entry)
awk -v old="\"version\": \"$old_lock\"" -v new="\"version\": \"$NEW_VERSION\"" \
	'count<2 && index($0,old){sub(old,new); count++} {print}' "$lockpath" > "$lockpath.tmp" && mv "$lockpath.tmp" "$lockpath"
echo "Updated $PACKAGE_LOCK: $old_lock -> $NEW_VERSION"

echo ""
echo "Done!"
