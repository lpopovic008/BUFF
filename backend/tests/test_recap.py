"""
/recap/generate is the one endpoint here that costs real money per call — an
actual Claude API request. That's exactly why get_anthropic_client is a
FastAPI dependency: app.dependency_overrides swaps in a fake client below,
so this suite (which runs on every push, per .github/workflows/backend-ci.yml)
never makes a real API call or needs a real ANTHROPIC_API_KEY. What it does
cover: request validation, the missing-key error path, and that a real
client's response actually flows through to the HTTP response correctly.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.routers.recap import get_anthropic_client

client = TestClient(app)

VALID_REQUEST = {
    "league_name": "Test League",
    "week": 3,
    "matchups": ["Gary's Boys def. Danger Zone 128.4-101.2"],
    "high_scorer": "Gary's Boys' Josh Allen (34.5 pts)",
    "standings_leader": "Danger Zone (7-2)",
}


class _FakeTextBlock:
    type = "text"

    def __init__(self, text: str):
        self.text = text


class _FakeMessage:
    def __init__(self, text: str):
        self.content = [_FakeTextBlock(text)]


class _FakeMessages:
    def __init__(self, text: str):
        self._text = text
        self.last_kwargs: dict | None = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        return _FakeMessage(self._text)


class _FakeAnthropicClient:
    def __init__(self, text: str = "It was a chaotic week at the top of the standings."):
        self.messages = _FakeMessages(text)


def test_generate_recap_without_api_key_returns_503(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    res = client.post("/recap/generate", json=VALID_REQUEST)
    assert res.status_code == 503


def test_generate_recap_rejects_empty_matchups():
    # Overridden so this fails on validation, not on a missing real API key
    # in whatever environment happens to run this suite.
    app.dependency_overrides[get_anthropic_client] = lambda: _FakeAnthropicClient()
    try:
        res = client.post("/recap/generate", json={**VALID_REQUEST, "matchups": []})
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_generate_recap_returns_the_mocked_clients_text():
    fake = _FakeAnthropicClient("It was a chaotic week at the top of the standings.")
    app.dependency_overrides[get_anthropic_client] = lambda: fake
    try:
        res = client.post("/recap/generate", json=VALID_REQUEST)
        assert res.status_code == 200
        assert res.json() == {"text": "It was a chaotic week at the top of the standings."}
    finally:
        app.dependency_overrides.clear()


def test_generate_recap_sends_the_facts_to_claude():
    fake = _FakeAnthropicClient("...")
    app.dependency_overrides[get_anthropic_client] = lambda: fake
    try:
        client.post("/recap/generate", json=VALID_REQUEST)
        sent = fake.messages.last_kwargs
        assert sent is not None
        assert sent["model"] == "claude-opus-5"
        user_content = sent["messages"][0]["content"]
        assert "Gary's Boys def. Danger Zone 128.4-101.2" in user_content
        assert "Josh Allen" in user_content
        assert "Danger Zone (7-2)" in user_content
    finally:
        app.dependency_overrides.clear()


def test_generate_recap_502s_when_claude_returns_no_text():
    fake = _FakeAnthropicClient("")
    fake.messages._text = ""
    app.dependency_overrides[get_anthropic_client] = lambda: fake
    try:
        res = client.post("/recap/generate", json=VALID_REQUEST)
        assert res.status_code == 502
    finally:
        app.dependency_overrides.clear()
