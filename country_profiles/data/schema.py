REQUIRED_FIELDS = [
    "country",
    "updated_at",
    "risk_global",
    "barometer",
    "security_overview",
    "main_risks",
    "key_data",
    "risk_zones",
    "context",
    "next_milestones",
    "category_analysis",
    "best_practices",
    "important_dates",
    "zone_analysis",
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


def validate_profile(profile: dict) -> list[str]:
    errors = []
    for field in REQUIRED_FIELDS:
        if field not in profile:
            errors.append(f"missing:{field}")
    for axis in BAROMETER_FIELDS:
        value = profile.get("barometer", {}).get(axis)
        if value is None:
            errors.append(f"barometer_missing:{axis}")
        elif not (1 <= value <= 5):
            errors.append(f"barometer_range:{axis}")
    return errors
