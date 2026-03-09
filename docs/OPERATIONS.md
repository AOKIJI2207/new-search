# Documentation d'exploitation

## 1. Fonctionnement
- Le moteur maintient un référentiel standardisé de fiches pays.
- Chaque fiche suit le format 14 sections imposé (risque global, baromètre, analyses, zones, bonnes pratiques).

## 2. Mise à jour automatique
Exécuter périodiquement (cron / scheduler CI) :

```bash
python3 scripts/country_profiles_cli.py update_all_countries
python3 scripts/country_profiles_cli.py regenerate_modified_profiles
```

Exemple cron hebdomadaire :
```cron
0 3 * * 1 cd /workspace/new-search && python3 scripts/country_profiles_cli.py regenerate_modified_profiles
```

## 3. Historisation
- À chaque modification d’un pays, la version précédente est sauvegardée dans `country_profiles/history/<country>/`.
- Le diff principal est accessible via `diff_country_profile`.

## 4. Ajouter une source
1. Créer une classe héritant de `BaseSource`.
2. Implémenter `fetch(country) -> SourceResult`.
3. Ajouter la classe à `REGISTRY`.
4. Déclarer la priorité dans `config/defaults.json`.

## 5. Modifier le scoring
- Ajuster les pondérations dans `config/defaults.json` (`risk_weights`).
- Modifier les règles de calcul dans `scoring/risk.py`.
- Le calcul est reproductible et déterministe (même entrée => même score).

## 6. Résilience / robustesse
- Validation de schéma via `data/schema.py`.
- Champs manquants tolérés avec fallback.
- Génération maintenue même en données partielles.
- Logs et rapports dans `country_profiles/logs/`.

## 7. Déploiement
- Déploiement standard Python (script CLI).
- Aucune dépendance externe obligatoire pour l’exécution de base.
- Optionnel: ajouter connecteurs API réels selon besoins sécurité/compliance.
