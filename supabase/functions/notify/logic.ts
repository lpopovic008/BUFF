// What the notify function (see index.ts) tells each person, worked out from the week as it stands: their leagues
// (from Sleeper), the NFL's games and plays (from ESPN), and every player's team and injury (from Sleeper). Nothing
// here fetches or sends — it only decides — so it's tested on its own (src/lib/notify-logic.test.ts).
//
// Each notification has a key, unique to what it's about, so the same one is never sent twice (see push_sent in
// supabase/push.sql); and a kind, so each can be switched off (see the app's Settings → Notifications).
//
// ESPN names players in its plays only by its shorthand ("J.Allen"), so a play's players are found by name, on the
// team with the ball — the same way the app's Red Zone finds them (src/lib/play-by-play.ts, whose matching this
// copies: an Edge Function can't reach the app's own code).

export type NoteKind = "scoring" | "lineup" | "results" | "trades";

export interface Note {
  key: string;
  kind: NoteKind;
  title: string;
  body: string;
  /** Where in the app tapping it opens. */
  path: string;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  team: string | null;
  /** Sleeper's injury status: "Questionable", "Doubtful", "Out", "IR", "Sus", "PUP"… — null when healthy. */
  injury?: string | null;
}

export interface Game {
  id: string;
  home: string;
  away: string;
  state: "pre" | "in" | "post";
  /** Kickoff, in ms. */
  kickoff: number;
}

export interface Play {
  id: string;
  gameId: string;
  text: string;
  type: string;
  /** The team with the ball. */
  offense: string | null;
  scoring: boolean;
  turnover: boolean;
  /** When it happened, in ms, if ESPN said. */
  at: number | null;
}

export interface Trade {
  id: string;
  created: number;
  rosterIds: number[];
  /** Player id → the roster that got him. */
  adds: Record<string, number>;
  picks: { season: string; round: number; ownerId: number }[];
}

/** One of a person's leagues, as it stands this week. */
export interface LeagueWeek {
  leagueId: string;
  name: string;
  week: number;
  myRosterId: number | null;
  /** Roster id → its team's name. */
  teams: Record<number, string>;
  /** Your starters ("0" an empty spot). */
  starters: string[];
  /** Every roster's matchup this week, and its points so far. */
  matchups: { rosterId: number; matchupId: number | null; points: number }[];
  trades: Trade[];
}

