---
permalink: web-clipper/capture
aliases:
    - AppFlowy Web Clipper/Capture web pages
---

Once you install the [[Introduction to AppFlowy Web Clipper|Web Clipper]] browser extension, you can access it in several ways, depending on your browser:

1. The AppFlowy Web Clipper icon in your browser toolbar.
2. Hotkeys, to activate the extension from your keyboard.
3. Context menu, by right-clicking the web page you are visiting.

To save a page to AppFlowy click the **Add to AppFlowy** button.

## Capture a page

When you open the extension, Web Clipper extracts data from the current web page following the settings in your [[Templates|template]]. You can create your own templates, and customize the output using [[variables]] and [[filters]].

By default Web Clipper attempts to intelligently extract only the main article content, excluding other elements on the page. However, you can override this behavior in the following ways:

- If a custom template is present it uses your template.
- If a selection is present, it uses the selection. You can use `Ctrl/Cmd+A` to select the entire page.
- If any [[Highlight web pages|highlights]] are present, it uses the highlights.

## Download images

Images are not automatically downloaded when you use Web Clipper. Instead, images link to their web-based URL.

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
2. **Properties** shows the metadata extracted from the page.
3. **Note content** that will be saved to AppFlowy.
4. **Footer** allows you to select the folder and add to AppFlowy.

Header functionality includes:

- **Template** dropdown to switch between your saved [[Templates|templates]] added in Web Clipper settings.
- **More (...)** button to display page variables you can use in templates.
- **Highlighter** button to turn on [[Highlight web pages|highlighting]].
- **Cog** button to open Web Clipper settings.

Footer functionality includes:

- **Add to AppFlowy** button to save data to AppFlowy.
- **Folder** field to define which folder to save to.
- **Interpreter** to run [[Interpret web pages|natural language prompts]] on the page.
