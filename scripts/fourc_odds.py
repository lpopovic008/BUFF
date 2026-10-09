#!/usr/bin/env python3
"""Fetch odds and lines from 4codds.com's board data.

4codds.com builds each odds board in the browser from two JSON endpoints, and
its robots.txt opens exactly those two to automated readers while keeping the
rest of its API closed:

    Allow: /api/v2/board/
    Allow: /api/v2/meta
    Disallow: /api/
    Disallow: /go/

This script reads only what robots.txt allows (it checks before every
request and refuses anything else), says who it is, waits between requests,
and backs off when asked to. It doesn't try to get past the site's bot
protection: if Cloudflare blocks the request it says so and stops. The site
blocks data-centre addresses outright, so run it from your own connection.

Read https://4codds.com/terms.html before using the data for anything beyond
your own use; the site says those terms bind people who use it.

Standard library only (Python 3.9+).

    python3 scripts/fourc_odds.py meta                  # what boards exist
    python3 scripts/fourc_odds.py board nfl             # one board, as JSON
    python3 scripts/fourc_odds.py board nfl --csv nfl.csv
    python3 scripts/fourc_odds.py board nfl --every 300 --csv nfl.csv   # refresh every 5 min

Run `meta` first: it saves the site's own description of its boards, which
names the paths `board` takes. The board's exact shape isn't documented, so
`--csv` writes whatever rows the board holds, one per record, with nested
fields flattened to dotted column names (e.g. "home.spread").
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://4codds.com"
USER_AGENT = "fourc-odds-script/1.0 (personal use; reads only what robots.txt allows)"
# The product token robots.txt groups are matched against.
ROBOTS_TOKEN = "fourc-odds-script"
# The least time between two requests, and the shortest refresh interval.
MIN_GAP_SECONDS = 2.0
MIN_EVERY_SECONDS = 60
TIMEOUT_SECONDS = 30
MAX_RETRIES = 3


class Blocked(Exception):
    """The site's bot protection turned the request away."""


class NotAllowed(Exception):
    """robots.txt doesn't allow the path."""


# ---- robots.txt (RFC 9309) ---------------------------------------------------


def parse_robots(text: str, token: str) -> list[tuple[bool, str]]:
    """The (allow, path) rules that apply to `token`: those of the groups naming
    it, else of every "*" group (RFC 9309 merges groups with the same name)."""
    groups: list[tuple[list[str], list[tuple[bool, str]]]] = []
    agents: list[str] = []
    rules: list[tuple[bool, str]] = []
    in_rules = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if in_rules:
                groups.append((agents, rules))
                agents, rules, in_rules = [], [], False
            agents.append(value.lower())
        elif key in ("allow", "disallow"):
            in_rules = True
            if value:
                rules.append((key == "allow", value))
    if agents:
        groups.append((agents, rules))
    named = [r for a, r in groups if token.lower() in a]
    chosen = named or [r for a, r in groups if "*" in a]
    return [rule for group in chosen for rule in group]


def _matches(pattern: str, path: str) -> bool:
    """RFC 9309 path matching: a prefix match, with * for any run of characters and $ for the end."""
    anchored = pattern.endswith("$")
    parts = (pattern[:-1] if anchored else pattern).split("*")
    if not path.startswith(parts[0]):
        return False
    pos = len(parts[0])
    for part in parts[1:]:
        found = path.find(part, pos)
        if found < 0:
            return False
        pos = found + len(part)
    return not anchored or pos == len(path) or (len(parts) > 1 and path.endswith(parts[-1]))


def allowed(rules: list[tuple[bool, str]], path: str) -> bool:
    """Whether `path` may be fetched: the longest matching rule decides, Allow winning a tie; no match allows it."""
    best: tuple[int, bool] | None = None
    for allow, pattern in rules:
        if _matches(pattern, path):
            length = len(pattern)
            if best is None or length > best[0] or (length == best[0] and allow):
                best = (length, allow)
    return True if best is None else best[1]


# ---- Fetching ----------------------------------------------------------------


