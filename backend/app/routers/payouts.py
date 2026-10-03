"""
POST /payouts/parse — reads a commissioner's own description of their
league's money ("$100 buy-in, $10 a win, high scorer gets $20 instead,
champ takes half...") and turns it into the payout rules the dashboard's
payout engine runs (src/lib/payout-plan.ts).

The model only translates; it never computes a payout. It hands back
structured rules (validated against ParsedPayouts by Gemini's structured
output and again here), plus plain-English notes on how it read the setup,
anything that isn't a trackable payout, and anything it would ask about.
The frontend shows all of that for the commish to accept before the rules
replace anything, and its own engine does every dollar of the math.
"""

from fastapi import APIRouter, Depends, HTTPException
from google import genai
from google.genai import errors, types

from ..models import ParsedPayouts, PayoutParseRequest
from .recap import GEMINI_MODEL, get_gemini_client

router = APIRouter(prefix="/payouts", tags=["payouts"])

SYSTEM = """You turn a fantasy football commissioner's description of their league's payouts into structured rules for a payout calculator. You only translate: never invent a payout the description doesn't state, never do the season's math.

OUTPUT
- notes: 3-10 short bullet points, in plain English, restating the whole payout structure as you understand it (buy-in, pot, each payout, anything you assumed). Write them for the commissioner to check.
- buy_in: what each manager pays in. If the description gives a total pot instead, divide by the number of teams. 0 if never stated.
- buy_in_overrides: only managers whose buy-in differs, by roster_id from the manager list.
- rules: one entry per payout, in the order they should be applied.
- unsupported: anything described that is not money paid out of the pot by results (punishments, trophies, draft-order rules, fines paid INTO the pot, per-point payouts, side bets between two managers, rollovers), each as a short phrase.
- questions: only genuinely ambiguous points worth confirming (e.g. whether the high scorer also keeps the win money). Make your best reading in the rules anyway.

RULE FIELDS
- award: who gets paid.
  Judged each week (from_week..to_week are the weeks it pays):
    weekHighScore      the week's highest scorer(s)
    weekLowScore       the week's lowest scorer(s)
    matchupWinner      every team that wins its matchup (unranked: pays each one)
    matchupLoser       every team that loses its matchup (unranked)
    biggestWin         the week's largest margin of victory
    closestWin         the week's narrowest win
    highScoreInLoss    the highest score by a losing team
    lowScoreInWin      the lowest score by a winning team
    aboveMedian        every team scoring above that week's median (unranked)
    weekTopPlayer      the team that started the week's highest-scoring player
  Judged once, at the end of a stretch of weeks (from_week..to_week are the weeks it's judged on; use 1..regular_season_weeks unless the description says otherwise, e.g. "best record at the halfway point" = 1..half):
    finalPlace         final finishing place after the playoffs (1 = champion, 2 = runner-up, 3 = third...). The consolation/toilet-bowl winner is place playoff_teams + 1. Last place / the sacko is rank_mode "bottom", rank_n 1.
    regularSeasonPlace standings by record then points (1 = regular-season champion / #1 seed)
    seasonPoints       total points scored ("most points for")
    seasonPointsAgainst total points scored against ("unluckiest")
    mostHighScores     most weekly high scores
    seasonHighWeek     best single-week score of the season
    seasonLowWeek      worst single-week score of the season
    allPlayRecord      best record if every team played every other team every week
    longestWinStreak   longest winning streak
    survivor           survivor pool / guillotine / last man standing / elimination: each week the lowest scorer still standing is eliminated from from_week; rank 1 is the last team standing
- rank_mode / rank_n: for ranked awards, "place" + n pays only the nth (place 1 = the winner of the award); "top" + n pays each of the top n; "bottom" + n pays each of the bottom n. For unranked awards (matchupWinner, matchupLoser, aboveMedian) use "place", 1.
  Different amounts for different places ("$10 to the top scorer, $5 to second") = separate rules, each "place".
- amount_kind / amount: "dollars" (amount = dollars per payout), "percent" (amount = percent of the WHOLE pot per payout, e.g. 50 for half), or "remainder" (whatever the other rules leave in the pot; amount 0). Use remainder for "the rest", "whatever's left", "everything else".
- from_week / to_week: inclusive weeks, 1..last_week. Weekly payouts usually run through the regular season (1..regular_season_weeks). Playoff weeks are regular_season_weeks+1..last_week. A single week = from_week = to_week.
- ties: "split" (tied teams share the money) unless the description says each tied team gets the full amount ("each").
- skip_if_paid: true when a payout is "instead of" another (no double-dipping): put the bigger payout first and set skip_if_paid true on the later one. Example: "$10 per win, high scorer gets $20 instead" = [weekHighScore $20, then matchupWinner $10 with skip_if_paid true]. If they stack ("plus", "on top of"), false.

Be faithful to the numbers given. If percentages are given for placements, use percent. Convert words to numbers ("a hundred bucks" = 100)."""


def _build_prompt(req: PayoutParseRequest) -> str:
    lines = [
        f"Teams: {req.team_count}",
        f"Regular season: weeks 1-{req.regular_season_weeks}",
        f"Season ends (championship): week {req.last_week}",
    ]
    if req.playoff_teams:
        lines.append(f"Playoff teams: {req.playoff_teams}")
    if req.managers:
        lines.append("Managers (roster_id: name):")
        lines += [f"- {m.roster_id}: {m.name}" for m in req.managers]
    lines += ["", "The commissioner's description of the payouts:", '"""', req.description.strip(), '"""']
    return "\n".join(lines)


def _clean(parsed: ParsedPayouts, req: PayoutParseRequest) -> ParsedPayouts:
    """Keeps whatever the model returned inside what the league can actually have."""
    known = {m.roster_id for m in req.managers}
    for r in parsed.rules:
        r.from_week = min(max(1, r.from_week), req.last_week)
        r.to_week = min(max(r.from_week, r.to_week), req.last_week)
        r.rank_n = min(max(1, r.rank_n), req.team_count)
        r.amount = max(0.0, r.amount)
    parsed.buy_in = max(0.0, parsed.buy_in)
    parsed.buy_in_overrides = [o for o in parsed.buy_in_overrides if not known or o.roster_id in known]
    return parsed


@router.post("/parse", response_model=ParsedPayouts)
def parse_payouts(
    req: PayoutParseRequest,
    client: genai.Client = Depends(get_gemini_client),
) -> ParsedPayouts:
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=_build_prompt(req),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM,
                response_mime_type="application/json",
                response_schema=ParsedPayouts,
                temperature=0.1,
                max_output_tokens=4096,
            ),
        )
    except errors.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc.message}") from exc

    parsed = getattr(response, "parsed", None)
    if not isinstance(parsed, ParsedPayouts):
        try:
            parsed = ParsedPayouts.model_validate_json(response.text or "")
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Couldn't read the payout rules from the model's answer.") from exc
    return _clean(parsed, req)
