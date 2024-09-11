#!/bin/bash

# Build for Chrome
echo "Building for Chrome..."
cp src/manifest.chrome.json dist/manifest.json

# Build for Firefox
echo "Building for Firefox..."
cp src/manifest.firefox.json dist_firefox/manifest.json