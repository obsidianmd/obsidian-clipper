# Obsidian Clipper Video ASR Native Host

This host is started on demand by the Chrome extension. It downloads one video,
extracts audio with FFmpeg, sends the audio to Volcengine/Doubao ASR, returns the
transcript, and deletes temporary media files before exiting.

Supported platforms:

- Douyin, using a pasted share link.
- YouTube, using the current video URL and `yt-dlp`.
- Bilibili, using the current video URL and `yt-dlp`.

## macOS setup

1. Install dependencies:

```bash
brew install ffmpeg yt-dlp
python3 -m pip install requests
```

2. Configure Doubao ASR credentials in Web Clipper settings under **ASR 转录**. For local development, you can also create `native-host/.env` from `.env.example` and fill `bean.record.asr.*`.

3. Register the host for your local Chrome extension id:

```bash
./native-host/install-macos.sh <chrome-extension-id>
```

The host does not run continuously. Chrome starts it only when the popup sends a
manual video transcription request.

## Runtime behavior

The extension connects to the host named `md.obsidian.clipper.video_asr` and sends a `transcribe-video` request. The host reports progress, writes temporary media under the configured download directory or the system temp directory, extracts audio with `ffmpeg`, calls Doubao ASR, returns `transcriptText` and metadata, then removes the downloaded video and temporary audio.

The host reads ASR settings from the extension request first. Missing values fall back to environment variables in `native-host/.env`:

- `bean.record.asr.base-url`
- `bean.record.asr.app-id`
- `bean.record.asr.access-token`
- `bean.record.asr.cluster`

## Troubleshooting

- `Unsupported native host request`: the extension and host are out of sync; rebuild the extension and reinstall the native host.
- `ffmpeg` or `yt-dlp` missing: install the dependency and make sure it is available on `PATH`.
- Douyin returns no video: paste the full share text or share URL from Douyin into the popup.
- Doubao ASR returns HTTP 400: check that the Cluster enabled in your Volcengine account matches the value in Web Clipper settings.
- Native host cannot connect after rebuilding locally: rerun `./native-host/install-macos.sh <chrome-extension-id>` with the current extension ID.
