// Converts a sportsbook's player prop lines into fantasy points under a
// league's own scoring settings — pure logic, no React, so it's testable
// without rendering the War Room. See src/lib/player-props.ts for where the
// lines come from (Pinnacle via The Odds API, sharpest book available
// through that source) and WarRoomConsole.tsx for how this gets wired to
// the currently-selected league's starting lineup.

import { ANYTIME_TD_MARKET, PlayerPropsSnapshot } from "./player-props";
import { normalizeName } from "./name-match";

export interface PropMarketDef {
  /** The Odds API's market key — matches PlayerPropLine.market. */
  market: string;
  /** Sleeper's scoring_settings key this market's line gets weighed by. Absent for ANYTIME_TD_MARKET, which is converted differently — see projectFromProps. */
  sleeperKey?: string;
  /** Short column label for the UI. */
  label: string;
}

// Every market scripts/fetch-player-props.ts requests, mapped to the
// Sleeper scoring key that turns a line into fantasy points. Order here is
// display order (passing first, then rushing, then receiving, then TDs).
export const PROP_MARKETS: PropMarketDef[] = [
  { market: "player_pass_yds", sleeperKey: "pass_yd", label: "PASS YDS" },
  { market: "player_pass_tds", sleeperKey: "pass_td", label: "PASS TDS" },
  { market: "player_pass_interceptions", sleeperKey: "pass_int", label: "INT" },
  { market: "player_rush_yds", sleeperKey: "rush_yd", label: "RUSH YDS" },
  { market: "player_rush_tds", sleeperKey: "rush_td", label: "RUSH TDS" },
  { market: "player_reception_yds", sleeperKey: "rec_yd", label: "REC YDS" },
  { market: "player_receptions", sleeperKey: "rec", label: "REC" },
  { market: "player_reception_tds", sleeperKey: "rec_td", label: "REC TDS" },
  { market: ANYTIME_TD_MARKET, label: "ANY TD" },
];

/** American odds -> implied probability (0-1), the standard conversion — no de-vig, since anytime-TD is priced as a single "Yes" side with no "No" price to remove vig against. */
function americanOddsToProbability(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

export interface PropPointsLine {
  market: string;
  label: string;
  /** The book's own over/under line — null for ANYTIME_TD_MARKET, which has no line (see impliedProbabilityPct instead). */
  point: number | null;
  /** Only set for ANYTIME_TD_MARKET: the "Yes" price converted to an implied probability (0-100). */
  impliedProbabilityPct: number | null;
  overOdds: number | null;
  underOdds: number | null;
  bookmaker: string;
  /**
   * For a lined market: point * that market's scoring weight. For
   * ANYTIME_TD_MARKET (no line to multiply): implied scoring probability *
   * this league's touchdown value — averaging rush_td/rec_td since an
   * anytime-TD scorer market doesn't say which kind, and a QB's would be a
   * rushing touchdown (passing TDs are credited to the receiver, priced by
   * player_pass_tds instead). 0 either way if the league's scoring doesn't
   * count the relevant stat at all.
   */
  fantasyPoints: number;
}

export interface PlayerPropProjection {
  name: string;
  /** False if the sportsbook snapshot has no player under this name — bye week, inactive, kicker/DST (untracked markets), or a name-matching miss. */
  matched: boolean;
  homeTeam: string | null;
  awayTeam: string | null;
  kickoff: string | null;
  lines: PropPointsLine[];
  totalFantasyPoints: number;
}

const UNMATCHED: Omit<PlayerPropProjection, "name"> = {
  matched: false,
  homeTeam: null,
  awayTeam: null,
  kickoff: null,
  lines: [],
  totalFantasyPoints: 0,
};

/** Every prop line available for one player, converted to fantasy points under `scoringSettings`. */
export function projectFromProps(
  playerName: string,
  snapshot: PlayerPropsSnapshot,
  scoringSettings: Record<string, number>
): PlayerPropProjection {
  const target = normalizeName(playerName);
  const entry = snapshot.players.find((p) => normalizeName(p.name) === target);
  if (!entry) return { name: playerName, ...UNMATCHED };

  const lines: PropPointsLine[] = [];
  let totalFantasyPoints = 0;
  for (const def of PROP_MARKETS) {
    const line = entry.props.find((p) => p.market === def.market);
    if (!line) continue;

    let fantasyPoints: number;
    let impliedProbabilityPct: number | null = null;
    if (def.market === ANYTIME_TD_MARKET) {
      const probability = line.overOdds != null ? americanOddsToProbability(line.overOdds) : 0;
      impliedProbabilityPct = Math.round(probability * 1000) / 10;
      const tdWeights = [scoringSettings.rush_td, scoringSettings.rec_td].filter(
        (w): w is number => typeof w === "number"
      );
      const tdWeight = tdWeights.length > 0 ? tdWeights.reduce((sum, w) => sum + w, 0) / tdWeights.length : 0;
      fantasyPoints = probability * tdWeight;
    } else {
      const weight = def.sleeperKey ? scoringSettings[def.sleeperKey] ?? 0 : 0;
      fantasyPoints = (line.point ?? 0) * weight;
    }

    totalFantasyPoints += fantasyPoints;
    lines.push({
      market: def.market,
      label: def.label,
      point: line.point,
      impliedProbabilityPct,
      overOdds: line.overOdds,
      underOdds: line.underOdds,
      bookmaker: line.bookmaker,
      fantasyPoints,
    });
  }

  return {
    name: entry.name,
    matched: true,
    homeTeam: entry.homeTeam,
    awayTeam: entry.awayTeam,
    kickoff: entry.kickoff,
    lines,
    totalFantasyPoints,
  };
}

export interface LineupSlot {
  slot: string;
  playerId: string;
  name: string;
}

export interface LineupPropProjection extends PlayerPropProjection {
  slot: string;
  playerId: string;
}

/** Same as projectFromProps, run across a whole starting lineup, plus the summed total across every starter. */
export function projectLineupFromProps(
  lineup: LineupSlot[],
  snapshot: PlayerPropsSnapshot,
  scoringSettings: Record<string, number>
): { players: LineupPropProjection[]; totalFantasyPoints: number } {
  const players = lineup
    .filter((p) => p.playerId)
    .map((p) => ({ ...projectFromProps(p.name, snapshot, scoringSettings), slot: p.slot, playerId: p.playerId }));
  const totalFantasyPoints = players.reduce((sum, p) => sum + p.totalFantasyPoints, 0);
  return { players, totalFantasyPoints };
}
