from pathlib import Path
from copy import deepcopy
from .utils.io import read_json, write_json, ensure_dir, utc_now
from .sources.manager import fetch_by_category
from .scoring.risk import compute_barometer, compute_global_level
from .data.schema import validate_catalog, validate_profile


CATALOG_PATH = "country_profiles/data/catalog/countries.json"


def _comparable(profile: dict) -> dict:
    p = deepcopy(profile)
    p.get("metadata", {}).pop("last_updated", None)
    return p


def load_countries(path=CATALOG_PATH):
    countries = read_json(path, default=[])
    errors = validate_catalog(countries)
    if errors:
      raise ValueError(f"Invalid country catalog: {', '.join(errors[:10])}")
    return countries


def find_country(query: str) -> dict:
    normalized = (query or "").strip().lower()
    for country in load_countries():
        values = [
            country["country_id"],
            country["iso2"],
            country["iso3"],
            country["nom_officiel"],
            country["nom_court"],
            country["english_name"],
        ]
        if any(str(value).lower() == normalized for value in values):
            return country
    raise ValueError(f"Country not found: {query}")


def profile_path(country_query: str) -> Path:
    country = find_country(country_query)
    return Path("country_profiles/data/profiles") / f"{country['iso3']}.json"


def build_profile(country: dict, config: dict) -> dict:
    raw = fetch_by_category(country, config["source_priority"])
    barometer = compute_barometer(raw)
    risk_level = compute_global_level(barometer, config["risk_weights"])
    profile = {
        "country_id": country["iso3"],
        "nom_pays": country["nom_court"],
        "english_name": country["english_name"],
        "continent": country["continent"],
        "niveau_risque_global": risk_level,
        "barometre_risques": barometer,
        "donnees_cles": {
            "population": raw.get("macro", {}).get("population"),
            "indice_corruption": raw.get("macro", {}).get("corruption_index"),
            "facilite_affaires": raw.get("macro", {}).get("ease_of_doing_business"),
            "indice_developpement_humain": raw.get("macro", {}).get("hdi"),
            "croissance_pib": raw.get("macro", {}).get("gdp_growth"),
        },
        "situation_securitaire": f"Profil de risque {risk_level}/5 pour voyageurs d'affaires et entreprises.",
        "geopolitique": "Analyse basée sur signaux multi-sources.",
        "politique": "Stabilité institutionnelle et calendrier politique suivis.",
        "socio_economique": "Tendances inflation/emploi/croissance intégrées.",
        "criminalite": "Niveau de menace criminelle pour actifs et personnels.",
        "terrorisme": "Exposition terroriste évaluée par criticité locale.",
        "sanitaire_catastrophes": "Risque sanitaire et aléas naturels agrégés.",
        "deplacements": raw.get("mobility", {}).get("mobility_notes", "Vigilance standard."),
        "analyse_par_zones": [
            {
                "zone": zone,
                "niveau_risque": risk_level,
                "analyse": "Vigilance renforcée selon l’évaluation nationale.",
            }
            for zone in raw.get("security", {}).get("risk_zones", ["National"])
        ],
        "synthese": raw.get("events", {}).get("context", "Synthèse indisponible"),
        "metadata": {
            "version": 1,
            "source_profile": "pipeline",
            "last_updated": utc_now(),
            "review_status": "draft",
        },
    }
    errs = validate_profile(profile, country)
    if errs:
        raise ValueError(f"Invalid profile generated for {country['iso3']}: {', '.join(errs)}")
    return profile


def update_country(country_query: str, config: dict) -> dict:
    country = find_country(country_query)
    old = read_json(profile_path(country_query), default={})
    new = build_profile(country, config)
    write_json(profile_path(country_query), new)
    if old:
        hist = ensure_dir(Path(config["history_dir"]) / country["iso3"])
        write_json(hist / f"{old.get('metadata', {}).get('last_updated', 'unknown').replace(':', '-')}.json", old)
    return new


def update_all(config: dict) -> list[str]:
    modified = []
    for country in load_countries():
        path = profile_path(country["iso3"])
        before = read_json(path, default={})
        after = build_profile(country, config)
        if _comparable(before) != _comparable(after):
            modified.append(country["iso3"])
            if before:
                hist = ensure_dir(Path(config["history_dir"]) / country["iso3"])
                write_json(hist / f"{before.get('metadata', {}).get('last_updated', 'unknown').replace(':', '-')}.json", before)
            write_json(path, after)
    report = {
        "updated_at": utc_now(),
        "modified_countries": modified,
        "count": len(modified),
    }
    write_json(Path(config["logs_dir"]) / "last_update_report.json", report)
    return modified


def diff_country(country_query: str, config: dict) -> dict:
    country = find_country(country_query)
    current = read_json(profile_path(country_query), default={})
    hist_dir = Path(config["history_dir"]) / country["iso3"]
    if not hist_dir.exists():
        return {"country": country["iso3"], "changes": ["No history"]}
    versions = sorted(hist_dir.glob("*.json"))
    if not versions:
        return {"country": country["iso3"], "changes": ["No history versions"]}
    previous = read_json(versions[-1], default={})
    changes = []
    for k in ["niveau_risque_global", "barometre_risques", "synthese"]:
        if previous.get(k) != current.get(k):
            changes.append({"field": k, "before": previous.get(k), "after": current.get(k)})
    return {"country": country["iso3"], "changes": changes}
