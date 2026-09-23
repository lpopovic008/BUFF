"""
/recap/generate calls Gemini's free tier — free in practice, but still an
external network call this suite shouldn't make on every push. That's why
get_gemini_client is a FastAPI dependency: app.dependency_overrides swaps
in a fake client below, so this suite (which runs on every push, per
.github/workflows/backend-ci.yml) never makes a real API call or needs a
real GEMINI_API_KEY. What it does cover: request validation, the
missing-key error path, and that a real client's response actually flows
through to the HTTP response correctly.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.routers.recap import get_gemini_client

client = TestClient(app)

VALID_REQUEST = {
    "league_name": "Test League",
    "week": 3,
    "matchups": ["Gary's Boys def. Danger Zone 128.4-101.2"],
    "high_scorer": "Gary's Boys' Josh Allen (34.5 pts)",
    "standings_leader": "Danger Zone (7-2)",
}


class _FakeModels:
    def __init__(self, text: str):
        self._text = text
        self.last_kwargs: dict | None = None

    def generate_content(self, **kwargs):
        self.last_kwargs = kwargs
        return _FakeResponse(self._text)


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text


class _FakeGeminiClient:
    def __init__(self, text: str = "It was a chaotic week at the top of the standings."):
        self.models = _FakeModels(text)


def test_generate_recap_without_api_key_returns_503(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    res = client.post("/recap/generate", json=VALID_REQUEST)
    assert res.status_code == 503


def test_generate_recap_rejects_empty_matchups():
    # Overridden so this fails on validation, not on a missing real API key
    # in whatever environment happens to run this suite.
    app.dependency_overrides[get_gemini_client] = lambda: _FakeGeminiClient()
    try:
        res = client.post("/recap/generate", json={**VALID_REQUEST, "matchups": []})
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_generate_recap_returns_the_mocked_clients_text():
    fake = _FakeGeminiClient("It was a chaotic week at the top of the standings.")
    app.dependency_overrides[get_gemini_client] = lambda: fake
    try:
        res = client.post("/recap/generate", json=VALID_REQUEST)
        assert res.status_code == 200
        assert res.json() == {"text": "It was a chaotic week at the top of the standings."}
    finally:
        app.dependency_overrides.clear()


def test_generate_recap_sends_the_facts_to_gemini():
    fake = _FakeGeminiClient("...")
    app.dependency_overrides[get_gemini_client] = lambda: fake
    try:
        client.post("/recap/generate", json=VALID_REQUEST)
        sent = fake.models.last_kwargs
        assert sent is not None
        assert sent["model"] == "gemini-2.5-flash"
        user_content = sent["contents"]
        assert "Gary's Boys def. Danger Zone 128.4-101.2" in user_content
        assert "Josh Allen" in user_content
        assert "Danger Zone (7-2)" in user_content
    finally:
        app.dependency_overrides.clear()


def test_generate_recap_502s_when_gemini_returns_no_text():
    fake = _FakeGeminiClient("")
    app.dependency_overrides[get_gemini_client] = lambda: fake
    try:
        res = client.post("/recap/generate", json=VALID_REQUEST)
        assert res.status_code == 502
    finally:
        app.dependency_overrides.clear()
