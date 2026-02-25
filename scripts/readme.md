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

### Playwright Regression

```bash
python3 scripts/pw_resize_roundtrip_middle_word.py
```

- Verifies resize round-trip on overlapping text highlights:
  - small middle-word highlight (`Clerk`)
  - larger surrounding highlight (`James Clerk Maxwell`)
  - per-character expansion samples while dragging the end handle
  - grow selected small highlight to full range
  - shrink it back to small range
- Exits non-zero if any assertion fails.
