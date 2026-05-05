# Agent Notes

## Project Shape

- Browser extension source lives in `src/`.
- User-facing help pages live in `docs/`.
- Local native messaging support for manual video ASR lives in `native-host/`.
- Build outputs are `dist/`, `dist_firefox/`, and `dist_safari/`.

## Development Commands

- `npm run build` builds Chrome, Firefox, and Safari extension bundles.
- `npm test` runs the Vitest suite once.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run dev:chrome`, `npm run dev:firefox`, and `npm run dev:safari` run browser-specific watch builds.

## Editing Rules

- Keep changes small and reviewable; match the existing TypeScript, Markdown, and tab-indented JSON style.
- Search before assuming paths, APIs, settings keys, or browser support.
- Do not commit credentials. ASR credentials belong in extension settings or local environment files, never in source docs or logs.
- For behavior changes, prefer the fastest relevant test first. Video ASR helpers are covered by `src/utils/video-asr.test.ts`.

## Video ASR Notes

- The manual video transcription flow supports Douyin, YouTube, and Bilibili URLs.
- Douyin requires a pasted share link in the popup because the page itself is not read for ASR metadata.
- The popup sends `nativeVideoAsr` through `src/background.ts` to the native host `md.obsidian.clipper.video_asr`.
- The native host downloads media, extracts audio with `ffmpeg`, calls Doubao ASR, returns `{{transcript}}`, and deletes temporary media.
- macOS Chrome registration is handled by `native-host/install-macos.sh`.
