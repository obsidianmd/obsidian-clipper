---
permalink: web-clipper/troubleshoot
---

If you encounter issues with [[Introduction to AppFlowy Web Clipper|Web Clipper]] you can get help by [opening an issue](https://github.com/alexrosepizant/clipper-for-appflowy/issues) on the GitHub repository.

## General

### Some content is missing

By default, Web Clipper tries to intelligently capture content from the page. However it may not be successful in doing so across all websites.

Web Clipper uses [Defuddle](https://github.com/kepano/defuddle) to capture only the main content of the page. This excludes header, footer, and other elements, but sometimes it can be overly conservative and remove content that you want to keep. You can [report bugs](https://github.com/kepano/defuddle) to Defuddle.

To bypass Defuddle in Web Clipper use the following methods:

- Select text, or use `Cmd/Ctrl+A` to select all text.
- [[Highlight web pages|Highlight content]] to choose exactly what you want to capture.
- Use a [[Templates|custom template]] for the site.

### No content appears in AppFlowy

If you don't see any content in AppFlowy when you click **Add to AppFlowy**:

- Check for errors in the browser developer console.
- Check that the folder name is correctly formatted.

## Linux

#### AppFlowy does not open

- Make sure the AppFlowy URI protocol is registered on your system.
- If you are using Firefox you may need to [register it in the browser settings](https://kb.mozillazine.org/Register_protocol).

#### AppFlowy opens but only the file name is saved

It is likely that AppFlowy cannot access your clipboard. Clipboard access is necessary to pass data from your browser to AppFlowy. Your configuration can affect how apps are sandboxed, and clipboard permissions.

```ini
# hyprland.conf
misc {
    focus_on_activate = true
}
```

- If you use Flatpak consider trying an officially supported AppFlowy version.

## iOS and iPadOS

To enable the Web Clipper extension for Safari:

1. Go to Safari, tap the leftmost button in the browser URL bar, it looks like a rectangle with lines beneath it.
2. Tap **Manage Extensions**.
3. Enable **AppFlowy Web Clipper** in the Extensions list.
4. Exit the menu.
5. To use the extension **tap the puzzle piece icon** in the URL bar.

To allow Web Clipper to run on all websites:

1. Go to iOS **[[Settings]]** → **Apps** → **Safari** → **Extensions**.
2. Under **Permissions** allow it to run on all websites.

To allow AppFlowy to always receive Web Clipper content:

1. Go to iOS **[[Settings]]** → **Apps** → **AppFlowy**.
2. Set **Paste from other apps** to **Allow**.
