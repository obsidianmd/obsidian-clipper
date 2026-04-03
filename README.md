

<h1 align="center">Clipper for AppFlowy</h1>

<p align="center">
  <a rel="noreferrer noopener" href="https://chromewebstore.google.com/detail/ngjmhmikhoegpfakpfofaafagoikejln?utm_source=item-share-cb"><img alt="Chrome Web Store" src="https://img.shields.io/badge/Chrome-141e24.svg?&style=for-the-badge&logo=google-chrome&logoColor=white"></a>
  <a rel="noreferrer noopener" href="https://addons.mozilla.org/fr/firefox/addon/clipper-for-appflowy/"><img alt="Firefox Add-ons" src="https://img.shields.io/badge/Firefox-141e24.svg?&style=for-the-badge&logo=firefox-browser&logoColor=white"></a>
</p>

## What is it?

An unofficial browser extension that lets you save web pages, articles, and highlights directly to your [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) workspace — with one click.

<p align="center"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/2023_Obsidian_logo.svg/1280px-2023_Obsidian_logo.svg.png" alt="Obsidian Clipper" width="70" align="middle" />&nbsp;&nbsp;＋&nbsp;&nbsp;<img src="https://avatars.githubusercontent.com/u/86002201?s=80&v=4" alt="AppFlowy" width="80" align="middle" />&nbsp;&nbsp;→&nbsp;&nbsp;<img src="assets/logo.svg" alt="Clipper for AppFlowy" width="80" align="middle" /></p>

> This is a community fork of [obsidian-clipper](https://github.com/obsidianmd/obsidian-clipper), ported to AppFlowy. Not affiliated with or endorsed by the AppFlowy team.

Please refer to the [documentation](./docs) for details on how to install and use this extension.

## Install

| Browser           | Download |
| ----------------- | -------- |
| Chrome / Chromium | [Chrome Web Store](https://chromewebstore.google.com/detail/ngjmhmikhoegpfakpfofaafagoikejln?utm_source=item-share-cb) |
| Firefox           | [Firefox Add-Ons](https://addons.mozilla.org/fr/firefox/addon/clipper-for-appflowy/) |
| Safari            | [GitHub Releases](https://github.com/alexrosepizant/clipper-for-appflowy/releases/tag/v0.1.2) |

## Screenshots

<p align="center">
  <img src="assets/screenshot-clip.png" alt="Clip an article" />
  <img src="assets/screenshot-highlights.png" alt="Clip with highlights" />
</p>
<p align="center">
  <img src="assets/screenshot-appflowy.png" alt="Result in AppFlowy" />
  <img src="assets/screenshot-settings.png" alt="Settings & configuration" />
</p>

## Documentation

The [`docs/`](./docs) folder covers everything: [highlighting](./docs/Highlight%20web%20pages.md), [templates](./docs/Templates.md), [variables](./docs/Variables.md), [filters](./docs/Filters.md), and more.

## Contributing

Contributions are welcome! See the [open issues](https://github.com/alexrosepizant/clipper-for-appflowy/issues) or feel free to [report a bug or request a feature](https://github.com/alexrosepizant/clipper-for-appflowy/issues/new).

## Development

```sh
npm run build
```

Builds into three directories: `dist/` (Chromium), `dist_firefox/` (Firefox), `dist_safari/` (Safari).

**Load locally:**

- **Chrome/Arc/Brave/Edge:** `chrome://extensions` → Enable Developer mode → Load unpacked → select `dist/`
- **Firefox:** `about:debugging` → Load Temporary Add-on → select `dist_firefox/manifest.json`
- **Safari (iOS Simulator):** build, open `xcode/Clipper for AppFlowy/Clipper for AppFlowy.xcodeproj` in Xcode, run on simulator

```sh
npm test          # run tests
npm run test:watch  # watch mode
```

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/alexrosepizant"><img src="https://avatars.githubusercontent.com/u/9919730?v=4?s=100" width="100px;" alt="Alexandre Rose-Pizant"/><br /><sub><b>Alexandre Rose-Pizant</b></sub></a><br /><a href="https://github.com/alexrosepizant/clipper-for-appflowy/commits?author=alexrosepizant" title="Code">💻</a> <a href="https://github.com/alexrosepizant/clipper-for-appflowy/commits?author=alexrosepizant" title="Documentation">📖</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
