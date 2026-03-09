# Repository Guidelines

## Project Structure & Module Organization
This repository is a small Vercel app with a static frontend and serverless API routes.

- `index.html`: single-page UI for search and local chat-style summarization.
- `api/search.js`: fetches RSS feeds, filters results, sorts, and deduplicates items.
- `api/sources.js`: exposes the list of selectable RSS sources.
- `assets/`: static images used by the frontend.
- `package.json`: minimal Node metadata and runtime dependency list.

Keep new backend endpoints under `api/` and static files under `assets/`. Avoid adding framework-specific structure unless the project is intentionally migrated.

## Build, Test, and Development Commands
Install dependencies with:

```sh
npm install
```

Run the project locally with Vercel dev mode:

```sh
vercel dev
```

This serves `index.html` and maps `api/*.js` as local serverless functions. There is no dedicated build script in `package.json` yet. If you add one, keep it consistent with Vercel deployment behavior.

## Coding Style & Naming Conventions
Use ES modules and keep the codebase dependency-light. Match the existing style:

- 2-space indentation in HTML, CSS, and JavaScript.
- `camelCase` for variables and functions (`loadSources`, `renderArticles`).
- Short, descriptive file names in lowercase.
- Prefer small helper functions over deeply nested inline logic.

No formatter or linter is configured today. If you introduce one, document the command here and keep rules minimal.

## Testing Guidelines
There is no automated test suite yet. For changes, verify manually with `vercel dev`:

- search with and without keywords
- source selection toggles
- API error handling for RSS failures
- chat responses based only on loaded items

If you add tests, place them in a dedicated `tests/` directory and use names like `search.test.js`.

## Commit & Pull Request Guidelines
Recent history uses short imperative commit messages such as `Update world-map.png` and `Delete vercel.json`. Follow that pattern:

- `Add source validation`
- `Fix RSS deduplication`

Pull requests should include a short summary, note any API or UI behavior changes, and attach screenshots when `index.html` is affected. Link the related issue or task when available.

## Deployment & Configuration Notes
This repo is intended for Vercel. Keep API routes compatible with Vercel serverless execution, and do not commit secrets. If configuration is needed later, prefer Vercel project environment variables over hardcoded values.
