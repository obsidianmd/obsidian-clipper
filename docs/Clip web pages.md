---
permalink: web-clipper/capture
aliases:
  - Obsidian Web Clipper/Capture web pages
---
Once you install the [[Introduction to Obsidian Web Clipper|Web Clipper]] browser extension, you can access it in several ways, depending on your browser:

1. The Obsidian icon in your browser toolbar.
2. Hotkeys, to activate the extension from your keyboard.
3. Context menu, by right-clicking the web page you are visiting.

To save a page to Obsidian click the **Add to Obsidian** button.

## Capture a page

When you open the extension, Web Clipper extracts data from the current web page following the settings in your [[Obsidian Web Clipper/Templates|template]]. You can create your own templates, and customize the output using [[variables]] and [[filters]].

By default Web Clipper attempts to intelligently extract only the main article content, excluding other elements on the page. However, you can override this behavior in the following ways:

- If a custom template is present it uses your template.
- If a selection is present, it uses the selection. You can use `Ctrl/Cmd+A` to select the entire page.
- If any [[Highlight web pages|highlights]] are present, it uses the highlights.

## Batch clip URLs

To clip multiple pages, open Web Clipper and click **Batch clip URLs** in the header. Paste one URL per line and click **Start batch clip**.

Batch clipping opens pages in background tabs, waits for each page to load, scrolls the page to give lazy-loaded content a chance to appear, then clips each page using your default Web Clipper template. Web Clipper processes a limited number of tabs at a time and saves notes one at a time, so Obsidian receives each page in order.

Successfully clipped tabs are closed automatically. Tabs that cannot be clipped stay open so you can handle cookie notices, sign-in prompts, captchas, or site-specific errors, then retry those URLs from the batch page.

Batch clipping can optionally notify you when a run finishes. Choose **Do nothing**, **System notification**, **Sound**, or **Notification and sound** from the **When finished** menu.

Batch saves request silent Obsidian handoff when possible, so Obsidian saves the note without opening it. Depending on your operating system and Obsidian protocol handling, Obsidian may still be brought to the foreground while processing an `obsidian://` save URL.

Batch saves use the same clipboard handoff as normal clipping, with a short `obsidian://` URL telling Obsidian to read the clipped content from the clipboard. If clipboard handoff is unavailable, Web Clipper falls back to direct URI content when it is small enough to send safely. Failed batch entries include debug details such as the save stage, final URL, template behavior, vault, note path, content size, handoff URL length, and timings.

Templates with Interpreter prompt variables are not supported in batch mode. Use a template without prompts for batch clipping, or clip those pages manually.

## Download images

Images are not automatically downloaded when you use Web Clipper. Instead, images link to their web-based URL. This saves space in your vault but it means the images will not be accessible offline, or if the URL stops working.

You can download images for any file in Obsidian using the [[Command palette|command]] named **Download attachments for current file**. This command can also be mapped to a hotkey in Obsidian.

## Hotkeys

Web Clipper includes keyboard shortcuts you can use to speed up your workflow. To change key mappings go to **Web Clipper Settings** → **General** and follow the instructions for your browser. Mappings can be changed for all browsers except Safari which does not support editing hotkeys.

| Action                  | macOS         | Windows/Linux  |
| ----------------------- | ------------- | -------------- |
| Open clipper            | `Cmd+Shift+O` | `Ctrl+Shift+O` |
| Quick clip              | `Opt+Shift+O` | `Alt+Shift+O`  |
| Toggle highlighter mode | `Opt+Shift+H` | `Alt+Shift+H`  |

## Interface functionality

The Web Clipper interface is divided into four sections:

1. **Header** where you can switch templates, turn on [[Highlight web pages|highlighting]], and access settings.
2. **Properties** shows the [[Properties|metadata]] extracted from the page that will be saved as [[Properties]] in Obsidian.
3. **Note content** that will be saved to Obsidian.
4. **Footer** allows you select the vault and folder, and add to Obsidian.

Header functionality includes:

- **Template** dropdown to switch between your saved [[Obsidian Web Clipper/Templates|templates]] added in Web Clipper settings.
- **More (...)** button to display page variables you can use in templates.
- **Highlighter** button to turn on [[Highlight web pages|highlighting]].
- **Batch clip URLs** button to clip a list of URLs.
- **Cog** button to open Web Clipper settings.

Footer functionality includes:

- **Add to Obsidian** button to save data to Obsidian.
- **Vault** dropdown to switch between saved vaults added in Web Clipper settings.
- **Folder** field to define which folder to save to.
- **Interpreter** to run [[Interpret web pages|natural language prompts]] on the page.
