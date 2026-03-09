from pathlib import Path
from .utils.io import read_json


def load_config(config_path: str = "country_profiles/config/defaults.json") -> dict:
    cfg = read_json(config_path, default={})
    cfg["root"] = str(Path(".").resolve())
    return cfg
