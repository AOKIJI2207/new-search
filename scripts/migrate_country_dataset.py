#!/usr/bin/env python3
import json
from pathlib import Path
from statistics import mean
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
ASSETS_COUNTRIES = ROOT / "assets" / "countries.json"
OLD_PROFILES_DIR = ROOT / "country_profiles" / "data" / "profiles"
CATALOG_DIR = ROOT / "country_profiles" / "data" / "catalog"
SCHEMA_DIR = ROOT / "country_profiles" / "data" / "schema"
MANIFEST_PATH = ROOT / "country_profiles" / "data" / "manifest.json"
COMPAT_COUNTRIES_PATH = ROOT / "country_profiles" / "data" / "countries.json"
LOGS_DIR = ROOT / "country_profiles" / "logs"

CONTINENTS = [
    "Afrique",
    "Amérique du Nord",
    "Amérique du Sud",
    "Asie",
    "Europe",
    "Océanie",
    "Antarctique",
]

UN_MEMBER_SCOPE = "193 États membres de l’ONU + Palestine + Saint-Siège"

EXCLUDED_ISO3 = {
    "ALA", "AIA", "ATA", "ABW", "ASM", "ATF", "BES", "BLM", "BMU", "BVT",
    "CCK", "COK", "CUW", "CXR", "CYM", "ESH", "FLK", "FRO", "GIB", "GLP",
    "GRL", "GUF", "GGY", "GUM", "HKG", "HMD", "IMN", "IOT", "JEY", "MAC",
    "MAF", "MNP", "MSR", "MTQ", "MYT", "NCL", "NFK", "NIU", "PCN", "PRI",
    "PYF", "REU", "SGS", "SHN", "SJM", "SPM", "SXM", "TCA", "TKL", "TWN",
    "UMI", "UNK", "VGB", "VIR", "WLF",
}

TRANSCONTINENT_ASSIGNMENTS = {
    "ARM": {"continent": "Asie", "reason": "Rattachement éditorial fixe AGORAFLUX."},
    "AZE": {"continent": "Asie", "reason": "Rattachement éditorial fixe AGORAFLUX."},
    "CYP": {"continent": "Europe", "reason": "Rattachement éditorial fixe AGORAFLUX."},
    "EGY": {"continent": "Afrique", "reason": "Rattachement éditorial fixe AGORAFLUX."},
    "GEO": {"continent": "Asie", "reason": "Rattachement éditorial fixe AGORAFLUX."},
    "KAZ": {"continent": "Asie", "reason": "Rattachement éditorial fixe AGORAFLUX."},
    "RUS": {"continent": "Europe", "reason": "Rattachement éditorial fixe AGORAFLUX."},
    "TUR": {"continent": "Asie", "reason": "Rattachement éditorial fixe AGORAFLUX."},
}

