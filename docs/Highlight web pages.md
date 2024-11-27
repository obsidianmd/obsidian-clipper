---
permalink: web-clipper/highlight
aliases:
  - highlights
  - Highlighter
---
[[Introduction to Obsidian Web Clipper|Web Clipper]] allows you to highlight text on web pages, and select the elements you want to save to Obsidian. Your highlights are saved, so you can revisit them when you return to a page.

Highlights can be [[Clip web pages|captured]] and saved to Obsidian when you open the extension.

## Turn on highlighter

You can turn on highlighting in several ways, depending on your browser:

- The highlighter icon in the extension panel.
- Hotkeys, to activate the extension from your keyboard.
- Context menu, by right-clicking the web page you are visiting.

Once highlighting is on, you can select text, images, and elements you want to highlight.

## Highlighter settings

You can change the highlighter behavior by going to Web Clipper settings. Here you can also export your highlights to a `.json` file.

There are three options for highlights are inserted into your clipped note via the `{{content}}` [[Variables|variable]]:

- **Highlight the page content** — adds highlights directly to the text with the [[Obsidian Flavored Markdown|syntax]] `==highlight==`.
- **Replace the page content** — returns a list of highlights, without any of the page content.
- **Do nothing** — returns the original content without highlights.

You can add highlights directly to your template using the `{{highlights}}` variable, for example:

```
{{highlights|map: item => item.text|join:"\n\n"}}
```
