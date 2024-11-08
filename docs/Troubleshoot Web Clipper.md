---
permalink: web-clipper/troubleshoot
---
If you encounter issues with [[Introduction to Obsidian Web Clipper|Web Clipper]] you can get help via the [official Discord channel](https://discord.com/channels/686053708261228577/1285652864089198672). You can also report bugs on the [GitHub repo](https://github.com/obsidianmd/obsidian-clipper).

###  No content appears in Obsidian

If you don't see any content in Obsidian when you click **Add to Obsidian**:

- Check for errors in the Obsidian [[Help and support#Capture console logs|developer console]].
- Check that your vault name in Web Clipper settings exactly matches your *vault name* in Obsidian *not the vault path*.
- Check that the folder name is correctly formatted.

#### Linux

1. Make sure the [[Obsidian URI]] protocol [[Obsidian URI#Register Obsidian URI|is registered]].
2. If you are using Flatpak consider trying an [officially supported Obsidian version](https://obsidian.md/download) — Flatpak apps have stricter sandboxing which may not allow data to be passed between your browser and Obsidian via the clipboard.
3. Try switching to **Legacy mode** in Web Clipper → General settings. This will bypass the clipboard and save content directly via URI. Note that this may limit the number of characters that can be clipped depending on your browser and Linux distribution.

### Some content is missing

By default, Web Clipper tries to intelligently capture content from the page. However it may not be successful in doing so across all websites.

Web Clipper uses Firefox's [Readability](https://github.com/mozilla/readability) code to try and capture only the main content. This excludes header, footer, and other elements, but sometimes it can be overly conservative.

You can bypass Readability with the following methods:

- Select text, or use `Cmd/Ctrl+A` to select all text.
- [[Highlight web pages|Highlight content]] to choose exactly what you want to capture.
- Use a [[Obsidian Web Clipper/Templates|custom template]] for the site.