// ---- Plays

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How ESPN shortens a player in a play: "J.Allen", "Jos.Allen", "A.St. Brown". */
export function shortNamePattern(fullName: string): RegExp | null {
  const parts = fullName.trim().split(/\s+/);
  while (parts.length > 2 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  if (parts.length < 2 || !/[A-Za-z]/.test(parts[0][0] ?? "")) return null;
  const surname = parts.slice(1).join(" ");
  return new RegExp(`(?<![A-Za-z.'])${escapeRegExp(parts[0][0].toUpperCase())}[A-Za-z']{0,3}\\.\\s?${escapeRegExp(surname)}(?![A-Za-z])`);
}

/** A play's line from where the play starts: what's in parentheses or brackets (tacklers, formations) left out. */
function actors(text: string): string {
  const afterReview = /\bREVERSED\.\s*/i.exec(text);
  return (afterReview ? text.slice(afterReview.index + afterReview[0].length) : text).replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
}

const DEFENSIVE = /sack|interception|fumble recovery \(opponent\)|safety|blocked|fumble return|defensive/i;

/** Which of these players a play was by: on the team with the ball, by name; a team's defense on the other's. */
export function playersIn(play: Play, players: Player[]): Player[] {
  const text = actors(play.text);
  return players.filter((p) => {
    if (p.position === "DEF") return !!play.offense && !!p.team && p.team !== play.offense && (play.turnover || DEFENSIVE.test(play.type));
    if (play.offense && p.team && p.team !== play.offense) return false;
    return shortNamePattern(p.name)?.test(text) ?? false;
  });
}

const leagueList = (names: string[]) => (names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(" and "));

/**
 * A touchdown, field goal or turnover by any of your starters, in any league — one notification a play and player,
 * naming every league he starts in. Only plays from the last `withinMs` (so turning notifications on mid-game
 * doesn't bring the whole game's plays at once).
 */
export function scoringNotes(plays: Play[], starters: Map<string, { player: Player; leagues: string[] }>, now: number, withinMs = 15 * 60_000): Note[] {
  const pool = [...starters.values()].map((s) => s.player);
  const out: Note[] = [];
  for (const play of plays) {
    if (!(play.scoring || play.turnover)) continue;
    if (play.at !== null && now - play.at > withinMs) continue;
    for (const p of playersIn(play, pool)) {
      const s = starters.get(p.id)!;
      const td = /touchdown/i.test(play.text);
      const what = p.position === "DEF" ? (td ? "Defensive touchdown!" : play.turnover ? "Takeaway!" : "Big play") : play.turnover ? "Turnover" : td ? "Touchdown!" : /field goal/i.test(play.type + play.text) ? "Field goal" : "Scores";
      out.push({
        key: `play:${play.id}:${p.id}`,
        kind: "scoring",
        title: `${p.position === "DEF" ? `${p.team} D/ST` : p.name} — ${what}`,
        body: `${play.text.replace(/\s+/g, " ").trim()} · ${leagueList(s.leagues)}`,
        path: "/",
      });
    }
  }
  return out;
}

// ---- Lineups

const OUT_STATUSES = new Set(["Out", "IR", "Doubtful", "Sus", "Suspended", "PUP", "NA", "DNR", "COV"]);
const HOUR = 3_600_000;

/**
 * Your starters in a league who won't (or may not) play this week, before their game: out, on IR, doubtful or
 * suspended; on a bye; off any team; or an empty spot — and, from three hours before kickoff, questionable.
 */
export function lineupNotes(league: LeagueWeek, players: Map<string, Player>, games: Game[], now: number): Note[] {
  if (league.myRosterId === null) return [];
  const gameOf = (team: string | null) => games.find((g) => team !== null && (g.home === team || g.away === team)) ?? null;
  const out: Note[] = [];
  const path = `/league?id=${encodeURIComponent(league.leagueId)}`;
  league.starters.forEach((id, slot) => {
    if (id === "0" || !id) {
      out.push({ key: `lineup:${league.leagueId}:${league.week}:empty:${slot}`, kind: "lineup", title: `${league.name}: an empty spot`, body: "Your lineup has a spot with no one in it.", path });
      return;
    }
    const p = players.get(id);
    if (!p) return;
    const game = gameOf(p.team);
    // Too late to change him once his game's on.
    if (game && game.state !== "pre") return;
    let problem: string | null = null;
    if (!p.team) problem = "isn't on a team";
    else if (!game) problem = "is on a bye";
    else if (p.injury && OUT_STATUSES.has(p.injury)) problem = `is ${p.injury === "Sus" ? "suspended" : p.injury}`;
    else if (p.injury === "Questionable" && game.kickoff - now <= 3 * HOUR) problem = "is questionable";
    if (!problem) return;
    out.push({
      key: `lineup:${league.leagueId}:${league.week}:${id}:${problem}`,
      kind: "lineup",
      title: `${league.name}: ${p.name} ${problem}`,
      body: `${p.name} is in your starting lineup${game ? ` — kickoff ${new Date(game.kickoff).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET` : ""}.`,
      path,
    });
  });
  return out;
}

// ---- Results

/** The day (Eastern time) a game kicks off on, as a number. */
const easternDay = (ms: number) => Math.floor((ms - 5 * HOUR) / (24 * HOUR));
const pts = (n: number) => n.toFixed(2).replace(/\.?0+$/, "") || "0";

/**
 * Your matchup in a league: once the week's every game is over, how it ended; and while only its last day's games are
 * left (Monday night, say), a heads-up if it's within `close` points.
 */
export function resultNotes(league: LeagueWeek, games: Game[], close = 15): Note[] {
  if (league.myRosterId === null || games.length === 0) return [];
  const mine = league.matchups.find((m) => m.rosterId === league.myRosterId);
  if (!mine || mine.matchupId === null) return [];
  const them = league.matchups.find((m) => m.matchupId === mine.matchupId && m.rosterId !== mine.rosterId);
  if (!them) return [];
  const opponent = league.teams[them.rosterId] ?? "your opponent";
  const path = `/league?id=${encodeURIComponent(league.leagueId)}`;
  const margin = mine.points - them.points;
  if (games.every((g) => g.state === "post")) {
    const result = margin > 0 ? "Won" : margin < 0 ? "Lost" : "Tied";
    return [{ key: `result:${league.leagueId}:${league.week}`, kind: "results", title: `${league.name}: ${result} ${pts(mine.points)}–${pts(them.points)}`, body: `Week ${league.week} against ${opponent} is final.`, path }];
  }
  const lastDay = Math.max(...games.map((g) => easternDay(g.kickoff)));
  const earlierDone = games.filter((g) => easternDay(g.kickoff) < lastDay).every((g) => g.state === "post");
  if (earlierDone && Math.abs(margin) <= close) {
    const where = margin > 0 ? `up ${pts(margin)}` : margin < 0 ? `down ${pts(-margin)}` : "tied";
    return [{ key: `close:${league.leagueId}:${league.week}`, kind: "results", title: `${league.name}: a close one`, body: `You're ${where} on ${opponent} with the week's last games to go.`, path }];
  }
  return [];
}

// ---- Trades

/** Every trade made in a league in the last two days — who got whom, side by side. */
export function tradeNotes(league: LeagueWeek, players: Map<string, Player>, now: number, withinMs = 48 * HOUR): Note[] {
  return league.trades
    .filter((t) => now - t.created <= withinMs)
    .map((t) => {
      const sides = t.rosterIds.map((r) => {
        const got = [
          ...Object.entries(t.adds)
            .filter(([, to]) => to === r)
            .map(([id]) => players.get(id)?.name ?? "a player"),
          ...t.picks.filter((p) => p.ownerId === r).map((p) => `a ${p.season} round ${p.round} pick`),
        ];
        return `${league.teams[r] ?? "A team"} get ${got.length ? got.join(", ") : "nothing"}`;
      });
      return { key: `trade:${league.leagueId}:${t.id}`, kind: "trades" as const, title: `${league.name}: a trade`, body: sides.join(" · "), path: "/monitor" };
    });
}
