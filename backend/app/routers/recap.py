"""
POST /recap/generate — writes one short narrative paragraph from a week's
results, in the same house style the league's write-up already uses. It
sits above the league's own detailed stat sections (see
src/lib/recap-model.ts's "aiRecap" section) rather than replacing any of
them — this is the lede, not the box score.

Runs on Gemini (Google's Gemini API), not a paid model — the free tier's
per-minute/per-day quota is far more than a once-a-week, one-paragraph
feature will ever use, so this endpoint costs nothing to operate. See
https://ai.google.dev/gemini-api/docs/rate-limits for current limits.

get_gemini_client is a FastAPI dependency (not a module-level client)
specifically so tests can swap in a fake via app.dependency_overrides
instead of needing a real GEMINI_API_KEY — see tests/test_recap.py. This
is also the first thing in this service that needs a real secret, which
is why backend/k8s/ deliberately shipped without a Secret/ConfigMap until
now: there was nothing to put in one yet.
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from google import genai
from google.genai import errors, types

from ..models import RecapGenerateRequest, RecapGenerateResponse

router = APIRouter(prefix="/recap", tags=["recap"])

GEMINI_MODEL = "gemini-2.5-flash"


def get_gemini_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured on this server.")
    return genai.Client(api_key=api_key)


def _build_prompt(req: RecapGenerateRequest) -> tuple[str, str]:
    system = (
        f"You are ghostwriting one short paragraph (3-5 sentences) as {req.tone} "
        "for a fantasy football league's weekly recap. Use ONLY the real team "
        "names and scores given below - never invent a stat, a player, or a "
        "result you weren't given. This paragraph sits above the league's own "
        "detailed stat sections (standings, box scores) in the write-up, so "
        "tell the story of the week - don't just restate every score in order. "
        "Plain prose only: no headers, no bullet points, no markdown, no emoji."
    )
    lines = [f"League: {req.league_name}", f"Week: {req.week}", "", "Matchup results:"]
    lines += [f"- {m}" for m in req.matchups]
    if req.high_scorer:
        lines.append(f"\nHigh scorer: {req.high_scorer}")
    if req.standings_leader:
        lines.append(f"Standings leader: {req.standings_leader}")
    return system, "\n".join(lines)


@router.post("/generate", response_model=RecapGenerateResponse)
def generate_recap(
    req: RecapGenerateRequest,
    client: genai.Client = Depends(get_gemini_client),
) -> RecapGenerateResponse:
    system, user_content = _build_prompt(req)
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=1024,
            ),
        )
    except errors.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc.message}") from exc

    text = (response.text or "").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Gemini returned no text.")
    return RecapGenerateResponse(text=text)
