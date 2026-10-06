// Play-by-play for the Red Zone feed, from ESPN's public game summary
// endpoint (CORS-open, no auth, the same family as the scoreboard). Its plays
// name players only in ESPN's own shorthand ("A.Rodgers pass short left to
// D.Washington"), with no ids, so your starters are found in each play by
// name, checked against which team had the ball.

import { LastPlay, normalizeTeam } from "./nfl-schedule";

const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

export interface GamePlay {
  id: string;
  gameId: string;
  /** ESPN's order within the game. */
  sequence: number;
  /** ESPN's play-by-play line, minus the formation note ("(Shotgun)") it opens with. */
  text: string;
  /** "Pass Reception", "Rush", "Sack", "Field Goal Good"... */
  type: string;
  /** 1–4, 5+ for overtime; 0 when unknown. */
  period: number;
  /** Game clock when the play started, e.g. "4:31". */
  clock: string;
  /** The team with the ball, when known. */
  offense: string | null;
  scoring: boolean;
  turnover: boolean;
  /** Yards gained (negative for a loss). */
  yards: number;
  /** Snapped from inside the defense's 20. */
  redZone: boolean;
  /** The down and distance it was snapped on, e.g. "3rd & 4", "1st & Goal" — null for kickoffs, extra points and the like. */
  downDistance: string | null;
  /** When the play happened, in ms. Null if ESPN didn't say. */
  at: number | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th"];

/** "3rd & 4", or "1st & Goal" when the line to gain is the goal line; null off a down (kickoffs, tries). */
export function downAndDistance(down: number, distance: number, yardsToEndzone: number): string | null {
  if (!(down >= 1 && down <= 4) || !Number.isFinite(distance)) return null;
  const goal = Number.isFinite(yardsToEndzone) && yardsToEndzone <= distance;
  return `${ORDINALS[down]} & ${goal ? "Goal" : distance}`;
}

/** Drops the formation note ESPN opens a play with: "(Shotgun) ", "(No Huddle, Shotgun) ". */
export function cleanPlayText(text: string): string {
  return text.replace(/^\s*\([^)]*\)\s*/, "").trim();
}

// Clock stoppages and period markers — nothing anyone did.
const NON_PLAYS = /^(official timeout|timeout|end period|end of half|end of game|end of regulation|two-minute warning|coin toss)/i;

/** Every play in an ESPN game summary, in game order. Tolerates any missing or unexpected field. */
export function parseSummaryPlays(gameId: string, data: unknown): GamePlay[] {
  const drivesRoot = isRecord(data) && isRecord(data.drives) ? data.drives : null;
  if (!drivesRoot) return [];
  const drives = [
    ...(Array.isArray(drivesRoot.previous) ? drivesRoot.previous : []),
    ...(isRecord(drivesRoot.current) ? [drivesRoot.current] : []),
  ];
  const plays: GamePlay[] = [];
  const seen = new Set<string>();
  for (const drive of drives) {
    if (!isRecord(drive)) continue;
    const driveTeam = isRecord(drive.team) && typeof drive.team.abbreviation === "string" ? normalizeTeam(drive.team.abbreviation) : null;
    for (const p of Array.isArray(drive.plays) ? drive.plays : []) {
      if (!isRecord(p) || typeof p.text !== "string") continue;
      const id = typeof p.id === "string" || typeof p.id === "number" ? String(p.id) : null;
      if (!id || seen.has(id)) continue;
      const type = isRecord(p.type) && typeof p.type.text === "string" ? p.type.text : "";
      if (NON_PLAYS.test(type)) continue;
      seen.add(id);
      const start = isRecord(p.start) ? p.start : {};
      const toEndzone = Number(start.yardsToEndzone);
      const down = Number(start.down);
      const at = typeof p.wallclock === "string" ? Date.parse(p.wallclock) : NaN;
      const distance = Number(start.distance);
      plays.push({
        id,
        gameId,
        sequence: Number(p.sequenceNumber) || 0,
        text: cleanPlayText(p.text),
        type,
        period: isRecord(p.period) ? Number(p.period.number) || 0 : 0,
        clock: isRecord(p.clock) && typeof p.clock.displayValue === "string" ? p.clock.displayValue : "",
        offense: driveTeam,
        scoring: p.scoringPlay === true,
        turnover: p.isTurnover === true,
        yards: Number(p.statYardage) || 0,
        redZone: down > 0 && Number.isFinite(toEndzone) && toEndzone <= 20,
        downDistance:
          typeof start.shortDownDistanceText === "string" && start.shortDownDistanceText
            ? start.shortDownDistanceText
            : downAndDistance(down, distance, toEndzone),
        at: Number.isFinite(at) ? at : null,
      });
    }
  }
  return plays.sort((a, b) => a.sequence - b.sequence);
}

const firstSeen = new Map<string, number>();

/** When this page first saw a play — the time a scoreboard-only play sorts by until the play-by-play, with ESPN's own time, replaces it. */
export function playFirstSeenAt(playId: string): number {
  let at = firstSeen.get(playId);
  if (at === undefined) {
    at = Date.now();
    firstSeen.set(playId, at);
  }
  return at;
}

