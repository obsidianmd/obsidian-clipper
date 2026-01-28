# Obsidian Web Clipper for Android

An Android app that allows you to clip web pages to your Obsidian vault via the Share menu.

## Features

- Share URLs from any browser or app
- Automatic content extraction using Defuddle
- Markdown conversion using Turndown
- Template support with variable substitution
- Multiple vault support
- Direct integration with Obsidian via URI scheme

## Building

### Prerequisites

1. Android Studio (Arctic Fox or later)
2. Node.js (for building the JS bundle)
3. JDK 17+

### Build Steps

1. First, build the JavaScript extraction bundle:

```bash
# From the root project directory
npm install
npm run build:android
```

This will create `android/app/src/main/assets/clipper-bundle.js`

2. Open the `android` folder in Android Studio

3. Build and run the app

### Development

For development with hot-reload of the JS bundle:

```bash
npm run dev:android
```

## Architecture

```
ShareReceiverActivity    # Receives share intents
        │
        ▼
  ClipperActivity        # Main UI for clipping
        │
        ├─► WebViewExtractor    # Loads URL, injects JS, extracts content
        │         │
        │         ▼
        │   clipper-bundle.js   # Defuddle + Turndown
        │
        ├─► TemplateEngine      # Applies template to content
        │
        └─► ObsidianLauncher    # Builds obsidian:// URI
```

## How It Works

1. User shares a URL from their browser
2. `ShareReceiverActivity` extracts the URL and launches `ClipperActivity`
3. `WebViewExtractor` loads the URL in a hidden WebView
4. Once loaded, it injects `clipper-bundle.js` (Defuddle + Turndown)
5. The JS extracts content and converts to Markdown
6. Results are sent back to Kotlin via `@JavascriptInterface`
7. `TemplateEngine` applies the selected template
8. User reviews and taps "Save"
9. `ObsidianLauncher` copies content to clipboard and opens Obsidian via URI

## Settings

- **Vaults**: Add your Obsidian vault names (must match exactly)
- **Templates**: Manage clipping templates
- **Auto-save**: Skip the preview screen and save immediately after extraction
- **Silent save**: Don't open Obsidian after saving, just show a confirmation toast
- **Direct save to folder**: Write files directly to the vault folder on your device's filesystem, bypassing Obsidian's URI scheme entirely. This is the recommended option for seamless clipping without interruptions.

### Direct Save Mode

When "Direct save to folder" is enabled, you'll need to select your vault folder:

1. Enable the toggle in Settings
2. Tap "Select Vault Folder"
3. Navigate to your Obsidian vault folder (e.g., in Documents or a synced folder)
4. Tap "Use this folder" to grant access

The app will then write `.md` files directly to your vault. Obsidian will detect them automatically when you open it or if sync is running.

## Templates

Templates support variables like:
- `{{title}}` - Page title
- `{{url}}` - Page URL
- `{{content}}` - Markdown content
- `{{author}}` - Author name
- `{{published}}` - Publication date
- `{{description}}` - Meta description
- `{{domain}}` - Domain name
- `{{date}}` - Current date/time

And filters like:
- `{{title|lower}}` - Lowercase
- `{{title|slugify}}` - URL-friendly slug
- `{{content|blockquote}}` - Add blockquote markers

## Troubleshooting

### "Obsidian is not installed" error
Make sure Obsidian is installed from the Play Store. The app checks for the package `md.obsidian`.

### Notes not being created in Obsidian
Android and Chrome have restrictions on custom URI schemes like `obsidian://`. You have two options:

**Option 1: Use Direct Save Mode (Recommended)**
Enable "Direct save to folder" in Settings. This writes files directly to your vault folder, bypassing the URI scheme entirely.

**Option 2: Install a URI Handler**
Install a third-party app like **"Open Link With..."** from the Play Store to enable `obsidian://` URIs.

Steps:
1. Install "Open Link With..." or similar app from Play Store
2. Configure it to open `obsidian://` links with Obsidian
3. Test by opening `obsidian://new?vault=YourVault&file=test&content=hello` in Chrome

### Vault name must match exactly
The vault name in settings must match your Obsidian vault name exactly (case-sensitive).

## License

Same license as the main Obsidian Web Clipper project.
