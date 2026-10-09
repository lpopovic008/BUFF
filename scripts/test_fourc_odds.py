"""Tests for fourc_odds.py (python3 -m unittest scripts/test_fourc_odds.py). No network."""

import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fourc_odds  # noqa: E402
from fourc_odds import allowed, board_path, find_records, flatten, parse_robots  # noqa: E402

# 4codds.com's robots.txt as served (October 2026), comments trimmed: a
# Cloudflare-managed "*" group, its AI-crawler groups, then the site's own.
ROBOTS = """
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /

User-agent: ClaudeBot
Disallow: /

User-agent: GPTBot
Disallow: /

# robots.txt for 4codds.com (RFC 9309).
User-agent: *
Allow: /api/v2/board/
Allow: /api/v2/meta
Disallow: /api/
Disallow: /go/

Sitemap: https://4codds.com/sitemap.xml
"""


class RobotsTest(unittest.TestCase):
    def setUp(self):
        self.rules = parse_robots(ROBOTS, "fourc-odds-script")

    def test_board_and_meta_are_open(self):
        for path in ["/api/v2/board/nfl", "/api/v2/board/nfl/spreads", "/api/v2/meta", "/api/v2/meta?x=1"]:
            self.assertTrue(allowed(self.rules, path), path)

    def test_the_rest_of_the_api_and_the_bounce_are_closed(self):
        for path in ["/api/", "/api/v2/odds", "/api/v1/board/nfl", "/go/pinnacle", "/go/"]:
            self.assertFalse(allowed(self.rules, path), path)

    def test_pages_are_open(self):
        self.assertTrue(allowed(self.rules, "/"))
        self.assertTrue(allowed(self.rules, "/nfl.html"))

    def test_a_named_group_replaces_the_star_groups(self):
        rules = parse_robots(ROBOTS, "ClaudeBot")
        self.assertFalse(allowed(rules, "/api/v2/board/nfl"))

    def test_wildcards_and_end_anchors(self):
        rules = parse_robots("User-agent: *\nDisallow: /*.json$\nAllow: /odds*live\n", "x")
        self.assertFalse(allowed(rules, "/a/b.json"))
        self.assertTrue(allowed(rules, "/a/b.json?x"))
        self.assertTrue(allowed(rules, "/odds/nfl/live"))


class RowsTest(unittest.TestCase):
    def test_the_longest_list_of_objects_is_the_board(self):
        data = {"meta": {"books": [{"id": 1}, {"id": 2}]}, "events": {"rows": [{"a": 1}, {"a": 2}, {"a": 3}]}}
        self.assertEqual(len(find_records(data)), 3)

    def test_nested_fields_flatten_to_dotted_columns(self):
        row = flatten({"game": "BUF @ MIA", "home": {"spread": -3.5, "ml": -170}, "books": ["a", "b"], "lines": [{"x": 1}]})
        self.assertEqual(row["home.spread"], -3.5)
        self.assertEqual(row["home.ml"], -170)
        self.assertEqual(row["books"], "a | b")
        self.assertEqual(row["lines"], '[{"x":1}]')

    def test_board_paths_are_escaped(self):
        self.assertEqual(board_path("/nfl/"), "/api/v2/board/nfl")
        self.assertEqual(board_path("nfl/week 5"), "/api/v2/board/nfl/week%205")


class FakeSite(BaseHTTPRequestHandler):
    """A stand-in for 4codds.com: its robots.txt, a meta, a board, a Cloudflare block, a 429 that clears."""

    hits: list = []
    throttled = {"left": 1}

    def log_message(self, *args):
        pass

    def _send(self, status, body, ctype="application/json", headers=None):
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        FakeSite.hits.append((self.path, self.headers.get("User-Agent")))
        if self.path == "/robots.txt":
            return self._send(200, ROBOTS, "text/plain")
        if self.path == "/api/v2/meta":
            return self._send(200, json.dumps({"boards": [{"path": "nfl", "name": "NFL"}]}))
        if self.path == "/api/v2/board/nfl":
            board = {"updated": 1, "events": [
                {"game": "BUF @ MIA", "spread": {"home": 3.5, "away": -3.5}, "total": 47.5},
                {"game": "KC @ LV", "spread": {"home": 9.5, "away": -9.5}, "total": 44},
            ]}
            return self._send(200, json.dumps(board))
        if self.path == "/api/v2/board/slow":
            if FakeSite.throttled["left"] > 0:
                FakeSite.throttled["left"] -= 1
                return self._send(429, "slow down", "text/plain", {"Retry-After": "1"})
            return self._send(200, json.dumps({"events": [{"a": 1}]}))
        if self.path == "/api/v2/board/blocked":
            return self._send(403, "<title>Attention Required! | Cloudflare</title>", "text/html")
        return self._send(404, "{}")


class EndToEndTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeSite)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.saved = (fourc_odds.BASE, fourc_odds.MIN_GAP_SECONDS)
        fourc_odds.BASE = f"http://127.0.0.1:{cls.server.server_address[1]}"
        fourc_odds.MIN_GAP_SECONDS = 0

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        fourc_odds.BASE, fourc_odds.MIN_GAP_SECONDS = cls.saved

    def setUp(self):
        FakeSite.hits.clear()
        self.dir = Path(tempfile.mkdtemp())

    def test_meta_then_board_to_json_and_csv(self):
        self.assertEqual(fourc_odds.main(["meta", "--out", str(self.dir / "meta.json")]), 0)
        self.assertEqual(json.loads((self.dir / "meta.json").read_text())["boards"][0]["path"], "nfl")
        code = fourc_odds.main(["board", "nfl", "--out", str(self.dir / "nfl.json"), "--csv", str(self.dir / "nfl.csv")])
        self.assertEqual(code, 0)
        lines = (self.dir / "nfl.csv").read_text().splitlines()
        self.assertEqual(lines[0], "game,spread.home,spread.away,total")
        self.assertEqual(lines[1], "BUF @ MIA,3.5,-3.5,47.5")
        # Every request said who it was.
        self.assertTrue(all(ua == fourc_odds.USER_AGENT for _, ua in FakeSite.hits))

    def test_paths_robots_closes_are_never_requested(self):
        client = fourc_odds.Client()
        with self.assertRaises(fourc_odds.NotAllowed):
            client.get_json("/api/v2/odds")
        self.assertNotIn("/api/v2/odds", [p for p, _ in FakeSite.hits])

    def test_a_cloudflare_block_stops_it(self):
        self.assertEqual(fourc_odds.main(["board", "blocked", "--out", str(self.dir / "b.json")]), 2)
        self.assertFalse((self.dir / "b.json").exists())
        # Asked once, not hammered.
        self.assertEqual([p for p, _ in FakeSite.hits].count("/api/v2/board/blocked"), 1)

    def test_a_429_waits_and_tries_again(self):
        self.assertEqual(fourc_odds.main(["board", "slow", "--out", str(self.dir / "s.json")]), 0)
        self.assertEqual([p for p, _ in FakeSite.hits].count("/api/v2/board/slow"), 2)


if __name__ == "__main__":
    unittest.main()
