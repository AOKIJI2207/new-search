from pathlib import Path
from copy import deepcopy
from .utils.io import read_json, write_json, ensure_dir, utc_now
from .sources.manager import fetch_by_category
from .scoring.risk import compute_barometer, compute_global_level
from .data.schema import validate_profile


def _comparable(profile: dict) -> dict:
    p = deepcopy(profile)
    p.pop("updated_at", None)
    return p


def load_countries(path="country_profiles/data/countries.json"):
    return read_json(path, default=[])


def profile_path(country_name: str) -> Path:
    safe = country_name.lower().replace(" ", "_").replace("'", "")
    return Path("country_profiles/data/profiles") / f"{safe}.json"


def build_profile(country: dict, config: dict) -> dict:
    raw = fetch_by_category(country, config["source_priority"])
    barometer = compute_barometer(raw)
    score, global_level = compute_global_level(barometer, config["risk_weights"])
    profile = {
        "country": country["name"],
        "updated_at": utc_now(),
        "risk_global": global_level,
        "risk_score": score,
        "barometer": barometer,
        "security_overview": f"Profil de risque {global_level.lower()} pour voyageurs d'affaires et entreprises, avec recommandations de continuité d'activité.",
        "main_risks": raw.get("security", {}).get("main_risks", ["Données partielles"]),
        "key_data": {
            "Population": raw.get("macro", {}).get("population", "N/A"),
            "Indice de corruption": raw.get("macro", {}).get("corruption_index", "N/A"),
            "Facilité de faire des affaires": raw.get("macro", {}).get("ease_of_doing_business", "N/A"),
            "Indice de développement humain": raw.get("macro", {}).get("hdi", "N/A"),
            "Croissance du PIB": raw.get("macro", {}).get("gdp_growth", "N/A"),
        },
        "risk_zones": raw.get("security", {}).get("risk_zones", ["N/A"]),
        "context": raw.get("events", {}).get("context", "Données contextuelles indisponibles"),
        "next_milestones": raw.get("political", {}).get("upcoming_events", ["N/A"]),
        "category_analysis": {
            "Géopolitique": "Analyse basée sur signaux multi-sources.",
            "Politique": "Stabilité institutionnelle et calendrier politique suivis.",
            "Socio-économique": "Tendances inflation/emploi/croissance intégrées.",
            "Criminalité": "Niveau de menace criminelle pour actifs et personnels.",
            "Terrorisme": "Exposition terroriste évaluée par criticité locale.",
            "Sanitaire & catastrophes": "Risque sanitaire et aléas naturels agrégés.",
            "Déplacements": raw.get("mobility", {}).get("mobility_notes", "Vigilance standard."),
        },
        "best_practices": {
            "comportement": "Appliquer protocole voyage et sûreté entreprise.",
            "législation": "Vérifier conformité locale avant opération.",
            "risques spécifiques": "Prévoir plans de continuité et évacuation.",
        },
        "important_dates": raw.get("events", {}).get("important_dates", ["N/A"]),
        "zone_analysis": {
            "capitale": country.get("capital", "N/A"),
            "grandes villes": "Prioriser cartographie des risques urbains.",
            "régions sensibles": "Actualiser selon événements sécurité.",
            "zones frontalières": "Contrôles renforcés et variabilité locale.",
        },
        "raw_sources": raw,
    }
    errs = validate_profile(profile)
    profile["validation_errors"] = errs
    return profile


def update_country(country_name: str, config: dict) -> dict:
    countries = load_countries()
    found = next((c for c in countries if c["name"].lower() == country_name.lower()), None)
    if not found:
        raise ValueError(f"Country not found: {country_name}")
    old = read_json(profile_path(found["name"]), default={})
    new = build_profile(found, config)
    write_json(profile_path(found["name"]), new)
    if old:
        hist = ensure_dir(Path(config["history_dir"]) / found["name"].lower().replace(" ", "_"))
        write_json(hist / f"{old.get('updated_at','unknown').replace(':','-')}.json", old)
    return new


def update_all(config: dict) -> list[str]:
    modified = []
    for country in load_countries():
        p = profile_path(country["name"])
        before = read_json(p, default={})
        after = build_profile(country, config)
        if _comparable(before) != _comparable(after):
            modified.append(country["name"])
            if before:
                hist = ensure_dir(Path(config["history_dir"]) / country["name"].lower().replace(" ", "_"))
                write_json(hist / f"{before.get('updated_at','unknown').replace(':','-')}.json", before)
            write_json(p, after)
    report = {
        "updated_at": utc_now(),
        "modified_countries": modified,
        "count": len(modified),
    }
    write_json(Path(config["logs_dir"]) / "last_update_report.json", report)
    return modified


def diff_country(country_name: str, config: dict) -> dict:
    p = profile_path(country_name)
    current = read_json(p, default={})
    hist_dir = Path(config["history_dir"]) / country_name.lower().replace(" ", "_")
    if not hist_dir.exists():
        return {"country": country_name, "changes": ["No history"]}
    versions = sorted(hist_dir.glob("*.json"))
    if not versions:
        return {"country": country_name, "changes": ["No history versions"]}
    previous = read_json(versions[-1], default={})
    changes = []
    for k in ["risk_global", "risk_score", "barometer", "main_risks", "context"]:
        if previous.get(k) != current.get(k):
            changes.append({"field": k, "before": previous.get(k), "after": current.get(k)})
    return {"country": country_name, "changes": changes}
