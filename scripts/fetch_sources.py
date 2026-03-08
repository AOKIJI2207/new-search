#!/usr/bin/env python3
"""Robust external source fetcher with retries, backoff and response validation."""

from __future__ import annotations

import argparse
import json
import logging
import random
import re
import socket
import time
from dataclasses import dataclass
from html import unescape
from typing import Any
from urllib import error, request


MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 0.5
DEFAULT_TIMEOUT_SECONDS = 10
RATE_LIMIT_WAIT_SECONDS = 2
USER_AGENT = "agoraflux-fetcher/1.0"


logger = logging.getLogger("source_fetcher")


class InvalidContentError(Exception):
    """Raised when content is empty or unusable."""


@dataclass
class FetchAttempt:
    url: str
    status: str
    http_status: int | None
    response_time_ms: int
    data: Any | None
    error: str | None
    attempts: int


# ---------------------------------------------------------------------------
# Parsing / validation
# ---------------------------------------------------------------------------
def _strip_html(html_text: str) -> str:
    """Very small HTML-to-text helper for validity checks."""
    without_scripts = re.sub(r"<script[\s\S]*?</script>", " ", html_text, flags=re.IGNORECASE)
    without_styles = re.sub(r"<style[\s\S]*?</style>", " ", without_scripts, flags=re.IGNORECASE)
    no_tags = re.sub(r"<[^>]+>", " ", without_styles)
    clean = unescape(no_tags)
    return re.sub(r"\s+", " ", clean).strip()


def parse_response(response: dict[str, Any]) -> dict[str, Any]:
    """
    Validate and structure payload.

    Returns a dict with:
      - content_type
      - parsed (json/html/text)
      - data

    Raises InvalidContentError if response is empty/invalid.
    """
    body: bytes = response.get("body", b"")
    content_type = (response.get("content_type") or "").lower()

    if not body or len(body.strip()) == 0:
        raise InvalidContentError("Contenu vide")

    text = body.decode("utf-8", errors="replace").strip()
    if not text:
        raise InvalidContentError("Contenu vide après décodage")

    if "json" in content_type or text.startswith("{") or text.startswith("["):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise InvalidContentError(f"JSON mal formé: {exc}") from exc

        if data is None:
            raise InvalidContentError("JSON nul")
        if isinstance(data, (list, dict)) and len(data) == 0:
            raise InvalidContentError("JSON vide")

        return {"content_type": content_type, "parsed": "json", "data": data}

    if "html" in content_type or "<html" in text.lower() or "<body" in text.lower():
        visible_text = _strip_html(text)
        if len(visible_text) < 20:
            raise InvalidContentError("HTML sans données utiles")
        return {"content_type": content_type, "parsed": "html", "data": text}

    if len(text) < 5:
        raise InvalidContentError("Texte trop court / invalide")

    return {"content_type": content_type, "parsed": "text", "data": text}


# ---------------------------------------------------------------------------
# Fetch logic with retries
# ---------------------------------------------------------------------------
def _backoff_sleep(attempt: int) -> None:
    """Exponential backoff with small jitter."""
    delay = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
    delay += random.uniform(0.0, 0.2)
    time.sleep(delay)