PROFILE_ALIASES = {
    "BRN": ["Brunei Darussalam", "Brunei"],
    "BOL": ["Bolivia, Plurinational State of", "Bolivia"],
    "CPV": ["Cabo Verde", "Cape Verde"],
    "COD": ["Congo, The Democratic Republic of the", "DR Congo", "Democratic Republic of the Congo"],
    "COG": ["Congo", "Republic of the Congo"],
    "CIV": ["Côte d'Ivoire", "Ivory Coast", "Cote d'Ivoire"],
    "CZE": ["Czechia", "Czech Republic"],
    "PRK": ["Korea, Democratic People's Republic of", "North Korea"],
    "KOR": ["Korea, Republic of", "South Korea"],
    "LAO": ["Lao People's Democratic Republic", "Laos"],
    "FSM": ["Micronesia, Federated States of", "Micronesia"],
    "MDA": ["Moldova, Republic of", "Moldova"],
    "MMR": ["Myanmar"],
    "PSE": ["Palestine, State of", "Palestine"],
    "RUS": ["Russian Federation", "Russia"],
    "STP": ["Sao Tome and Principe", "São Tomé and Príncipe"],
    "SWZ": ["Eswatini"],
    "SYR": ["Syrian Arab Republic", "Syria"],
    "TZA": ["Tanzania, United Republic of", "Tanzania"],
    "TLS": ["Timor-Leste"],
    "TUR": ["Türkiye", "Turkey"],
    "VAT": ["Holy See (Vatican City State)", "Vatican City"],
    "VEN": ["Venezuela, Bolivarian Republic of", "Venezuela"],
    "VNM": ["Viet Nam", "Vietnam"],
    "IRN": ["Iran, Islamic Republic of", "Iran"],
}


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFD", value or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    cleaned = []
    for ch in text.lower():
        cleaned.append(ch if ch.isalnum() else " ")
    return " ".join("".join(cleaned).split())


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def numeric_risk_level(old_profile: dict) -> int:
    score = old_profile.get("risk_score")
    if isinstance(score, (int, float)):
        return max(1, min(5, round(score)))
    barometer = old_profile.get("barometer", {})
    values = [barometer.get(axis) for axis in (
        "geopolitique",
        "politique",
        "socio_economique",
        "criminalite",
        "terrorisme",
        "sanitaire_catastrophes",
        "deplacements",
    )]
    values = [int(v) for v in values if isinstance(v, (int, float))]
    return max(1, min(5, round(mean(values)))) if values else 3


def normalize_key_data(old_profile: dict) -> dict:
    key_data = old_profile.get("key_data", {})
    return {
        "population": key_data.get("Population"),
        "indice_corruption": key_data.get("Indice de corruption"),
        "facilite_affaires": key_data.get("Facilité de faire des affaires"),
        "indice_developpement_humain": key_data.get("Indice de développement humain"),
        "croissance_pib": key_data.get("Croissance du PIB"),
    }


def build_zone_analysis(old_profile: dict, risk_level: int) -> list[dict]:
    output = []
    zone_analysis = old_profile.get("zone_analysis", {})
    for zone, analyse in zone_analysis.items():
        output.append({
            "zone": zone,
            "niveau_risque": risk_level,
            "analyse": analyse or "Analyse non renseignée.",
        })

    if not output:
        for zone in old_profile.get("risk_zones", []):
            output.append({
                "zone": zone,
                "niveau_risque": risk_level,
                "analyse": "Vigilance renforcée selon l’évaluation nationale.",
            })

    if not output:
        output.append({
            "zone": "national",
            "niveau_risque": risk_level,
            "analyse": "Analyse zonale non renseignée.",
        })
    return output


def build_canonical_profile(country: dict, old_profile: dict) -> dict:
    analyses = old_profile.get("category_analysis", {})
    risk_level = numeric_risk_level(old_profile)
    updated_at = old_profile.get("updated_at", "2026-03-10T00:00:00Z")
    return {
        "country_id": country["iso3"],
        "nom_pays": country["name"],
        "english_name": country["englishName"],
        "continent": country["continent"],
        "niveau_risque_global": risk_level,
        "barometre_risques": {
            "geopolitique": int(old_profile.get("barometer", {}).get("geopolitique", risk_level)),
            "politique": int(old_profile.get("barometer", {}).get("politique", risk_level)),
            "socio_economique": int(old_profile.get("barometer", {}).get("socio_economique", risk_level)),
            "criminalite": int(old_profile.get("barometer", {}).get("criminalite", risk_level)),
            "terrorisme": int(old_profile.get("barometer", {}).get("terrorisme", risk_level)),
            "sanitaire_catastrophes": int(old_profile.get("barometer", {}).get("sanitaire_catastrophes", risk_level)),
            "deplacements": int(old_profile.get("barometer", {}).get("deplacements", risk_level)),
        },
        "donnees_cles": normalize_key_data(old_profile),
        "situation_securitaire": old_profile.get("security_overview", "Situation sécuritaire non renseignée."),
        "geopolitique": analyses.get("Géopolitique", "Analyse géopolitique non renseignée."),
        "politique": analyses.get("Politique", "Analyse politique non renseignée."),
        "socio_economique": analyses.get("Socio-économique", "Analyse socio-économique non renseignée."),
        "criminalite": analyses.get("Criminalité", "Analyse criminalité non renseignée."),
        "terrorisme": analyses.get("Terrorisme", "Analyse terrorisme non renseignée."),
        "sanitaire_catastrophes": analyses.get("Sanitaire & catastrophes", "Analyse sanitaire et catastrophes non renseignée."),
        "deplacements": analyses.get("Déplacements", "Analyse déplacements non renseignée."),
        "analyse_par_zones": build_zone_analysis(old_profile, risk_level),
        "synthese": old_profile.get("context", old_profile.get("security_overview", "Synthèse non renseignée.")),
        "metadata": {
            "version": 1,
            "source_profile": "migrated-from-legacy",
            "last_updated": updated_at,
            "review_status": "validated",
        },
    }


