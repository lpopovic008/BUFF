"""
Pydantic models — every request/response shape the API promises. FastAPI
uses these three ways at once: it validates incoming query params against
them (a bad `list_type` becomes an automatic 422, no if/else needed), it
serializes outgoing responses to match them (a typo'd field never leaks
out), and it generates the live OpenAPI docs at /docs directly from them.
That's the actual value of "using Pydantic" beyond "it's a class with
types" — one definition drives validation, serialization, and docs.

These mirror src/lib/player-values.ts and src/lib/player-stats.ts on the
TypeScript side deliberately, field for field, so the same data means the
same thing in both languages.
"""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class ListType(str, Enum):
    dynasty = "dynasty"
    fantasy = "fantasy"


class LeagueFormat(str, Enum):
    one_qb = "oneQB"
    superflex = "superflex"


class TEPremium(str, Enum):
    standard = "standard"
    tep = "tep"


class PlayerValue(BaseModel):
    name: str
    position: str
    team: str | None = None
    age: float | None = None
    value: int = Field(description="Trade value under the requested format/tep combination")


class PlayerValuesResponse(BaseModel):
    updated_at: str | None
    list_type: ListType
    format: LeagueFormat
    tep: TEPremium
    count: int
    players: list[PlayerValue]


class PlayerStat(BaseModel):
    player_id: str
    position: str
    games_played: int
    pts_ppr: float
    pts_half_ppr: float
    pts_std: float
    ppg_ppr: float = Field(description="pts_ppr / games_played, 0 if the player hasn't played yet")


class PlayerStatsResponse(BaseModel):
    updated_at: str | None
    season: str | None
    through_week: int | None
    count: int
    players: list[PlayerStat]


class RecapGenerateRequest(BaseModel):
    """
    Facts, not raw app data — the frontend already computes team names,
    scores, and the high scorer/standings leader for its own on-screen
    sections (see src/lib/format-recap.ts), so it sends those same strings
    here rather than this service re-deriving them from Sleeper. Keeps this
    endpoint a pure "facts in, prose out" ghostwriter instead of a second
    place that has to know how a fantasy league's scoring works.
    """

    league_name: str
    week: int
    matchups: list[str] = Field(
        min_length=1, description="One line per matchup, e.g. \"Gary's Boys def. Danger Zone 128.4-101.2\""
    )
    high_scorer: str | None = None
    standings_leader: str | None = None
    tone: str = "a witty, lightly roasting fantasy football league commissioner"


class RecapGenerateResponse(BaseModel):
    text: str


# ---- Payout reading (POST /payouts/parse) ---------------------------------
# Mirrors src/lib/payout-plan.ts: the award, amount and rank vocabularies are
# the same strings on both sides, so the frontend can apply a parsed rule
# directly to its payout engine.

AwardKind = Literal[
    "weekHighScore",
    "weekLowScore",
    "matchupWinner",
    "matchupLoser",
    "biggestWin",
    "closestWin",
    "highScoreInLoss",
    "lowScoreInWin",
    "aboveMedian",
    "weekTopPlayer",
    "finalPlace",
    "regularSeasonPlace",
    "seasonPoints",
    "seasonPointsAgainst",
    "mostHighScores",
    "seasonHighWeek",
    "seasonLowWeek",
    "allPlayRecord",
    "longestWinStreak",
    "survivor",
]


class PayoutManager(BaseModel):
    roster_id: int
    name: str


class PayoutParseRequest(BaseModel):
    """The commish's own description of their league's money, plus the facts
    about the league the model needs to turn it into rules."""

    description: str = Field(min_length=1, max_length=6000)
    team_count: int = Field(ge=2, le=40)
    regular_season_weeks: int = Field(ge=1, le=18)
    last_week: int = Field(ge=1, le=18)
    playoff_teams: int | None = Field(default=None, ge=0, le=40)
    managers: list[PayoutManager] = Field(default_factory=list)


class ParsedRule(BaseModel):
    award: AwardKind
    rank_mode: Literal["place", "top", "bottom"]
    rank_n: int
    amount_kind: Literal["dollars", "percent", "remainder"]
    amount: float
    from_week: int
    to_week: int
    ties: Literal["split", "each"]
    skip_if_paid: bool


class BuyInOverride(BaseModel):
    roster_id: int
    amount: float


class ParsedPayouts(BaseModel):
    """What the model hands back, and what the endpoint returns."""

    notes: list[str] = Field(description="How the payout structure reads, as short plain-English bullet points.")
    buy_in: float = Field(description="What each manager buys in for (0 if never stated).")
    buy_in_overrides: list[BuyInOverride] = Field(description="Managers whose buy-in differs from buy_in.")
    rules: list[ParsedRule]
    unsupported: list[str] = Field(description="Parts of the description that aren't payouts the app can track.")
    questions: list[str] = Field(description="Anything ambiguous enough that the commish should confirm it.")
