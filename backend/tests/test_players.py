"""
pytest + FastAPI's TestClient — this drives the app in-process (no real
network socket, no server to start/stop), which is what makes these fast
enough to run on every commit. Run with:

    pytest

from the backend/ directory.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_player_values_default_params():
    res = client.get("/players/values")
    assert res.status_code == 200
    body = res.json()
    assert body["list_type"] == "dynasty"
    assert body["format"] == "oneQB"
    assert body["tep"] == "standard"
    assert body["count"] > 0
    assert body["count"] == len(body["players"])
    # scripts/fetch-player-values.ts sorts dynasty by oneQBStandard descending,
    # which is exactly the default format/tep this request asks for.
    values = [p["value"] for p in body["players"]]
    assert values == sorted(values, reverse=True)


def test_player_values_rejects_an_invalid_enum_query_param():
    res = client.get("/players/values", params={"list_type": "not-a-real-list-type"})
    assert res.status_code == 422


def test_player_values_position_filter_only_returns_that_position():
    res = client.get("/players/values", params={"position": "WR", "limit": 10})
    assert res.status_code == 200
    body = res.json()
    assert body["count"] > 0
    assert all(p["position"] == "WR" for p in body["players"])


def test_player_values_limit_is_enforced():
    res = client.get("/players/values", params={"limit": 5})
    assert res.status_code == 200
    assert res.json()["count"] <= 5


def test_player_stats_min_games_filter():
    res = client.get("/players/stats", params={"min_games": 1})
    assert res.status_code == 200
    body = res.json()
    assert all(p["games_played"] >= 1 for p in body["players"])


def test_player_stats_ppg_matches_pts_over_games():
    res = client.get("/players/stats", params={"min_games": 1, "limit": 1})
    assert res.status_code == 200
    body = res.json()
    if body["players"]:
        p = body["players"][0]
        assert p["ppg_ppr"] == round(p["pts_ppr"] / p["games_played"], 2)
