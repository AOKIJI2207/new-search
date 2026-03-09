# Logique de scoring

Le baromètre est calculé sur 7 axes notés de 1 (faible) à 5 (critique):
- Géopolitique
- Politique
- Socio-économique
- Criminalité
- Terrorisme
- Sanitaire & catastrophes
- Déplacements

## Règles
- Les connecteurs fournissent des signaux normalisés par catégorie.
- Le moteur (`scoring/risk.py`) transforme ces signaux en notes 1..5.
- Le score global est une moyenne pondérée (configurable dans `config/defaults.json`).

## Pondérations par défaut
- geopolitique: 0.15
- politique: 0.15
- socio_economique: 0.15
- criminalite: 0.20
- terrorisme: 0.10
- sanitaire_catastrophes: 0.15
- deplacements: 0.10

## Interprétation du risque global
- `< 2.0` : Faible
- `< 3.0` : Modéré
- `< 4.0` : Élevé
- `>= 4.0` : Critique
