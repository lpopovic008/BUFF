"""
The FastAPI application object. Run locally with:

    uvicorn app.main:app --reload --port 8000

then visit http://localhost:8000/docs — FastAPI builds that page
automatically from the Pydantic models and route definitions, nothing
written by hand.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import players, recap

app = FastAPI(
    title="BUFF API",
    description=(
        "Serves the same player-values and player-stats snapshots the BUFF "
        "dashboard's frontend reads at build time, live over HTTP instead, "
        "plus a POST endpoint that ghostwrites a weekly recap paragraph."
    ),
    version="0.1.0",
)

# The deployed frontend (lpopovic008.github.io) and a local `next dev`
# server are different origins than this API, so without CORS headers the
# browser blocks the response before frontend code ever sees it — this is
# the browser's own same-origin policy, not something this API chooses.
# POST is only needed for /recap/generate; every other route is read-only GET.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://lpopovic008.github.io",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(players.router)
app.include_router(recap.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Cheap liveness check — this is what a Kubernetes readiness/liveness
    probe (added in a later step) will actually hit."""
    return {"status": "ok"}