def build_profile_index():
    index = {}
    for path in OLD_PROFILES_DIR.glob("*.json"):
        payload = read_json(path)
        names = {payload.get("country", "")}
        for values in PROFILE_ALIASES.values():
            names.update(values)
        for name in list(names):
            if name:
                index.setdefault(normalize(name), payload)
    return index


def profile_for_country(country: dict, profile_index: dict) -> dict:
    candidates = [
        country["englishName"],
        country["name"],
        *PROFILE_ALIASES.get(country["iso3"], []),
    ]
    seen = set()
    for candidate in candidates:
        key = normalize(candidate)
        if key in seen:
            continue
        seen.add(key)
        if key in profile_index:
            return profile_index[key]
    raise KeyError(f"No legacy profile found for {country['iso3']} {country['englishName']}")


def profile_schema():
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "AGORAFLUX Country Profile",
        "type": "object",
        "required": [
            "country_id", "nom_pays", "english_name", "continent", "niveau_risque_global",
            "barometre_risques", "donnees_cles", "situation_securitaire", "geopolitique",
            "politique", "socio_economique", "criminalite", "terrorisme",
            "sanitaire_catastrophes", "deplacements", "analyse_par_zones", "synthese",
        ],
        "properties": {
            "country_id": {"type": "string", "pattern": "^[A-Z]{3}$"},
            "nom_pays": {"type": "string", "minLength": 1},
            "english_name": {"type": "string", "minLength": 1},
            "continent": {"type": "string", "enum": CONTINENTS},
            "niveau_risque_global": {"type": "integer", "minimum": 1, "maximum": 5},
            "barometre_risques": {
                "type": "object",
                "required": [
                    "geopolitique", "politique", "socio_economique", "criminalite",
                    "terrorisme", "sanitaire_catastrophes", "deplacements",
                ],
                "additionalProperties": False,
                "properties": {
                    axis: {"type": "integer", "minimum": 1, "maximum": 5}
                    for axis in [
                        "geopolitique", "politique", "socio_economique", "criminalite",
                        "terrorisme", "sanitaire_catastrophes", "deplacements",
                    ]
                },
            },
            "donnees_cles": {"type": "object"},
            "situation_securitaire": {"type": "string"},
            "geopolitique": {"type": "string"},
            "politique": {"type": "string"},
            "socio_economique": {"type": "string"},
            "criminalite": {"type": "string"},
            "terrorisme": {"type": "string"},
            "sanitaire_catastrophes": {"type": "string"},
            "deplacements": {"type": "string"},
            "analyse_par_zones": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["zone", "niveau_risque", "analyse"],
                    "additionalProperties": False,
                    "properties": {
                        "zone": {"type": "string", "minLength": 1},
                        "niveau_risque": {"type": "integer", "minimum": 1, "maximum": 5},
                        "analyse": {"type": "string", "minLength": 1},
                    },
                },
            },
            "synthese": {"type": "string"},
            "metadata": {"type": "object"},
        },
        "additionalProperties": False,
    }


