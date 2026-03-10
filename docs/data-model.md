# Modèle de données AGORAFLUX

## Référentiel canonique
- `country_profiles/data/catalog/countries.json` : catalogue officiel des 195 États retenus.
- `country_profiles/data/catalog/continents.json` : enum des continents autorisés.
- `country_profiles/data/catalog/continent_assignments.json` : rattachements fixes des pays transcontinentaux.
- `country_profiles/data/profiles/<ISO3>.json` : une fiche canonique par pays.
- `country_profiles/data/manifest.json` : version, périmètre ONU, compteurs.

## Périmètre
- 193 États membres de l’ONU
- Palestine
- Saint-Siège

Tout territoire, dépendance ou État non retenu hors de ce périmètre est exclu du dataset canonique.

## Schéma canonique de fiche
Chaque profil expose les champs:
- `niveau_risque_global`
- `barometre_risques`
- `donnees_cles`
- `situation_securitaire`
- `geopolitique`
- `politique`
- `socio_economique`
- `criminalite`
- `terrorisme`
- `sanitaire_catastrophes`
- `deplacements`
- `analyse_par_zones`
- `synthese`

Des métadonnées techniques (`country_id`, `english_name`, `metadata`) sont conservées pour l’indexation et la traçabilité.

## Cohérence
- 195 entrées exactes dans le catalogue
- 195 profils exacts dans `profiles/`
- `country_id == iso3`
- un seul continent par pays
- notes `1..5` pour le global et le baromètre
- validation machine via `python3 scripts/country_profiles_cli.py validate_dataset`
