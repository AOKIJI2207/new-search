# Assets & caches de données

- `world-map.png` : fond visuel principal du site.
- `country-profiles-cache.json` : cache disque des profils pays (Wikidata + World Bank + RSF), revalidation cible 24h.
- `translations-cache.json` : cache disque des traductions ticker vers FR (clé hash texte+langue+fr), TTL 7 jours.

## Fréquences de mise à jour
- Profils pays : endpoint `GET /api/country-profiles` (cache HTTP + mémoire + disque), refresh forcé via `GET|POST /api/refresh-country-profiles`.
- Ticker : endpoint `GET /api/ticker` (cache mémoire court + cache HTTP) avec traduction automatique préservie en cache.
- Sources RSS : `GET /api/sources` avec ETag et `Cache-Control`.