def fetch_url(url: str, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """
    Fetch one URL with retry/backoff and explicit HTTP handling.

    Returns structured status for one source:
      - status: OK | Timeout | Erreur HTTP | Contenu invalide
      - response_time_ms
      - http_status
      - data (parsed) or error message
      - attempts
    """
    req = request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error = "Erreur inconnue"
    total_start = time.perf_counter()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            start = time.perf_counter()
            with request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                http_status = getattr(resp, "status", None)
                parsed = parse_response(
                    {
                        "body": body,
                        "content_type": resp.headers.get("Content-Type", ""),
                        "url": url,
                    }
                )
                return {
                    "url": url,
                    "status": "OK",
                    "http_status": http_status,
                    "response_time_ms": elapsed_ms,
                    "attempts": attempt,
                    "data": parsed,
                    "error": None,
                }

        except InvalidContentError as exc:
            elapsed_ms = int((time.perf_counter() - total_start) * 1000)
            last_error = str(exc)
            logger.warning("%s -> Contenu invalide: %s", url, last_error)
            return {
                "url": url,
                "status": "Contenu invalide",
                "http_status": None,
                "response_time_ms": elapsed_ms,
                "attempts": attempt,
                "data": None,
                "error": last_error,
            }

        except error.HTTPError as exc:
            http_code = exc.code
            last_error = f"HTTP {http_code}: {exc.reason}"

            if http_code == 403:
                logger.error("%s -> accès interdit (403)", url)
                return {
                    "url": url,
                    "status": "Erreur HTTP",
                    "http_status": 403,
                    "response_time_ms": int((time.perf_counter() - total_start) * 1000),
                    "attempts": attempt,
                    "data": None,
                    "error": "accès interdit",
                }

            if http_code == 404:
                logger.error("%s -> source inexistante (404)", url)
                return {
                    "url": url,
                    "status": "Erreur HTTP",
                    "http_status": 404,
                    "response_time_ms": int((time.perf_counter() - total_start) * 1000),
                    "attempts": attempt,
                    "data": None,
                    "error": "source inexistante",
                }

            if http_code == 429:
                logger.warning("%s -> HTTP 429, pause %ss puis retry", url, RATE_LIMIT_WAIT_SECONDS)
                if attempt < MAX_RETRIES:
                    time.sleep(RATE_LIMIT_WAIT_SECONDS)
                    continue

            if http_code >= 500 and attempt < MAX_RETRIES:
                logger.warning("%s -> HTTP %s, retry avec backoff (essai %s/%s)", url, http_code, attempt, MAX_RETRIES)
                _backoff_sleep(attempt)
                continue

            return {
                "url": url,
                "status": "Erreur HTTP",
                "http_status": http_code,
                "response_time_ms": int((time.perf_counter() - total_start) * 1000),
                "attempts": attempt,
                "data": None,
                "error": last_error,
            }

        except (error.URLError, TimeoutError, socket.timeout) as exc:
            last_error = f"Erreur réseau/timeout: {exc}"
            logger.warning("%s -> %s (essai %s/%s)", url, last_error, attempt, MAX_RETRIES)
            if attempt < MAX_RETRIES:
                _backoff_sleep(attempt)
                continue
            return {
                "url": url,
                "status": "Timeout",
                "http_status": None,
                "response_time_ms": int((time.perf_counter() - total_start) * 1000),
                "attempts": attempt,
                "data": None,
                "error": last_error,
            }

        except Exception as exc:  # noqa: BLE001
            last_error = f"Erreur inattendue: {exc}"
            logger.exception("%s -> exception inattendue", url)
            if attempt < MAX_RETRIES:
                _backoff_sleep(attempt)
                continue
            return {
                "url": url,
                "status": "Erreur HTTP",
                "http_status": None,
                "response_time_ms": int((time.perf_counter() - total_start) * 1000),
                "attempts": attempt,
                "data": None,
                "error": last_error,
            }

    return {
        "url": url,
        "status": "Erreur HTTP",
        "http_status": None,
        "response_time_ms": int((time.perf_counter() - total_start) * 1000),
        "attempts": MAX_RETRIES,
        "data": None,
        "error": last_error,
    }


def main(list_of_sources: list[str]) -> list[dict[str, Any]]:
    """Execute fetch_url for each source and return a structured array."""
    results: list[dict[str, Any]] = []
    for source_url in list_of_sources:
        try:
            result = fetch_url(source_url)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Erreur non gérée pour %s", source_url)
            result = {
                "url": source_url,
                "status": "Erreur HTTP",
                "http_status": None,
                "response_time_ms": 0,
                "attempts": 0,
                "data": None,
                "error": str(exc),
            }
        results.append(result)
    return results




def monitoring_recommendations() -> dict[str, Any]:
    """Operational recommendations to monitor failures and rate limits."""
    return {
        "metrics": [
            "success_rate_by_source",
            "http_error_rate_by_code",
            "timeout_rate",
            "invalid_content_rate",
            "p95_response_time_ms",
            "retry_count_distribution",
            "429_events_per_source",
        ],
        "alerts": [
            "success_rate_by_source < 80% sur 15 minutes",
            "hausse des 429 (> 5/min/source)",
            "p95_response_time_ms > 5000",
            "timeout_rate > 20%",
        ],
        "logs": [
            "log structuré par URL/attempt/http_status",
            "corrélation request_id par batch",
            "journaliser payload_size et content_type",
            "journaliser la raison de validation invalide",
        ],
    }

def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fetch external sources with retries and validation")
    parser.add_argument("sources", nargs="*", help="List of URLs to fetch")
    parser.add_argument("--file", help="Path to JSON file containing a list of URLs")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="Request timeout in seconds")
    parser.add_argument("--log-level", default="INFO", help="Logging level: DEBUG|INFO|WARNING|ERROR")
    parser.add_argument("--print-recommendations", action="store_true", help="Print monitoring recommendations and exit")
    return parser


def _load_sources(args: argparse.Namespace) -> list[str]:
    urls: list[str] = list(args.sources)
    if args.file:
        with open(args.file, encoding="utf-8") as f:
            content = json.load(f)
        if not isinstance(content, list):
            raise ValueError("Le fichier JSON doit contenir une liste d'URLs")
        urls.extend(str(item) for item in content)
    deduped = []
    seen = set()
    for u in urls:
        u = u.strip()
        if not u or u in seen:
            continue
        seen.add(u)
        deduped.append(u)
    return deduped


if __name__ == "__main__":
    args = _build_arg_parser().parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(message)s",
    )

    if args.print_recommendations:
        print(json.dumps(monitoring_recommendations(), ensure_ascii=False, indent=2))
        raise SystemExit(0)

    sources = _load_sources(args)
    if not sources:
        raise SystemExit("Aucune source fournie. Exemple: python scripts/fetch_sources.py https://example.com/feed")

    results = main(sources)
    print(json.dumps(results, ensure_ascii=False, indent=2))
