# BUFF API

A small FastAPI service that serves BUFF's player-values and player-stats
snapshots live over HTTP, instead of only as build-time JSON baked into the
static frontend. It reads the exact same files the Next.js site reads
(`../src/data/player-values.json`, `../src/data/player-stats.json`) — the
Node scripts under `scripts/` still own fetching and normalizing that data
from Sleeper/KeepTradeCut, so the site and the API can never disagree.

## Why this exists

The rest of BUFF is a static export with no server at all. This is the
first piece of it that runs as an actual backend — the starting point for
learning FastAPI, Docker, and Kubernetes on a project with real (if small)
data behind it, rather than a tutorial's placeholder API.

## Endpoints

- `GET /health` — liveness check
- `GET /players/values?list_type=dynasty|fantasy&format=oneQB|superflex&tep=standard|tep&position=WR&limit=500`
- `GET /players/stats?position=WR&min_games=0&limit=1000`
- `POST /recap/generate` — ghostwrites one short paragraph for the weekly
  recap from facts the frontend already computed (team names, scores, high
  scorer, standings leader). Requires `ANTHROPIC_API_KEY` to be set in the
  server's environment; returns `503` if it isn't. See
  `app/routers/recap.py` for the request/response shape.

Full interactive docs (auto-generated from the Pydantic models) are at
`/docs` once the server is running.

## Run it locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export ANTHROPIC_API_KEY=sk-ant-...   # only needed for /recap/generate
uvicorn app.main:app --reload --port 8000
# then: curl http://localhost:8000/health
```

## Run the tests

```bash
cd backend
source .venv/bin/activate
pytest -v
```

## Layout

```
backend/
  app/
    main.py           FastAPI app, CORS, /health
    models.py         Pydantic request/response schemas
    data.py            Loads the JSON snapshots from src/data/
    routers/
      players.py       /players/values, /players/stats
      recap.py         /recap/generate (calls the Claude API)
  tests/
    test_players.py   pytest + FastAPI's TestClient
    test_recap.py     mocks the Anthropic client, never calls the real API
  requirements.txt
```
