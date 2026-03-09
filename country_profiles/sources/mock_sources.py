from .base import BaseSource, SourceResult


def _seed(country: dict) -> int:
    return sum(ord(c) for c in country["name"]) % 100


class MockMacro(BaseSource):
    name = "mock_macro"
    category = "macro"

    def fetch(self, country: dict) -> SourceResult:
        s = _seed(country)
        data = {
            "population": 500_000 + s * 300_000,
            "corruption_index": max(20, min(90, 70 - s // 2)),
            "ease_of_doing_business": max(30, min(90, 65 + (s % 20))),
            "hdi": round(0.55 + (s % 35) / 100, 3),
            "gdp_growth": round(-1 + (s % 80) / 10, 1),
        }
        return SourceResult(self.category, self.name, data)


class MockPolitical(BaseSource):
    name = "mock_political"
    category = "political"

    def fetch(self, country: dict) -> SourceResult:
        s = _seed(country)
        return SourceResult(self.category, self.name, {
            "stability_score": 1 + (s % 5),
            "upcoming_events": ["Échéance électorale nationale", "Revue budgétaire gouvernementale"],
            "recent_events": ["Mobilisations sociales localisées", "Ajustements de politique publique"]
        })


class MockSecurity(BaseSource):
    name = "mock_security"
    category = "security"

    def fetch(self, country: dict) -> SourceResult:
        s = _seed(country)
        return SourceResult(self.category, self.name, {
            "crime_score": 1 + ((s + 1) % 5),
            "terrorism_score": 1 + ((s + 2) % 5),
            "main_risks": ["Criminalité opportuniste", "Risque cyber", "Manifestations ponctuelles"],
            "risk_zones": ["Capitale et périphérie", "Axes logistiques", "Certaines zones frontalières"]
        })


class MockHealth(BaseSource):
    name = "mock_health"
    category = "health"

    def fetch(self, country: dict) -> SourceResult:
        s = _seed(country)
        return SourceResult(self.category, self.name, {
            "health_risk": 1 + ((s + 3) % 5),
            "catastrophe_risk": 1 + ((s + 4) % 5)
        })


class MockMobility(BaseSource):
    name = "mock_mobility"
    category = "mobility"

    def fetch(self, country: dict) -> SourceResult:
        s = _seed(country)
        return SourceResult(self.category, self.name, {
            "travel_risk": 1 + ((s + 2) % 5),
            "mobility_notes": "Prévoir des marges sur les déplacements interurbains et vérifier les avis locaux."
        })


class MockEvents(BaseSource):
    name = "mock_events"
    category = "events"

    def fetch(self, country: dict) -> SourceResult:
        return SourceResult(self.category, self.name, {
            "context": "Contexte évolutif avec signaux mixtes sur les plans politique et socio-économique.",
            "important_dates": ["Révision semestrielle du risque", "Publication indicateurs macro"]
        })


REGISTRY = {
    "mock_macro": MockMacro,
    "mock_political": MockPolitical,
    "mock_security": MockSecurity,
    "mock_health": MockHealth,
    "mock_mobility": MockMobility,
    "mock_events": MockEvents,
}
