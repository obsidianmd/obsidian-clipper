## Scripts

### Localization

First, add an OpenAI API key in `.env` at the root of the repo:

```
OPENAI_API_KEY=sk-...
```

Scripts can be run using npm in the root of the repo.

#### Update locale

```
npm run update-locales
```

- Checks the English locale file and automatically translates missing strings
- Reorganizes strings alphabetically

#### Add locale

```bash
npm run add-locale fr
```

### Version bump

```bash
./scripts/bump-version.sh 1.0.1
```

- Updates `version` in `package.json`, all browser manifests, and `dev/manifest.json`
- Updates `MARKETING_VERSION` in the Xcode project
- Increments `CURRENT_PROJECT_VERSION` by 1

### Changelog

```bash
./scripts/generate-changelog.sh
```

- Generates `changelogs/<version>.md` from commits since the last git tag
- Reads the version from `package.json`
- Commits starting with "fix" are grouped under an **Improved** section
- Version bump commits are excluded
### Store release

```bash
npm run release -- --dry-run
```

```bash
npm run release:chrome
```

- Uploads the current version to the Chrome Web Store, Edge Add-ons, Firefox Add-ons and the App Store (Safari on iOS and macOS), and submits it for review
- `npm run release` runs every store; `release:<store>` runs one
- `--dry-run` checks the build, changelog and credentials (read-only calls for Chrome, Firefox and Safari) without uploading
- Release notes come from `changelogs/<version>.md`
- Run `bump-version.sh`, `generate-changelog.sh` and `npm run build` first, and commit, because the Firefox source zip is a `git archive` of `HEAD`

Add these to `.env`:

```
# Chrome Web Store: Developer Dashboard → Settings for the publisher ID; OAuth client from Google Cloud with the Chrome Web Store API enabled
CHROME_PUBLISHER_ID=
CHROME_EXTENSION_ID=
CHROME_CLIENT_ID=
CHROME_CLIENT_SECRET=
CHROME_REFRESH_TOKEN=

# Edge Add-ons: Partner Center → Microsoft Edge → Publish API (keys expire after 72 days)
EDGE_PRODUCT_ID=
EDGE_CLIENT_ID=
EDGE_API_KEY=

# Firefox: https://addons.mozilla.org/en-US/developers/addon/api/key/
AMO_JWT_ISSUER=
AMO_JWT_SECRET=

# App Store Connect: Users and Access → Integrations → Team key with App Manager access
ASC_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
ASC_KEY_ID=
ASC_ISSUER_ID=
```

Edge uses the Chrome zip. Safari archives both Xcode schemes with the App Store Connect key, uploads them, waits for processing, then submits each platform for review with the changelog as "What's New" in every localization.
