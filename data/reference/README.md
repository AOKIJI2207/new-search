# Reference Datasets

This directory stores optional country-level snapshots used to enrich AGORAFLUX profiles from
international sources that do not expose a simple unauthenticated JSON API for bulk refresh.

Expected files:

- `undp-hdi.json`
- `transparency-cpi.json`
- `freedom-house.json`
- `acled-conflict-index.json`
- `global-terrorism-index.json`
- `sipri-military-expenditure.json`
- `global-peace-index.json`

Each file should map an ISO3 code to a small object containing the latest known value, year, and
source metadata. The update script will prefer live official APIs when available and fall back to
these local snapshots otherwise.
