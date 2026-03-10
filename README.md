# AGORAFLUX

AGORAFLUX is a clean geopolitical country dataset built for Vercel Hobby.

## Architecture

- `data/countries.json`: canonical list of UN countries grouped by continent
- `data/countries/*.json`: one strict JSON profile per country
- `api/country/[country].ts`: the only serverless route
- `components/` and `pages/`: lightweight frontend modules
- `scripts/update-country-data.js`: updates economic indicators from public sources
- `scripts/validate-dataset.js`: validates the dataset before deployment

## Commands

```bash
npm run check
npm run validate-data
npm run update-data
npm run build
vercel dev
```

## Deployment goal

- one API route only
- static country dataset
- Vercel Hobby compatible
