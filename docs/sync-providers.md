# Sync providers

Web Clipper settings and templates are represented internally as one versioned `SyncPayload` containing `schemaVersion`, `updatedAt`, normalized settings, and templates. Settings and template managers update this payload through `sync-manager.ts`; they do not select or call a storage backend directly.

The MVP includes three selectable providers:

- **Local only** stores the normalized payload in `browser.storage.local`.
- **Browser sync** maps the payload onto the existing browser-sync keys. Templates remain compressed and chunked under `template_<id>`, and `template_list` continues to preserve their ordering and IDs.
- **WebDAV** reads and writes the normalized payload as a JSON file at a user-configured HTTPS URL. It supports optional HTTP Basic authentication over TLS and keeps a local last-known-good cache for temporary network failures.

The provider preference is device-local. When selecting an empty provider, the current provider's payload is copied into it. If the target already contains data, that data is retained and becomes active. Switching providers never clears either backend.

Existing browser-sync data is decoded as a version 1 payload. Legacy full-settings exports remain importable, while new exports use the normalized payload shape.

## WebDAV setup

Select **WebDAV** under **General → Advanced → Settings storage** and enter the full URL of the JSON file, not only the server or directory URL. A Nextcloud URL typically looks like:

`https://cloud.example.com/remote.php/dav/files/USERNAME/obsidian-web-clipper.json`

Use **Test connection** to verify authentication and read access. A `404 Not Found` response is accepted for a new file; **Save and activate** then uploads the current settings and templates with `PUT`. The parent directory must already exist.

WebDAV URLs must use HTTPS. Use a separate, revocable app password instead of your main account password. The WebDAV credential is stored in local extension storage because browsers do not provide a portable system-keychain API for extensions. Interpreter API keys are also kept device-local and are redacted from every provider payload. Existing synchronized API keys are migrated to local storage before they are removed from a provider payload.

## Current limitations

- Synchronization uses whole-payload last-write-wins timestamps; there is no field- or template-level merge.
- Provider changes are explicit. The app does not continuously reconcile Local only and Browser sync.
- `updatedAt` is payload-level metadata. A future merge implementation should add stable per-template revision metadata without changing template IDs.
- WebDAV currently supports a direct HTTPS file URL and optional Basic authentication. It does not create missing parent directories, negotiate OAuth, support client certificates, or retry failed writes.
- WebDAV writes use whole-file PUT without ETags or conditional requests. Concurrent clients therefore use last-write-wins behavior.
- WebDAV credentials are stored in extension-local storage. Browser extension storage is not a secure system keychain, so a separate, revocable app password is required.

## Adding a provider

Implement `SyncProvider`, register it in the provider map, and expose any required connection UI. The implementation is responsible for encoding the normalized payload for its backend and can return backend-specific save warnings. Settings and template business logic should not need changes.
