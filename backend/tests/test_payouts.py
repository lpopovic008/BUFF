"""
/payouts/parse calls Gemini; like test_recap.py, a fake client stands in so
this suite never makes a real API call. Covered: validation, the
missing-key path, the prompt carrying the league's facts, structured
output flowing through, and out-of-range values being clamped.
"""

import json

from fastapi.testclient import TestClient

from app.main import app
from app.routers.recap import get_gemini_client

client = TestClient(app)

REQUEST = {
    "description": "$100 buy in. $10 a win, high scorer gets $20 instead. Champ gets half, 2nd gets the rest.",
    "team_count": 10,
    "regular_season_weeks": 14,
    "last_week": 17,
    "playoff_teams": 6,
    "managers": [{"roster_id": 1, "name": "manager_one"}, {"roster_id": 2, "name": "manager_two"}],
}

ANSWER = {
    "notes": ["$100 buy-in, a $1,000 pot.", "$20 to the week's high scorer, $10 to every other winner."],
    "buy_in": 100,
    "buy_in_overrides": [{"roster_id": 99, "amount": 50}],
    "rules": [
        {"award": "weekHighScore", "rank_mode": "place", "rank_n": 1, "amount_kind": "dollars", "amount": 20,
         "from_week": 1, "to_week": 14, "ties": "split", "skip_if_paid": False},
        {"award": "matchupWinner", "rank_mode": "place", "rank_n": 1, "amount_kind": "dollars", "amount": 10,
         "from_week": 0, "to_week": 40, "ties": "each", "skip_if_paid": True},
        {"award": "finalPlace", "rank_mode": "place", "rank_n": 1, "amount_kind": "percent", "amount": 50,
         "from_week": 1, "to_week": 14, "ties": "split", "skip_if_paid": False},
        {"award": "finalPlace", "rank_mode": "place", "rank_n": 2, "amount_kind": "remainder", "amount": 0,
         "from_week": 1, "to_week": 14, "ties": "split", "skip_if_paid": False},
    ],
    "unsupported": [],
    "questions": [],
}


class _FakeModels:
    def __init__(self, text: str):
        self._text = text
        self.last_kwargs: dict | None = None

    def generate_content(self, **kwargs):
        self.last_kwargs = kwargs
        return type("R", (), {"text": self._text, "parsed": None})()


class _FakeClient:
    def __init__(self, text: str):
        self.models = _FakeModels(text)


def test_parse_without_api_key_returns_503(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert client.post("/payouts/parse", json=REQUEST).status_code == 503


def test_parse_rejects_an_empty_description():
    app.dependency_overrides[get_gemini_client] = lambda: _FakeClient(json.dumps(ANSWER))
    try:
        assert client.post("/payouts/parse", json={**REQUEST, "description": ""}).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_parse_returns_rules_and_clamps_them_to_the_league():
    fake = _FakeClient(json.dumps(ANSWER))
    app.dependency_overrides[get_gemini_client] = lambda: fake
    try:
        res = client.post("/payouts/parse", json=REQUEST)
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    body = res.json()
    assert body["buy_in"] == 100
    assert [r["award"] for r in body["rules"]] == ["weekHighScore", "matchupWinner", "finalPlace", "finalPlace"]
    # Weeks clamped into the season; an unknown manager's override dropped.
    assert body["rules"][1]["from_week"] == 1 and body["rules"][1]["to_week"] == 17
    assert body["buy_in_overrides"] == []
    # The prompt carries the league's facts and the description; the schema is enforced.
    prompt = fake.models.last_kwargs["contents"]
    assert "Teams: 10" in prompt and "1: manager_one" in prompt and "high scorer gets $20 instead" in prompt
    assert fake.models.last_kwargs["config"].response_mime_type == "application/json"


def test_parse_reports_an_unreadable_answer():
    app.dependency_overrides[get_gemini_client] = lambda: _FakeClient("not json")
    try:
        assert client.post("/payouts/parse", json=REQUEST).status_code == 502
    finally:
        app.dependency_overrides.clear()
