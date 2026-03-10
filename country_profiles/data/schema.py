ALLOWED_CONTINENTS = {
    "Afrique",
    "Amérique du Nord",
    "Amérique du Sud",
    "Asie",
    "Europe",
    "Océanie",
    "Antarctique",
}

REQUIRED_PROFILE_FIELDS = [
    "country_id",
    "nom_pays",
    "english_name",
    "continent",
    "niveau_risque_global",
    "barometre_risques",
    "donnees_cles",
    "situation_securitaire",
    "geopolitique",
    "politique",
    "socio_economique",
    "criminalite",
    "terrorisme",
    "sanitaire_catastrophes",
    "deplacements",
    "analyse_par_zones",
    "synthese",
]

BAROMETER_FIELDS = [
    "geopolitique",
    "politique",
    "socio_economique",
    "criminalite",
    "terrorisme",
    "sanitaire_catastrophes",
    "deplacements",
]


def _valid_score(value):
    return isinstance(value, int) and 1 <= value <= 5


def validate_profile(profile: dict, catalog_entry: dict | None = None) -> list[str]:
    errors = []
    for field in REQUIRED_PROFILE_FIELDS:
        if field not in profile:
            errors.append(f"missing:{field}")

    risk_level = profile.get("niveau_risque_global")
    if not _valid_score(risk_level):
        errors.append("niveau_risque_global_range")

    continent = profile.get("continent")
    if continent not in ALLOWED_CONTINENTS:
        errors.append("continent_invalid")

    barometer = profile.get("barometre_risques", {})
    if not isinstance(barometer, dict):
        errors.append("barometre_risques_type")
    else:
        for axis in BAROMETER_FIELDS:
            value = barometer.get(axis)
            if value is None:
                errors.append(f"barometre_missing:{axis}")
            elif not _valid_score(value):
                errors.append(f"barometre_range:{axis}")

    zones = profile.get("analyse_par_zones")
    if not isinstance(zones, list) or not zones:
        errors.append("analyse_par_zones_invalid")
    else:
        for index, zone in enumerate(zones):
            if not isinstance(zone, dict):
                errors.append(f"analyse_par_zones_type:{index}")
                continue
            if not zone.get("zone"):
                errors.append(f"analyse_par_zones_zone_missing:{index}")
            if not _valid_score(zone.get("niveau_risque")):
                errors.append(f"analyse_par_zones_niveau_risque_range:{index}")
            if not zone.get("analyse"):
                errors.append(f"analyse_par_zones_analyse_missing:{index}")

    if catalog_entry:
        if profile.get("country_id") != catalog_entry.get("iso3"):
            errors.append("country_id_mismatch")
        if profile.get("continent") != catalog_entry.get("continent"):
            errors.append("continent_mismatch")
        if profile.get("nom_pays") != catalog_entry.get("nom_court"):
            errors.append("nom_pays_mismatch")
        if profile.get("english_name") != catalog_entry.get("english_name"):
            errors.append("english_name_mismatch")

    return errors


def validate_catalog(catalog: list[dict]) -> list[str]:
    errors = []
    if len(catalog) != 195:
        errors.append(f"catalog_count:{len(catalog)}")

    seen_country_ids = set()
    seen_iso2 = set()
    seen_iso3 = set()
    seen_nom_court = set()

    for country in catalog:
        for field in ["country_id", "nom_officiel", "nom_court", "english_name", "iso2", "iso3", "onu_status", "continent"]:
            if not country.get(field):
                errors.append(f"catalog_missing:{country.get('iso3', 'unknown')}:{field}")

        if country.get("continent") not in ALLOWED_CONTINENTS:
            errors.append(f"catalog_continent_invalid:{country.get('iso3')}")

        for field, seen in [
            ("country_id", seen_country_ids),
            ("iso2", seen_iso2),
            ("iso3", seen_iso3),
            ("nom_court", seen_nom_court),
        ]:
            value = country.get(field)
            if value in seen:
                errors.append(f"catalog_duplicate:{field}:{value}")
            else:
                seen.add(value)

    return errors
