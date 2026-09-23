"""
POST /recap/generate — writes one short narrative paragraph from a week's
results, in the same house style the league's write-up already uses. It
sits above the league's own detailed stat sections (see
src/lib/recap-model.ts's new "aiRecap" section) rather than replacing any
of them — this is the lede, not the box score.

get_anthropic_client is a FastAPI dependency (not a module-level client)
specifically so tests can swap in a fake via app.dependency_overrides
instead of needing a real ANTHROPIC_API_KEY or spending real API credits —
see tests/test_recap.py. This is also the first thing in this service that
needs a real secret, which is why backend/k8s/ deliberately shipped without
a Secret/ConfigMap until now: there was nothing to put in one yet.
"""

import os

import anthropic
from fastapi import APIRouter, Depends, HTTPException

from ..models import RecapGenerateRequest, RecapGenerateResponse

router = APIRouter(prefix="/recap", tags=["recap"])


def get_anthropic_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured on this server.")
    return anthropic.Anthropic(api_key=api_key)


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
    client: anthropic.Anthropic = Depends(get_anthropic_client),
) -> RecapGenerateResponse:
    system, user_content = _build_prompt(req)
    try:
        response = client.messages.create(
            model="claude-opus-5",
            max_tokens=1024,
            # This is a short creative-writing task, not a reasoning-heavy
            # one — low effort keeps it fast and cheap without giving up
            # quality here, unlike e.g. an agentic coding task.
            output_config={"effort": "low"},
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
    except anthropic.APIStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Claude API error: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise HTTPException(status_code=502, detail="Couldn't reach the Claude API.") from exc

    text = next((block.text for block in response.content if block.type == "text"), "")
    if not text:
        raise HTTPException(status_code=502, detail="Claude returned no text.")
    return RecapGenerateResponse(text=text.strip())
