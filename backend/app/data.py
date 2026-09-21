"""
Loads the same JSON snapshots the Next.js frontend already reads at build
time (src/data/player-values.json, src/data/player-stats.json). The Node
scripts under scripts/ still own fetching and normalizing that data — this
API is a read layer on top, not a second scraper. That keeps the site and
the API always agreeing with each other, since they're reading the exact
same file.

Deliberately re-reads the file on every call instead of caching in memory:
these files are small (well under a megabyte) and only change once a day,
so the disk read is not a real cost, and "always correct" beats "fast but
possibly stale" for a service this size. Worth revisiting if this ever
needs to serve real traffic.
"""

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "src" / "data"


class DataUnavailableError(RuntimeError):
    """Raised when a snapshot file is missing or isn't valid JSON. The
    router layer turns this into an HTTP response — this module doesn't
    know anything about HTTP, on purpose."""


def _load_json(filename: str) -> dict[str, Any]:
    path = DATA_DIR / filename
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise DataUnavailableError(f"Couldn't read {filename}: {exc}") from exc


def load_player_values() -> dict[str, Any]:
    return _load_json("player-values.json")


def load_player_stats() -> dict[str, Any]:
    return _load_json("player-stats.json")
