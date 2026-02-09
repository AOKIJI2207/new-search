# Assets & caches de données

- `world-map.png` : fond visuel principal du site.
- `country-profiles-cache.json` : cache disque des profils pays (Wikidata + World Bank + RSF), revalidation cible 24h.
- `translations-cache.json` : cache disque des traductions ticker vers FR (clé hash texte+langue+fr), TTL 7 jours.

## Endpoints et rafraîchissement
- `GET /api/sources` : sources RSS (ETag + Cache-Control).
- `GET /api/search` : scraping/filtrage d’articles sur les 5 thèmes autorisés.
- `GET /api/country-profiles` : profils pays pré-calculés (cache HTTP + mémoire + disque).
- `GET|POST /api/refresh-country-profiles` : forcer le refresh des profils pays.
- `GET /api/search-index` : index léger continents→pays pour navigation rapide sidebar.
- `GET /api/ticker` : flux du bandeau avec titres traduits en français (cache translation).

## Navigation UI
- Sidebar continents cliquables sur l’accueil.
- Vue continent : route `/continent/:slug` avec liste des pays triée + filtre local instantané.
- Profil pays : route `/country/:slug`.
