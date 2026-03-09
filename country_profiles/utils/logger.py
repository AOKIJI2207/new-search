from pathlib import Path
from .io import ensure_dir, utc_now


def log_message(log_dir: str, message: str) -> None:
    ensure_dir(log_dir)
    line = f"[{utc_now()}] {message}\n"
    Path(log_dir, "pipeline.log").write_text(
        Path(log_dir, "pipeline.log").read_text(encoding="utf-8") + line if Path(log_dir, "pipeline.log").exists() else line,
        encoding="utf-8",
    )
