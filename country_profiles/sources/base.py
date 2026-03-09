from dataclasses import dataclass


@dataclass
class SourceResult:
    category: str
    provider: str
    data: dict
    ok: bool = True
    error: str | None = None


class BaseSource:
    name = "base"
    category = "generic"

    def fetch(self, country: dict) -> SourceResult:
        raise NotImplementedError
