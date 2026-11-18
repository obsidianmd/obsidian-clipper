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

Add the credentials to `.env`, either as values or as [1Password secret references](https://developer.1password.com/docs/cli/secret-reference-syntax/). A value that starts with `op://` is read with `op read` when the script needs it, so the secret never touches the disk. With two 1Password accounts on one Mac, set `OP_ACCOUNT` so `op` knows which to use.

```
# Chrome Web Store: Developer Dashboard → Settings for the publisher ID; OAuth client from Google Cloud with the Chrome Web Store API enabled
CHROME_PUBLISHER_ID=op://<vault>/Chrome Web Store/publisher_id
CHROME_EXTENSION_ID=op://<vault>/Chrome Web Store/extension_id
CHROME_CLIENT_ID=op://<vault>/Chrome Web Store/client_id
CHROME_CLIENT_SECRET=op://<vault>/Chrome Web Store/client_secret
CHROME_REFRESH_TOKEN=op://<vault>/Chrome Web Store/refresh_token

# Edge Add-ons: Partner Center → Microsoft Edge → Publish API (keys expire after 72 days)
EDGE_PRODUCT_ID=op://<vault>/Edge Add-ons/product_id
EDGE_CLIENT_ID=op://<vault>/Edge Add-ons/client_id
EDGE_API_KEY=op://<vault>/Edge Add-ons/api_key

# Firefox: https://addons.mozilla.org/en-US/developers/addon/api/key/
AMO_JWT_ISSUER=op://<vault>/Firefox AMO/jwt_issuer
AMO_JWT_SECRET=op://<vault>/Firefox AMO/jwt_secret

# App Store Connect: Users and Access → Integrations → Team key with App Manager access
ASC_KEY_ID=op://<vault>/App Store Connect API/key_id
ASC_ISSUER_ID=op://<vault>/App Store Connect API/issuer_id
ASC_PRIVATE_KEY=op://<vault>/App Store Connect API/private_key
```

`ASC_PRIVATE_KEY` is the text of the `.p8` file. To use the file itself, set `ASC_KEY_PATH` to its absolute path instead. A key given as text is written to a temporary file for `xcodebuild` and deleted afterwards.

Edge uses the Chrome zip. Safari archives both Xcode schemes with the App Store Connect key, uploads them, waits for processing, then submits each platform for review with the changelog as "What's New" in every localization.
