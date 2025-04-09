---
permalink: web-clipper/troubleshoot
---
If you encounter issues with [[Introduction to Obsidian Web Clipper|Web Clipper]] you can get help via the [official Discord channel](https://discord.com/channels/686053708261228577/1285652864089198672). You can also report bugs on the [GitHub repo](https://github.com/obsidianmd/obsidian-clipper).

## General

### Some content is missing

By default, Web Clipper tries to intelligently capture content from the page. However it may not be successful in doing so across all websites.

Web Clipper uses [Defuddle](https://github.com/kepano/defuddle) to capture only the main content of the page. This excludes header, footer, and other elements, but sometimes it can be overly conservative and remove content that you want to keep. You can [report bugs](https://github.com/kepano/defuddle) to Defuddle.

To bypass Defuddle in Web Clipper use the following methods:

- Select text, or use `Cmd/Ctrl+A` to select all text.
- [[Highlight web pages|Highlight content]] to choose exactly what you want to capture.
- Use a [[Obsidian Web Clipper/Templates|custom template]] for the site.

### No content appears in Obsidian

If you don't see any content in Obsidian when you click **Add to Obsidian**:

- Check for errors in the Obsidian [[Help and support#Capture console logs|developer console]].
- Check that your vault name in Web Clipper settings exactly matches your *vault name* in Obsidian *not the vault path*.
- Check that the folder name is correctly formatted.

## Linux

#### Obsidian does not open

- Make sure the [[Obsidian URI]] protocol [[Obsidian URI#Register Obsidian URI|is registered]].
- If you are using Firefox you may need to [register it the browser settings](https://kb.mozillazine.org/Register_protocol).

#### Obsidian opens but only the file name is saved

It is likely that Obsidian cannot access your clipboard. Clipboard access is necessary to pass data from your browser to Obsidian. Your configuration can affect how apps are sandboxed, and clipboard permissions.

If you use Wayland, make sure that Obsidian has the permissions to read the clipboard when the app is not focused. For example, in your Hyprland configuration:

```ini
# hyprland.conf
misc {
    focus_on_activate = true
}
```

- If you use Flatpak consider trying an [officially supported Obsidian version](https://obsidian.md/download).
- As a fallback, try switching to **Legacy mode** in **Web Clipper Settings** → **General**. This will bypass the clipboard and save content directly via URI. Note that this will limit the number of characters that can be clipped depending on your browser and Linux distribution.

## iOS and iPadOS

To enable the Web Clipper extension for Safari:

1. Go to Safari, tap the leftmost button in the browser URL bar, it looks like a rectangle with lines beneath it.
2. Tap **Manage Extensions**.
3. Enable **Obsidian Web Clipper** in the Extensions list.
4. Exit the menu.
5. To use the extension **tap the puzzle piece icon** in the URL bar.

To allow Web Clipper to run on all websites:

1. Go to iOS **Settings** →  **Apps** →  **Safari** →  **Extensions**.
2. Under **Permissions** allow it to run on all websites.

To allow Obsidian to always receive Web Clipper content:

1. Go to iOS **Settings** →  **Apps** →  **Obsidian**.
2. Set **Paste from other apps** to **Allow**.
