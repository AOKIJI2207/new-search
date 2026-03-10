# Repository Guidelines

## Project Structure & Module Organization
- `data/countries.json` is the canonical continent index.
- `data/countries/*.json` stores one country profile per file.
- `api/country/[country].ts` is the only serverless endpoint.
- `components/` contains frontend modules and styles.
- `pages/` contains page-level rendering helpers.
- `scripts/update-country-data.js` and `scripts/validate-dataset.js` handle maintenance.

Do not reintroduce multi-endpoint backend logic. Keep country data static and versioned in Git.

## Build, Test, and Development Commands
- `npm run check` validates script and store syntax.
- `npm run validate-data` checks dataset completeness and schema integrity.
- `npm run update-data` refreshes economic indicators from public sources.
- `npm run build` runs syntax checks plus dataset validation.
- `vercel dev` starts the local Vercel-compatible app.

## Coding Style & Naming Conventions
- Use ES modules.
- Use 2-space indentation.
- Prefer lowercase file names and `camelCase` identifiers.
- Keep frontend modules small and data-first.
- Country files must stay slugified: `united-states.json`, `south-korea.json`.

## Testing Guidelines
- Run `npm run check` and `npm run validate-data` before committing.
- If country data logic changes, also run `npm run update-data`.
- Manually verify:
  - continent filters
  - country search
  - `/api/country/france`
  - 404 behavior on unknown countries

## Commit & Pull Request Guidelines
- Use short imperative commit messages, for example:
  - `Rebuild AGORAFLUX architecture from scratch`
  - `Improve dataset validation`
- PRs should describe dataset, API, and frontend impact clearly.

## Deployment Notes
- Vercel Hobby compatibility is mandatory.
- Keep the total number of serverless functions below 12; target is 1.
- Avoid runtime writes in API handlers.
