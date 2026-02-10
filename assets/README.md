# Assets & caches de données

- `world-map.png` : fond visuel principal du site.
- `countries.json` : référentiel complet des pays du monde (source de référence alignée sur la liste Wikipédia) avec regroupement par continent.
- `country-profiles-cache.json` : cache disque des profils pays (Wikidata + World Bank + RSF), revalidation cible 24h.
- `translations-cache.json` : cache disque des traductions ticker vers FR (clé hash texte+langue+fr), TTL 7 jours.

## Endpoints et rafraîchissement
- `GET /api/sources` : sources RSS (ETag + Cache-Control).
- `GET /api/search` : scraping/filtrage d’articles sur les 5 thèmes autorisés.
- `GET /api/country-profiles` : profils pays pré-calculés (cache HTTP + mémoire + disque).
- `GET|POST /api/refresh-country-profiles` : forcer le refresh des profils pays.
- `GET /api/search-index` : index léger continents→pays pour navigation rapide sidebar.
- `GET /api/ticker` : flux du bandeau avec titres traduits en français (cache translation).

## Sources pays utilisées
- Liste des pays (référentiel) : `https://fr.wikipedia.org/wiki/Liste_des_pays_du_monde`.
- Liste des dirigeants actuels des États (référence chefs d’État / partis) : `https://fr.wikipedia.org/wiki/Liste_des_dirigeants_actuels_des_États` (ingestion automatique via API Wikipédia `action=parse`).
- Wikidata SPARQL : chef d’État, parti majoritaire, régime, prochaines élections.
- World Bank API : notations 1–5 (modèle), PIB/habitant (`NY.GDP.PCAP.CD`).
- RSF : classement WPFI.
- Références situation pays affichées dans les profils :
  - CCI France International : `https://www.ccifrance-international.org/le-kiosque/fiches-pays.html`
  - Coface : `https://www.coface.com/fr/actualites-economie-conseils-d-experts/tableau-de-bord-des-risques-economiques/fiches-risques-pays/france`

## Vérification du référentiel continents→pays
- Lancer `npm run test:countries-index`.
- Le test échoue explicitement si les seuils minimums ne sont pas respectés (Europe > 40, Afrique > 50, Asie > 40, Amérique du Nord > 20, Amérique du Sud > 10, Océanie > 10).
