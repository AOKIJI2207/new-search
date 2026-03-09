# AGORAFLUX Country Risk Profiles Engine

Système industrialisable de fiches risque pays (sûreté / intelligence économique) couvrant tous les pays référencés dans la liste canonique (`country_profiles/data/countries.json`).

## Architecture

- `country_profiles/data/` : liste canonique des pays, profils générés (JSON), schéma.
- `country_profiles/sources/` : connecteurs par catégorie (macro, politique, sécurité, santé, mobilité, événements).
- `country_profiles/scoring/` : logique de baromètre et calcul du risque global.
- `country_profiles/generation/` : rendu Markdown/HTML/PDF.
- `country_profiles/templates/` : modèle unique de fiche.
- `country_profiles/history/` : versions historisées des fiches.
- `country_profiles/logs/` : journalisation et rapport de pays modifiés.
- `country_profiles/config/` : configuration centrale.
- `docs/` : documentation opérationnelle.
- `scripts/country_profiles_cli.py` : CLI de pilotage.

## Commandes

```bash
python3 scripts/country_profiles_cli.py update_all_countries
python3 scripts/country_profiles_cli.py update_country --country "Peru"
python3 scripts/country_profiles_cli.py generate_all_profiles
python3 scripts/country_profiles_cli.py generate_country_profile --country "Japan"
python3 scripts/country_profiles_cli.py diff_country_profile --country "Brazil"
python3 scripts/country_profiles_cli.py regenerate_modified_profiles
```

## Pipeline

1. Chargement liste pays canonique.
2. Récupération multi-sources par catégorie (avec priorité/fallback).
3. Normalisation + scoring transparent (1..5 par axe).
4. Génération JSON de la fiche structurée (14 sections).
5. Historisation version précédente.
6. Génération des exports MD/HTML/PDF.
7. Rapport des pays modifiés.

## Extension vers données réelles

Le système fonctionne end-to-end avec des connecteurs mock. Pour brancher des sources réelles :
1. créer un connecteur dans `country_profiles/sources/` ;
2. l’enregistrer dans `REGISTRY` ;
3. l’ajouter dans `source_priority` du fichier `config/defaults.json`.

Voir `docs/OPERATIONS.md` pour le détail.