/** The scoreboard's latest play, shaped like a summary play so it can sit in the feed until the summary catches up. */
export function playFromLastPlay(gameId: string, last: LastPlay, seenAt: number): GamePlay {
  return {
    id: last.id,
    gameId,
    sequence: Number.MAX_SAFE_INTEGER,
    text: cleanPlayText(last.text),
    type: last.type,
    period: 0,
    clock: "",
    offense: last.team,
    scoring: last.scoreValue > 0,
    turnover: /interception|fumble recovery \(opponent\)/i.test(last.type),
    yards: 0,
    redZone: false,
    downDistance: null,
    at: seenAt,
  };
}

/** A starter the feed is watching for. */
export interface FeedCandidate {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
}

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * How ESPN abbreviates a player in play text: first initial, up to three
 * more letters when two players share an initial and surname ("Jos.Allen"),
 * a period, then the surname — "Amon-Ra St. Brown" is "A.St. Brown",
 * "Kenneth Walker III" is "K.Walker". Null for a name with no surname.
 */
export function playTextNamePattern(fullName: string): RegExp | null {
  const parts = fullName.trim().split(/\s+/);
  while (parts.length > 2 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  if (parts.length < 2) return null;
  const initial = parts[0][0];
  if (!initial || !/[A-Za-z]/.test(initial)) return null;
  const surname = parts.slice(1).join(" ");
  return new RegExp(`(?<![A-Za-z.'])${escapeRegExp(initial.toUpperCase())}[A-Za-z']{0,3}\\.\\s?${escapeRegExp(surname)}(?![A-Za-z])`);
}

// The defense's plays a fantasy D/ST scores on.
const DEFENSIVE_TYPES = /sack|interception|fumble recovery \(opponent\)|safety|blocked|fumble return|defensive/i;

/**
 * Which of these starters a play involved. Players are found by name in the
 * play text, leaving out tacklers and other defenders (ESPN lists them in
 * parentheses and brackets), and only for the team that had the ball — so a
 * same-named defender on the other side doesn't count. A team defense (DEF)
 * is in on the other team's sacks, takeaways and safeties.
 */
export function playersInPlay(play: GamePlay, candidates: FeedCandidate[]): FeedCandidate[] {
  const actors = play.text.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  const out: FeedCandidate[] = [];
  for (const c of candidates) {
    if (c.position === "DEF") {
      if (play.offense && c.team && c.team !== play.offense && (play.turnover || DEFENSIVE_TYPES.test(play.type))) out.push(c);
      continue;
    }
    if (play.offense && c.team && c.team !== play.offense) continue;
    const pattern = playTextNamePattern(c.name);
    if (pattern && pattern.test(actors)) out.push(c);
  }
  return out;
}

/**
 * Everyone a play's line names as doing something — "B.Mayfield", "M.Evans",
 * "A.St. Brown" — leaving out tacklers and other defenders in parentheses and
 * brackets, and names tied to a team ("PENALTY on PIT-D.Metcalf", "RECOVERED
 * by MIA-J.Phillips"). Each comes back as a stand-in starter on the team with
 * the ball, ready for pprPointsForPlay, so anyone's play can be scored the same
 * way your own players' are.
 */
export function playTextActors(play: GamePlay): { label: string; candidate: FeedCandidate }[] {
  const text = play.text.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  const out: { label: string; candidate: FeedCandidate }[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(?<![A-Za-z.'-])([A-Z][A-Za-z']{0,3})\.\s?((?:St\.\s)?[A-Z][A-Za-z'-]+)/g)) {
    const label = `${m[1]}.${m[2]}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      label,
      candidate: { playerId: `${play.offense ?? ""}:${label}`, name: `${m[1]} ${m[2]}`, position: "", team: play.offense },
    });
  }
  return out;
}

/** A play's "big play" marks, for the feed's filter and badges. */
export function isBigPlay(play: GamePlay): boolean {
  return play.scoring || play.turnover || play.yards >= 20 || play.redZone;
}

const summaryCache = new Map<string, { fetchedAt: number; promise: Promise<GamePlay[] | null> }>();

/**
 * A game's plays, from ESPN's summary. Reuses a copy fetched within
 * `ttlSeconds` (Infinity for a finished game). Null when the fetch failed,
 * so the caller can keep what it had.
 */
export function getGamePlays(gameId: string, ttlSeconds: number): Promise<GamePlay[] | null> {
  const cached = summaryCache.get(gameId);
  if (cached && Date.now() - cached.fetchedAt < ttlSeconds * 1000) return cached.promise;
  const promise = (async () => {
    try {
      const res = await fetch(`${SUMMARY_URL}?event=${encodeURIComponent(gameId)}`);
      if (!res.ok) return null;
      return parseSummaryPlays(gameId, await res.json());
    } catch {
      return null;
    }
  })();
  summaryCache.set(gameId, { fetchedAt: Date.now(), promise });
  promise.then((plays) => {
    if (plays === null && summaryCache.get(gameId)?.promise === promise) summaryCache.delete(gameId);
  });
  return promise;
}
