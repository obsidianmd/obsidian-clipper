# Obsidian Web Clipper+
This updated Web Clipper makes use of the Actions URI plugin in Obsidian to append and prepend to files better. Note that you will have to specify the correct vault as it cannot currently calculate the last-used vault. You must have the [Actions URI Plugin](https://github.com/czottmann/obsidian-actions-uri) installed and enabled to make use of the updater clipper.
I made this because I was sick of my appends having a newline between them and the list elements above them when clipping to list items.

Open to requests. Below the line is [the original README from obsidianmd's Web Clipper repo](https://github.com/obsidianmd/obsidian-clipper).

---
Obsidian Web Clipper+ helps you highlight and capture the web in your favorite browser. Anything you save is stored as durable Markdown files that you can read offline, and preserve for the long term.

- **[Official Obsidian Documentation](https://help.obsidian.md/web-clipper)**
- **[Official Obsidian Troubleshooting](https://help.obsidian.md/web-clipper/troubleshoot)**

## Use the extension

Documentation for the official Obsidian Web Clipper is available on the [Obsidian Help site](https://help.obsidian.md/web-clipper), which covers how to use [highlighting](https://help.obsidian.md/web-clipper/highlight), [templates](https://help.obsidian.md/web-clipper/templates), [variables](https://help.obsidian.md/web-clipper/variables), [filters](https://help.obsidian.md/web-clipper/filters), and more.

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
- [defuddle](https://github.com/kepano/defuddle) for content extraction
- [turndown](https://github.com/mixmark-io/turndown) for HTML to Markdown conversion
- [dayjs](https://github.com/iamkun/dayjs) for date parsing and formatting
- [lz-string](https://github.com/pieroxy/lz-string) to compress templates to reduce storage space
- [lucide](https://github.com/lucide-icons/lucide) for icons
- [mathml-to-latex](https://github.com/asnunes/mathml-to-latex) for MathML to LaTeX conversion
- [dompurify](https://github.com/cure53/DOMPurify) for sanitizing HTML
