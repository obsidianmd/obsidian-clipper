⚠️ **Obsidian Web Clipper is still in beta and requires Obsidian 1.7.2.** Please make sure you are using Obsidian 1.7.2 or above. Visit the [Obsidian Help site](https://help.obsidian.md/Extending+Obsidian/Obsidian+Web+Clipper) for more information.

## Getting started

Install the extension by downloading it from the official directory for your browser:

- **[Chrome Web Store](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf)** for Chrome, Brave, Edge, Arc, Orion, and other Chromium-based browsers.
- **[Firefox Add-Ons](https://addons.mozilla.org/en-US/firefox/addon/web-clipper-obsidian/)** for Firefox and Firefox Mobile.
- **[Safari Extensions](https://apps.apple.com/us/app/obsidian-web-clipper/id6720708363)** for macOS, iOS, and iPadOS.

## Using the extension

Documentation is available on the [Obsidian Help site](https://help.obsidian.md/Extending+Obsidian/Obsidian+Web+Clipper), which covers how to use templates, triggers, highlighting, and more.

## Developers

To build the extension:

```
npm run build
```

This will create three directories:
- `dist/` for the Chromium version
- `dist_firefox/` for the Firefox version
- `dist_safari/` for the Safari version

### Install the extension locally

For Chromium browsers, such as Chrome, Brave, Edge, and Arc:

1. Open your browser and navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist` directory

For Firefox:

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to the `dist_firefox` directory and select the `manifest.json` file

## Third-party libraries

- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) for browser compatibility
- [readability](https://github.com/mozilla/readability) for content extraction
- [turndown](https://github.com/mixmark-io/turndown) for HTML to Markdown conversion
- [dayjs](https://github.com/iamkun/dayjs) for date parsing and formatting
- [lz-string](https://github.com/pieroxy/lz-string) to compress templates to reduce storage space
- [lucide](https://github.com/lucide-icons/lucide) for icons
- [mathml-to-latex](https://github.com/asnunes/mathml-to-latex) for MathML to LaTeX conversion
