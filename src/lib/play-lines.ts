// The people in a Red Zone play, one line each: who ESPN's play line names
// (matched to a Sleeper player, for their photo and position), what the play
// earned them, and how their game is going.

import { FeedCandidate, GamePlay, playTextActors } from "./play-by-play";
import { pprPointsForPlay } from "./play-points";

/** A player a play's names can be matched to. */
export interface LinePlayer {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
}

/** One person in a play. */
export interface PlayLine {
  /** Stable within a game: the Sleeper id, or the team and ESPN's shorthand when no player matched. */
  key: string;
  /** The Sleeper id (a team defense's is its team), or null when ESPN's name couldn't be matched to anyone. */
  playerId: string | null;
  /** The full name, a defense's "MIA D/ST", or ESPN's shorthand ("J.Allen") when unmatched. */
  name: string;
  /** ESPN's shorthand, as the play names them; null for a team defense. */
  label: string | null;
  /** "" when unknown. */
  position: string;
  team: string | null;
  /** What the play earned them, and their game total through it — null for someone the play can't score (a defender). */
  delta: number | null;
  total: number | null;
}

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

/**
 * Whether ESPN's shorthand ("J.Allen", "Jos.Allen", "A.St. Brown") names this
 * player: the same surname, and a first name that starts with the shorthand's
 * letters.
 */
export function labelNames(label: string, fullName: string): boolean {
  const dot = label.indexOf(".");
  if (dot < 1) return false;
  const first = label.slice(0, dot).toLowerCase();
  const surname = label.slice(dot + 1).trim().toLowerCase();
  const parts = fullName.trim().split(/\s+/);
  while (parts.length > 2 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  if (parts.length < 2) return false;
  return parts[0].toLowerCase().startsWith(first) && parts.slice(1).join(" ").toLowerCase() === surname;
}

/** Who a shorthand names on a team: the first match in `pool` (put the likeliest first). */
export function findPlayer(label: string, team: string | null, pool: LinePlayer[]): LinePlayer | null {
  if (!team) return null;
  return pool.find((p) => p.team === team && p.position !== "DEF" && labelNames(label, p.name)) ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whether the play's line has this person taking the ball away, or blocking a kick — a defender. */
function takesAway(text: string, label: string): boolean {
  const name = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:INTERCEPTED|RECOVERED|BLOCKED) by (?:[A-Z]{2,3}-)?${name}(?![A-Za-z])`, "i").test(text);
}

/**
 * A game's plays, each with one line per person in it — in the order the
 * play's line names them, then the defense if the play scored it points.
 * Running totals build up play by play, so pass every play of the game in
 * game order. `pool` is who names can be matched to, likeliest first. A
 * defense is listed when the play scored it points, or when it's one of
 * `keepDefenses` and the play was one it's in on.
 */
export function linesForPlays(
  plays: GamePlay[],
  teams: [string, string],
  pool: LinePlayer[],
  /** Defenses to list on every play they're in, scoring or not (your starting D/STs). */
  keepDefenses: Set<string> = new Set()
): Map<string, PlayLine[]> {
  const totals = new Map<string, number>();
  const addTo = (key: string, delta: number) => {
    const total = round2((totals.get(key) ?? 0) + delta);
    totals.set(key, total);
    return total;
  };
  const out = new Map<string, PlayLine[]>();
  for (const play of plays) {
    const lines: PlayLine[] = [];
    const seen = new Set<string>();
    const defense = play.offense ? (teams.find((t) => t !== play.offense) ?? null) : null;
    for (const { label, candidate } of playTextActors(play)) {
      // Most names are the offense's; a defender making a play (an interception) is the other side's.
      const onOffense = findPlayer(label, play.offense, pool);
      const player = onOffense ?? findPlayer(label, defense, pool);
      const key = player?.playerId ?? candidate.playerId;
      if (seen.has(key)) continue;
      seen.add(key);
      // Unmatched, ESPN's words still give a defender away: "INTERCEPTED by T.Bernard".
      const scored = player ? player.team === play.offense : !takesAway(play.text, label);
      const asCandidate: FeedCandidate = player
        ? { playerId: player.playerId, name: player.name, position: player.position, team: player.team }
        : candidate;
      const delta = scored ? pprPointsForPlay(play, asCandidate) : null;
      lines.push({
        key,
        playerId: player?.playerId ?? null,
        name: player?.name ?? label,
        label,
        position: player?.position ?? "",
        team: player?.team ?? play.offense,
        delta,
        total: delta === null ? null : addTo(key, delta),
      });
    }
    if (defense) {
      const delta = pprPointsForPlay(play, { playerId: defense, name: `${defense} D/ST`, position: "DEF", team: defense });
      const total = addTo(defense, delta);
      if (delta !== 0 || keepDefenses.has(defense)) {
        lines.push({ key: defense, playerId: defense, name: `${defense} D/ST`, label: null, position: "DEF", team: defense, delta, total });
      }
    }
    out.set(play.id, lines);
  }
  return out;
}

const n = (stats: Record<string, number>, key: string) => Math.round(stats[key] ?? 0);

/**
 * A player's game so far, in a few words: "18/26 214 YDS 2 TD" for a passer,
 * "9 CAR 41 YDS" for a runner, "5 REC 63 YDS 1 TD" for a catcher — whichever
 * they've done, their main job first — "FG 2/2 XP 3/3" for a kicker, sacks
 * and takeaways for a defense. Empty when they've done nothing yet.
 */
export function statLine(position: string, stats: Record<string, number> | undefined): string {
  if (!stats) return "";
  const td = (key: string) => (n(stats, key) > 0 ? ` ${n(stats, key)} TD` : "");
  if (position === "DEF") {
    return [
      n(stats, "sack") > 0 ? `${n(stats, "sack")} SCK` : "",
      n(stats, "int") > 0 ? `${n(stats, "int")} INT` : "",
      n(stats, "fum_rec") > 0 ? `${n(stats, "fum_rec")} FR` : "",
      n(stats, "def_td") > 0 ? `${n(stats, "def_td")} TD` : "",
      "pts_allow" in stats ? `${n(stats, "pts_allow")} PA` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (position === "K") {
    return [
      n(stats, "fga") > 0 ? `FG ${n(stats, "fgm")}/${n(stats, "fga")}` : "",
      n(stats, "xpa") > 0 ? `XP ${n(stats, "xpm")}/${n(stats, "xpa")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const pass =
    n(stats, "pass_att") > 0
      ? `${n(stats, "pass_cmp")}/${n(stats, "pass_att")} ${n(stats, "pass_yd")} YDS${td("pass_td")}${n(stats, "pass_int") > 0 ? ` ${n(stats, "pass_int")} INT` : ""}`
      : "";
  const rush = n(stats, "rush_att") > 0 ? `${n(stats, "rush_att")} CAR ${n(stats, "rush_yd")} YDS${td("rush_td")}` : "";
  const rec = n(stats, "rec") > 0 ? `${n(stats, "rec")} REC ${n(stats, "rec_yd")} YDS${td("rec_td")}` : "";
  const order = position === "QB" ? [pass, rush, rec] : position === "RB" ? [rush, rec, pass] : [rec, rush, pass];
  return order.filter(Boolean).join(" · ");
}
