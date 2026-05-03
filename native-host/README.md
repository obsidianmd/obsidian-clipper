# Obsidian Clipper Video ASR Native Host

This host is started on demand by the Chrome extension. It downloads one video,
extracts audio with FFmpeg, sends the audio to Volcengine/Doubao ASR, returns the
transcript, and deletes temporary media files before exiting.

## macOS setup

1. Install dependencies:

```bash
brew install ffmpeg yt-dlp
python3 -m pip install requests
```

2. Create `native-host/.env` from `.env.example` and fill `bean.record.asr.*`.

3. Register the host for your local Chrome extension id:

```bash
./native-host/install-macos.sh <chrome-extension-id>
```

The host does not run continuously. Chrome starts it only when the popup sends a
manual video transcription request.
