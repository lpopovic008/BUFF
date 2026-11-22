// Leagues on other sites read as Sleeper's are: sleeper.ts hands each request whose league (or draft) is on another
// site here (see sites/ids), and that site's adapter answers it in Sleeper's own shape — the league, its managers,
// its rosters, a week's matchups and transactions, its traded picks, its drafts and its playoff brackets — so
// everything built on Sleeper's works for it the same.

import type {
  SleeperBracketMatch,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
} from "../sleeper";
import { OtherSite, parseSiteDraftId, parseSiteLeagueId, SiteLeagueRef } from "./ids";
import { espn } from "./espn";
import { mfl } from "./mfl";
import { fleaflicker } from "./fleaflicker";
import { yahoo } from "./yahoo";

/** What each site's adapter answers, every answer in Sleeper's shape. */
export interface SiteAdapter {
  league(ref: SiteLeagueRef): Promise<SleeperLeague | null>;
  users(ref: SiteLeagueRef): Promise<SleeperLeagueUser[]>;
  rosters(ref: SiteLeagueRef): Promise<SleeperRoster[]>;
  matchups(ref: SiteLeagueRef, week: number, ttlSeconds: number): Promise<SleeperMatchup[]>;
  transactions(ref: SiteLeagueRef, week: number): Promise<SleeperTransaction[]>;
  tradedPicks(ref: SiteLeagueRef): Promise<SleeperTradedPick[]>;
  drafts(ref: SiteLeagueRef): Promise<SleeperDraft[]>;
  draftPicks(ref: SiteLeagueRef): Promise<SleeperDraftPick[]>;
  winnersBracket(ref: SiteLeagueRef): Promise<SleeperBracketMatch[]>;
  losersBracket(ref: SiteLeagueRef): Promise<SleeperBracketMatch[]>;
}

const ADAPTERS: Record<OtherSite, SiteAdapter> = { espn, mfl, fleaflicker, yahoo };

const LEAGUE_PATH = /^\/league\/([^/]+)(?:\/(rosters|users|traded_picks|drafts|winners_bracket|losers_bracket|matchups|transactions)(?:\/(\d+))?)?$/;
const DRAFT_PATH = /^\/draft\/([^/]+)(\/picks)?$/;

/**
 * Sleeper's answer to `path` for a league (or draft) on another site — `undefined` if the path isn't one (it's
 * Sleeper's own to answer). `ttlSeconds`: how fresh the caller needs it.
 */
export function siteAnswer(path: string, ttlSeconds: number): Promise<unknown> | undefined {
  const league = LEAGUE_PATH.exec(path);
  if (league) {
    const ref = parseSiteLeagueId(decodeURIComponent(league[1]));
    if (!ref) return undefined;
    const a = ADAPTERS[ref.site];
    const week = Number(league[3] ?? 0);
    switch (league[2]) {
      case undefined:
        return a.league(ref);
      case "rosters":
        return a.rosters(ref);
      case "users":
        return a.users(ref);
      case "traded_picks":
        return a.tradedPicks(ref);
      case "drafts":
        return a.drafts(ref);
      case "winners_bracket":
        return a.winnersBracket(ref);
      case "losers_bracket":
        return a.losersBracket(ref);
      case "matchups":
        return a.matchups(ref, week, ttlSeconds);
      case "transactions":
        return a.transactions(ref, week);
    }
  }
  const draft = DRAFT_PATH.exec(path);
  if (draft) {
    const ref = parseSiteDraftId(decodeURIComponent(draft[1]));
    if (!ref) return undefined;
    const a = ADAPTERS[ref.site];
    if (draft[2]) return a.draftPicks(ref);
    return a.drafts(ref).then((drafts) => drafts[0] ?? null);
  }
  return undefined;
}
