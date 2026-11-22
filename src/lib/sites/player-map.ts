// Every player in a league on another site, matched to the same player on Sleeper — whose ids the rest of the app
// knows every player by (his photo, his values, his stats, his projections). Sleeper's own list of players keeps each
// one's ESPN and Yahoo ids, so those match exactly; anyone else (MyFantasyLeague's, Fleaflicker's, and anyone
// those ids miss) by his name and position, his team breaking a tie. A team's defense is its abbreviation, as on
// Sleeper. Anyone who can't be matched at all keeps an id of his own ("espn:12345"), his name and position added to
// the players the app looks up (see players.ts), so he still shows, just without what only Sleeper has.

import { addPlayerRecords, loadPlayers, PlayerRecord } from "../players";
import { normalizeName } from "../name-match";
import { OtherSite, sleeperTeam } from "./ids";

/** A player as another site gives him. */
export interface SitePlayer {
  /** The site's id for him. */
  id: string;
  name: string;
  /** QB, RB, WR, TE, K or DEF (each site's own spelling's turned into these by its adapter). */
  position: string;
  team?: string | null;
  /** His ESPN id, where the site knows it (MyFantasyLeague does). */
  espnId?: string | null;
}

interface PlayerIndex {
  byEspn: Map<string, string>;
  byYahoo: Map<string, string>;
  /** `${position}|${normalized name}` → every Sleeper id by it, with his team. */
  byName: Map<string, { id: string; team: string | null }[]>;
}

let index: Promise<PlayerIndex> | null = null;

function buildIndex(players: Record<string, PlayerRecord> | null): PlayerIndex {
  const byEspn = new Map<string, string>();
  const byYahoo = new Map<string, string>();
  const byName = new Map<string, { id: string; team: string | null }[]>();
  for (const [id, p] of Object.entries(players ?? {})) {
    if (p.espn_id != null && p.espn_id !== "") byEspn.set(String(p.espn_id), id);
    if (p.yahoo_id != null && p.yahoo_id !== "") byYahoo.set(String(p.yahoo_id), id);
    if (p.full_name && p.position) {
      const key = `${p.position}|${normalizeName(p.full_name)}`;
      const list = byName.get(key) ?? [];
      list.push({ id, team: p.team ?? null });
      byName.set(key, list);
    }
  }
  return { byEspn, byYahoo, byName };
}

function loadIndex(): Promise<PlayerIndex> {
  if (!index) {
    index = loadPlayers().then((players) => {
      // Not kept if the list didn't come (so a later try can have it).
      if (!players) index = null;
      return buildIndex(players);
    });
  }
  return index;
}

/** For tests: matches against these players instead of Sleeper's whole list. */
export function setTestPlayers(players: Record<string, PlayerRecord>): void {
  index = Promise.resolve(buildIndex(players));
}

/** The one player an index has for a site's player, if any. */
export function matchPlayer(idx: PlayerIndex, site: OtherSite, p: SitePlayer): string | null {
  if (p.position === "DEF") return sleeperTeam(p.team) ?? null;
  if (site === "espn") {
    const hit = idx.byEspn.get(p.id);
    if (hit) return hit;
  }
  if (site === "yahoo") {
    const hit = idx.byYahoo.get(p.id);
    if (hit) return hit;
  }
  if (p.espnId) {
    const hit = idx.byEspn.get(String(p.espnId));
    if (hit) return hit;
  }
  const named = idx.byName.get(`${p.position}|${normalizeName(p.name)}`) ?? [];
  if (named.length === 1) return named[0].id;
  const team = sleeperTeam(p.team);
  return named.find((n) => n.team === team)?.id ?? null;
}

/**
 * A site's players' Sleeper ids, by the site's id for each — anyone unmatched under an id of his own, added to the
 * players looked up (see the top of this file).
 */
export async function mapPlayers(site: OtherSite, players: SitePlayer[]): Promise<Map<string, string>> {
  const idx = await loadIndex();
  const out = new Map<string, string>();
  const unmatched: Record<string, PlayerRecord> = {};
  for (const p of players) {
    if (out.has(p.id)) continue;
    const id = matchPlayer(idx, site, p) ?? `${site}:${p.id}`;
    out.set(p.id, id);
    if (id.includes(":")) unmatched[id] = { full_name: p.name, position: p.position, team: sleeperTeam(p.team) };
  }
  if (Object.keys(unmatched).length > 0) addPlayerRecords(unmatched);
  return out;
}
