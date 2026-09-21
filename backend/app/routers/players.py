"""
GET /players/values and GET /players/stats — the two endpoints this
service exists for. An APIRouter (rather than putting these directly on
`app` in main.py) is FastAPI's way of splitting a growing API into files
by resource, the same reason src/app/(chrome)/ splits pages by route on
the frontend side.
"""

from fastapi import APIRouter, HTTPException, Query

from ..data import DataUnavailableError, load_player_stats, load_player_values
from ..models import (
    LeagueFormat,
    PlayerStat,
    PlayerStatsResponse,
    PlayerValue,
    PlayerValuesResponse,
    ListType,
    TEPremium,
)

router = APIRouter(prefix="/players", tags=["players"])


def _value_for(raw_values: dict, format: LeagueFormat, tep: TEPremium) -> int:
    """Same lookup as valueFor() in src/lib/player-values.ts — four values
    are stored per player (1QB/Superflex x Standard/TEP), and the caller
    picks one combination per request instead of getting all four."""
    if format == LeagueFormat.superflex:
        key = "superflexTep" if tep == TEPremium.tep else "superflexStandard"
    else:
        key = "oneQBTep" if tep == TEPremium.tep else "oneQBStandard"
    return raw_values[key]


@router.get("/values", response_model=PlayerValuesResponse)
def get_player_values(
    list_type: ListType = Query(ListType.dynasty, description="Dynasty or fantasy (redraft) values"),
    format: LeagueFormat = Query(LeagueFormat.one_qb, description="1QB or Superflex league"),
    tep: TEPremium = Query(TEPremium.standard, description="TE premium scoring or standard"),
    position: str | None = Query(None, description="Filter to one position, e.g. WR"),
    limit: int = Query(500, ge=1, le=1000, description="Max players to return"),
) -> PlayerValuesResponse:
    try:
        snapshot = load_player_values()
    except DataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    raw_players = snapshot.get(list_type.value, [])

    players: list[PlayerValue] = []
    for p in raw_players:
        if position and p.get("position", "").upper() != position.upper():
            continue
        players.append(
            PlayerValue(
                name=p["name"],
                position=p["position"],
                team=p.get("team"),
                age=p.get("age"),
                value=_value_for(p["values"], format, tep),
            )
        )
        if len(players) >= limit:
            break

    return PlayerValuesResponse(
        updated_at=snapshot.get("updatedAt"),
        list_type=list_type,
        format=format,
        tep=tep,
        count=len(players),
        players=players,
    )


@router.get("/stats", response_model=PlayerStatsResponse)
def get_player_stats(
    position: str | None = Query(None, description="Filter to one position, e.g. WR"),
    min_games: int = Query(0, ge=0, description="Only players with at least this many games played"),
    limit: int = Query(1000, ge=1, le=2000, description="Max players to return"),
) -> PlayerStatsResponse:
    try:
        snapshot = load_player_stats()
    except DataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    raw_players = snapshot.get("players", [])

    players: list[PlayerStat] = []
    for p in raw_players:
        if position and p.get("position", "").upper() != position.upper():
            continue
        games = p.get("gamesPlayed", 0)
        if games < min_games:
            continue
        pts_ppr = p.get("ptsPpr", 0)
        players.append(
            PlayerStat(
                player_id=p["playerId"],
                position=p["position"],
                games_played=games,
                pts_ppr=pts_ppr,
                pts_half_ppr=p.get("ptsHalfPpr", 0),
                pts_std=p.get("ptsStd", 0),
                ppg_ppr=round(pts_ppr / games, 2) if games > 0 else 0.0,
            )
        )
        if len(players) >= limit:
            break

    return PlayerStatsResponse(
        updated_at=snapshot.get("updatedAt"),
        season=snapshot.get("season"),
        through_week=snapshot.get("throughWeek"),
        count=len(players),
        players=players,
    )
