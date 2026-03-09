
def clamp_score(v: float) -> int:
    return max(1, min(5, int(round(v))))


def compute_barometer(data: dict) -> dict:
    macro = data.get("macro", {})
    political = data.get("political", {})
    security = data.get("security", {})
    health = data.get("health", {})
    mobility = data.get("mobility", {})

    socio = 6 - min(5, max(1, round((macro.get("hdi", 0.7) * 5))))
    corruption = macro.get("corruption_index", 50)
    geopolitique = clamp_score(2 + (100 - corruption) / 50)
    return {
        "geopolitique": geopolitique,
        "politique": clamp_score(political.get("stability_score", 3)),
        "socio_economique": clamp_score(socio),
        "criminalite": clamp_score(security.get("crime_score", 3)),
        "terrorisme": clamp_score(security.get("terrorism_score", 2)),
        "sanitaire_catastrophes": clamp_score((health.get("health_risk", 2) + health.get("catastrophe_risk", 2)) / 2),
        "deplacements": clamp_score(mobility.get("travel_risk", 2)),
    }


def compute_global_level(barometer: dict, weights: dict) -> tuple[float, str]:
    score = 0.0
    for k, w in weights.items():
        score += barometer.get(k, 3) * w
    if score < 2:
        level = "Faible"
    elif score < 3:
        level = "Modéré"
    elif score < 4:
        level = "Élevé"
    else:
        level = "Critique"
    return round(score, 2), level
