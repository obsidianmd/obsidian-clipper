## Scripts

### Localization

First, add an OpenAI API key in `.env` at the root of the repo:

```
OPENAI_API_KEY=sk-...
```

Optionally, configure the model to use for translations (defaults to `gpt-4`):

```
OPENAI_MODEL=gpt-4o
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