class Client:
    def __init__(self) -> None:
        self._last = 0.0
        self._rules: list[tuple[bool, str]] | None = None

    def _wait(self) -> None:
        gap = time.monotonic() - self._last
        if gap < MIN_GAP_SECONDS:
            time.sleep(MIN_GAP_SECONDS - gap)
        self._last = time.monotonic()

    def _get(self, path: str) -> tuple[int, str]:
        request = urllib.request.Request(
            BASE + path, headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/plain;q=0.9"}
        )
        for attempt in range(MAX_RETRIES + 1):
            self._wait()
            try:
                with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                    return response.status, response.read().decode("utf-8", "replace")
            except urllib.error.HTTPError as error:
                body = error.read().decode("utf-8", "replace")
                if error.code == 403 and "cloudflare" in body.lower():
                    raise Blocked(
                        f"4codds.com's bot protection blocked {path} (HTTP 403 from Cloudflare). "
                        "It blocks data-centre and VPN addresses; run this from your own connection. "
                        "If it still blocks you, the site doesn't want automated access from you, so stop there."
                    ) from None
                retryable = error.code == 429 or error.code >= 500
                if not retryable or attempt == MAX_RETRIES:
                    return error.code, body
                retry_after = error.headers.get("Retry-After", "")
                time.sleep(int(retry_after) if retry_after.isdigit() else 2 ** (attempt + 2))
            except urllib.error.URLError as error:
                if attempt == MAX_RETRIES:
                    raise
                print(f"  network error ({error.reason}); retrying", file=sys.stderr)
                time.sleep(2 ** (attempt + 2))
        raise RuntimeError("unreachable")

    def robots(self) -> list[tuple[bool, str]]:
        if self._rules is None:
            status, text = self._get("/robots.txt")
            if status != 200:
                raise SystemExit(f"Couldn't read robots.txt (HTTP {status}); not fetching anything without it.")
            self._rules = parse_robots(text, ROBOTS_TOKEN)
        return self._rules

    def get_json(self, path: str):
        if not allowed(self.robots(), path):
            raise NotAllowed(f"robots.txt doesn't allow {path}; this script only reads what it allows.")
        status, body = self._get(path)
        if status != 200:
            raise SystemExit(f"{path}: HTTP {status}\n{body[:500]}")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            raise SystemExit(f"{path}: expected JSON, got:\n{body[:500]}") from None


# ---- Turning a board into rows -----------------------------------------------


def find_records(data) -> list[dict]:
    """The board's records: the longest list of objects anywhere in the JSON."""
    best: list[dict] = []

    def walk(node) -> None:
        nonlocal best
        if isinstance(node, list):
            if node and all(isinstance(item, dict) for item in node) and len(node) > len(best):
                best = node
            for item in node:
                walk(item)
        elif isinstance(node, dict):
            for value in node.values():
                walk(value)

    walk(data)
    return best


def flatten(record: dict, prefix: str = "") -> dict:
    """One row: nested objects become dotted columns; lists of plain values are joined with " | "."""
    row: dict = {}
    for key, value in record.items():
        name = f"{prefix}{key}"
        if isinstance(value, dict):
            row.update(flatten(value, f"{name}."))
        elif isinstance(value, list):
            if all(not isinstance(v, (dict, list)) for v in value):
                row[name] = " | ".join(str(v) for v in value)
            else:
                row[name] = json.dumps(value, separators=(",", ":"))
        else:
            row[name] = value
    return row


def write_csv(rows: list[dict], path: Path) -> None:
    columns: list[str] = []
    for row in rows:
        for column in row:
            if column not in columns:
                columns.append(column)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


# ---- Commands ----------------------------------------------------------------


def board_path(board: str) -> str:
    cleaned = "/".join(urllib.parse.quote(part) for part in board.strip("/").split("/") if part)
    return f"/api/v2/board/{cleaned}"


def save_json(data, path: Path) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def run_meta(client: Client, out: Path) -> None:
    data = client.get_json("/api/v2/meta")
    save_json(data, out)
    print(f"Saved the site's board list to {out}")
    if isinstance(data, dict):
        for key, value in data.items():
            size = f" ({len(value)} items)" if isinstance(value, (list, dict)) else ""
            print(f"  {key}{size}")


def run_board(client: Client, board: str, out: Path, csv_path: Path | None) -> None:
    data = client.get_json(board_path(board))
    save_json(data, out)
    rows = [flatten(record) for record in find_records(data)]
    print(f"{time.strftime('%H:%M:%S')}  {board}: {len(rows)} records, saved to {out}")
    if csv_path is not None:
        if rows:
            write_csv(rows, csv_path)
            print(f"  and to {csv_path}")
        else:
            print("  no list of records found to turn into rows; see the JSON")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch odds and lines from 4codds.com's board data.")
    commands = parser.add_subparsers(dest="command", required=True)
    meta = commands.add_parser("meta", help="save the site's list of boards (run this first)")
    meta.add_argument("--out", type=Path, default=Path("4codds-meta.json"))
    board = commands.add_parser("board", help="save one board's odds")
    board.add_argument("board", help="the board's path, as named in the meta output (e.g. nfl)")
    board.add_argument("--out", type=Path, help="where to save the JSON (default 4codds-<board>.json)")
    board.add_argument("--csv", type=Path, help="also save the board's records as CSV")
    board.add_argument("--every", type=int, help=f"keep refreshing every N seconds (at least {MIN_EVERY_SECONDS})")
    args = parser.parse_args(argv)

    client = Client()
    try:
        if args.command == "meta":
            run_meta(client, args.out)
            return 0
        out = args.out or Path(f"4codds-{args.board.strip('/').replace('/', '-')}.json")
        if args.every is None:
            run_board(client, args.board, out, args.csv)
            return 0
        every = max(MIN_EVERY_SECONDS, args.every)
        if every != args.every:
            print(f"Refreshing every {every}s, the shortest this script allows.")
        while True:
            run_board(client, args.board, out, args.csv)
            time.sleep(every)
    except (Blocked, NotAllowed) as error:
        print(error, file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