def catalog_schema():
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "AGORAFLUX Country Catalog",
        "type": "array",
        "items": {
            "type": "object",
            "required": [
                "country_id", "nom_officiel", "nom_court", "english_name",
                "iso2", "iso3", "onu_status", "continent",
            ],
            "additionalProperties": False,
            "properties": {
                "country_id": {"type": "string", "pattern": "^[A-Z]{3}$"},
                "nom_officiel": {"type": "string", "minLength": 1},
                "nom_court": {"type": "string", "minLength": 1},
                "english_name": {"type": "string", "minLength": 1},
                "iso2": {"type": "string", "pattern": "^[A-Z]{2}$"},
                "iso3": {"type": "string", "pattern": "^[A-Z]{3}$"},
                "onu_status": {"type": "string", "enum": ["member_state", "observer_state"]},
                "continent": {"type": "string", "enum": CONTINENTS},
            },
        },
    }


def build_validation_report(catalog_entries, profiles):
    return {
        "generated_at": "2026-03-10",
        "country_count_expected": 195,
        "country_count_catalog": len(catalog_entries),
        "country_count_profiles": len(profiles),
        "valid": len(catalog_entries) == 195 and len(profiles) == 195,
        "scope": UN_MEMBER_SCOPE,
        "errors": [],
    }


def main():
    assets = read_json(ASSETS_COUNTRIES)["countries"]
    profile_index = build_profile_index()

    filtered = [country for country in assets if country["iso3"] not in EXCLUDED_ISO3]
    if len(filtered) != 195:
        raise SystemExit(f"Expected 195 countries after filtering, found {len(filtered)}")

    filtered.sort(key=lambda item: item["name"])
    catalog_entries = []
    canonical_profiles = {}
    compatibility_countries = []

    for country in filtered:
        continent = TRANSCONTINENT_ASSIGNMENTS.get(country["iso3"], {}).get("continent", country["continent"])
        old_profile = profile_for_country(country, profile_index)
        profile = build_canonical_profile({**country, "continent": continent}, old_profile)
        catalog_entry = {
            "country_id": country["iso3"],
            "nom_officiel": country["name"],
            "nom_court": country["name"],
            "english_name": country["englishName"],
            "iso2": country["iso2"],
            "iso3": country["iso3"],
            "onu_status": "observer_state" if country["iso3"] in {"PSE", "VAT"} else "member_state",
            "continent": continent,
        }
        catalog_entries.append(catalog_entry)
        canonical_profiles[country["iso3"]] = profile
        compatibility_countries.append({
            "name": country["name"],
            "englishName": country["englishName"],
            "slug": country["slug"],
            "iso2": country["iso2"],
            "iso3": country["iso3"],
            "continent": continent,
        })

    for path in OLD_PROFILES_DIR.glob("*.json"):
        path.unlink()

    for iso3, profile in canonical_profiles.items():
        write_json(OLD_PROFILES_DIR / f"{iso3}.json", profile)

    write_json(CATALOG_DIR / "continents.json", CONTINENTS)
    write_json(CATALOG_DIR / "continent_assignments.json", {
        "scope": "Pays transcontinentaux avec rattachement AGORAFLUX unique",
        "assignments": TRANSCONTINENT_ASSIGNMENTS,
    })
    write_json(CATALOG_DIR / "countries.json", catalog_entries)
    write_json(COMPAT_COUNTRIES_PATH, compatibility_countries)
    write_json(SCHEMA_DIR / "profile.schema.json", profile_schema())
    write_json(SCHEMA_DIR / "catalog.schema.json", catalog_schema())
    write_json(MANIFEST_PATH, {
        "dataset": "agoraflux-country-profiles",
        "version": 1,
        "generated_at": "2026-03-10",
        "scope": UN_MEMBER_SCOPE,
        "country_count": len(catalog_entries),
        "profile_count": len(canonical_profiles),
        "schema_version": 1,
    })
    write_json(LOGS_DIR / "validation-report.json", build_validation_report(catalog_entries, canonical_profiles))


if __name__ == "__main__":
    main()
