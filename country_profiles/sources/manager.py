from .mock_sources import REGISTRY


def fetch_by_category(country: dict, source_priority: dict) -> dict:
    out = {}
    for category, providers in source_priority.items():
        result = None
        for provider in providers:
            cls = REGISTRY.get(provider)
            if not cls:
                continue
            res = cls().fetch(country)
            if res.ok:
                result = res
                break
        out[category] = result.data if result else {}
    return out
