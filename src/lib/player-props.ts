// Shared shape for NFL player prop odds, fetched server-side by
// scripts/fetch-player-props.ts from The Odds API (a licensed odds
// aggregator, not a scrape of any sportsbook's private app) and committed
// as JSON — same build-time-fetch pattern as player-adp.json and
// player-values.json, since a live client-side fetch would either expose
// the API key in the page's own JS or hit the account's rate limit once per
// visitor instead of once per refresh.

export interface PlayerPropLine {
  /** The Odds API's market key, e.g. "player_pass_yds", "player_pass_tds". See fantasy-points-from-props.ts for the full set this app understands. */
  market: string;
  /** The sportsbook's over/under line for this stat. */
  point: number;
  /** American odds on the Over side, or null if only one side was available. */
  overOdds: number | null;
  /** American odds on the Under side, or null if only one side was available. */
  underOdds: number | null;
  /** Which book this line came from — see BOOKMAKER_PRIORITY in the fetch script; not always the sharpest book requested, since not every book prices every player/market. */
  bookmaker: string;
}

export interface PlayerPropEntry {
  /** Player name as the sportsbook spells it — matched to Sleeper/roster names via src/lib/name-match.ts, same as KTC and season-projection matching elsewhere in this app. */
  name: string;
  /**
   * The game these lines are attached to. Which side the player is actually
   * on isn't in the odds response (a prop market gives a player's name, not
   * their team) — the app resolves that itself via Sleeper's player data
   * (already loaded for name-matching) when it needs to show it.
   */
  homeTeam: string;
  awayTeam: string;
  /** ISO kickoff time. */
  kickoff: string;
  props: PlayerPropLine[];
}

export interface PlayerPropsSnapshot {
  updatedAt: string | null;
  source: "the-odds-api";
  /** Bookmaker keys tried, sharpest first — see BOOKMAKER_PRIORITY in the fetch script. */
  bookmakersRequested: string[];
  week: number | null;
  season: string | null;
  players: PlayerPropEntry[];
}

export const EMPTY_PLAYER_PROPS: PlayerPropsSnapshot = {
  updatedAt: null,
  source: "the-odds-api",
  bookmakersRequested: [],
  week: null,
  season: null,
  players: [],
};
