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
