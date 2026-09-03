"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MenuIcon } from "@/components/ui/Icon";
import { HeadToHeadRecord, WarRoomData, WarRoomLineupPlayer, WarRoomManager } from "@/lib/warroom-data";
import {
  circlePoints,
  clamp,
  formClass,
  gaugeDeg,
  heartbeatTile,
  ledClass,
  momentumPoints,
  radarAxisPoint,
  radarPoints,
  slotLabel,
  tileToPoints,
  vitalsColorVar,
} from "@/lib/warroom-math";
import { TEAM_CITIES, US_MAP_VIEWBOX, US_OUTLINE_PATH, US_STATE_LINES_PATH } from "@/lib/warroom-team-cities";
import { TrackedPlayer, useLiveScoringFeed } from "@/hooks/useLiveScoringFeed";
import { useTodaysGames } from "@/hooks/useTodaysGames";
import { AllTimeRecord, useAllTimeHeadToHead } from "@/hooks/useAllTimeHeadToHead";
import { NFLGame } from "@/lib/nfl-schedule";
import rawPlayerProps from "@/data/player-props.json";
import { PlayerPropsSnapshot } from "@/lib/player-props";
import { LineupPropProjection, projectLineupFromProps, PropPointsLine } from "@/lib/fantasy-points-from-props";
import "./warroom.css";

const playerPropsSnapshot = rawPlayerProps as unknown as PlayerPropsSnapshot;

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** The chip's headline number — a book's over/under line, or (ANY TD, which has no line) the implied scoring probability. */
function propChipValue(line: PropPointsLine): string {
  if (line.point != null) return String(line.point);
  if (line.impliedProbabilityPct != null) return `${line.impliedProbabilityPct}%`;
  return "—";
}

/** Odds string — a paired Over/Under, or (ANY TD, single-sided) just the one price. */
function propChipOdds(line: PropPointsLine): string {
  if (line.underOdds == null) return formatOdds(line.overOdds);
  return `O ${formatOdds(line.overOdds)} / U ${formatOdds(line.underOdds)}`;
}

/** One team's half of the SBK-01 card — every starter's prop lines, converted to fantasy points. Shared so "you" and the real opponent render identically. */
function PropsColumn({
  label,
  variant,
  projection,
}: {
  label: string;
  variant: "you" | "opp";
  projection: { players: LineupPropProjection[]; totalFantasyPoints: number };
}) {
  return (
    <div className="props-column">
      <div className={`props-column-label ${variant}`}>{label}</div>
      <div className="props-list">
        {projection.players.map((p) => (
          <div className={`props-row${p.matched ? "" : " unmatched"}`} key={p.playerId}>
            <div className="props-row-head">
              <span className="props-slot">{p.slot}</span>
              <span className="props-name">{p.name}</span>
              {p.matched ? (
                <span className="props-matchup">
                  {p.awayTeam} @ {p.homeTeam}
                </span>
              ) : null}
              <span className="props-total">{p.matched ? `${p.totalFantasyPoints.toFixed(1)} PTS` : "NO LINES"}</span>
            </div>
            {p.matched && p.lines.length > 0 ? (
              <div className="props-chips">
                {p.lines.map((line) => (
                  <span className="props-chip" key={line.market} title={`${line.bookmaker} · ${line.fantasyPoints.toFixed(2)} pts`}>
                    <span className="props-chip-label">{line.label}</span>
                    <span className="props-chip-value">{propChipValue(line)}</span>
                    <span className="props-chip-odds">{propChipOdds(line)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const RADAR_LABELS = ["QB", "RB", "WR", "TE"] as const;

// Typical recurring NFL kickoff slots, read in the viewer's local time as a
// stand-in for Eastern — Sleeper's API has no per-game schedule to read real
// kickoff times from, so this is deliberately an approximation (same as the
// original design note), not a fetch of this week's actual game times.
const WINDOW_DEFS = [
  { weekday: 4, hour: 20, minute: 15, label: "THURSDAY NIGHT" },
  { weekday: 0, hour: 13, minute: 0, label: "EARLY WINDOW" },
  { weekday: 0, hour: 16, minute: 5, label: "AFTERNOON WINDOW" },
  { weekday: 0, hour: 20, minute: 20, label: "SUNDAY NIGHT" },
  { weekday: 1, hour: 20, minute: 15, label: "MONDAY NIGHT" },
];

function nextOccurrence(from: Date, weekday: number, hour: number, minute: number): number {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 7);
  return d.getTime();
}

function buildWindows(mountedAt: Date): { label: string; at: number }[] {
  const windows: { label: string; at: number }[] = [];
  for (let week = 0; week < 2; week++) {
    for (const w of WINDOW_DEFS) {
      const base = new Date(mountedAt.getTime() + week * 7 * 86400000);
      windows.push({ label: w.label, at: nextOccurrence(base, w.weekday, w.hour, w.minute) });
    }
  }
  return windows.sort((a, b) => a.at - b.at);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function gameStatusLabel(game: NFLGame): string {
  if (game.state === "post") return `FINAL ${game.awayScore}-${game.homeScore}`;
  if (game.state === "in") return `LIVE ${game.awayScore}-${game.homeScore}`;
  const kickoff = new Date(game.kickoff);
  if (Number.isNaN(kickoff.getTime())) return "Kickoff TBD";
  return kickoff.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** A manager's Sleeper profile photo — falls back to their initial (no avatar set, or the CDN image fails to load) inside the same styled square, whatever `className` is passed. */
function ManagerAvatar({ url, initial, name, className }: { url: string | null; initial: string; name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <div className={className}>{initial}</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} className={className} />
  );
}

function GaugeDial({ label, youVal, cmpVal }: { label: string; youVal: number; cmpVal: number }) {
  return (
    <div className="gauge">
      <svg className="gauge-svg" viewBox="0 0 120 120" aria-hidden="true">
        <circle
          className="gauge-track"
          cx="60"
          cy="60"
          r="46"
          strokeDasharray="216.7 72.3"
          transform="rotate(135 60 60)"
        />
        <line
          className="gauge-needle cmp"
          x1="60"
          y1="60"
          x2="60"
          y2="24"
          transform={`rotate(${gaugeDeg(cmpVal)} 60 60)`}
        />
        <line
          className="gauge-needle you"
          x1="60"
          y1="60"
          x2="60"
          y2="20"
          transform={`rotate(${gaugeDeg(youVal)} 60 60)`}
        />
        <circle className="gauge-hub" cx="60" cy="60" r="4" />
      </svg>
      <div className="gauge-value">
        {youVal}
        <span style={{ color: "var(--ink-dim)", fontSize: "9px" }}>%</span>
      </div>
      <div className="gauge-label">{label}</div>
    </div>
  );
}

function headToHeadReadout(you: WarRoomManager, selected: WarRoomManager): string {
  const rec = you.headToHead.get(selected.rosterId);
  const name = selected.name.toUpperCase();
  const youName = you.name.toUpperCase();
  if (!rec || (rec.wins === 0 && rec.losses === 0)) return `${youName} & ${name}: HAVEN'T PLAYED YET`;
  if (rec.wins > rec.losses) return `${youName} LEADS ${name} ${rec.wins}-${rec.losses}`;
  if (rec.losses > rec.wins) return `${name} LEADS ${youName} ${rec.losses}-${rec.wins}`;
  return `${youName} & ${name}: TIED ${rec.wins}-${rec.losses}`;
}

/** "VS YOU: 3-2" — the selected manager's all-time win-loss record against you, across every linked season. */
function vsYouTag(you: WarRoomManager, selected: WarRoomManager, allTimeH2H: Map<string, Map<string, AllTimeRecord>>): string {
  const rec = selected.ownerId && you.ownerId ? allTimeH2H.get(selected.ownerId)?.get(you.ownerId) : undefined;
  if (!rec || (rec.wins === 0 && rec.losses === 0)) return "VS YOU: 0-0";
  return `VS YOU: ${rec.wins}-${rec.losses}`;
}

export interface LeagueOption {
  leagueId: string;
  leagueName: string;
}

export interface WarRoomConsoleProps {
  data: WarRoomData;
  leagueOptions: LeagueOption[];
  currentLeagueId: string;
  onLeagueChange: (leagueId: string) => void;
  /** True during the NFL preseason, when there's no real fantasy week to show yet. */
  isPreseason: boolean;
  /** Which preseason week it is (1-3ish) — Sleeper's own `week` counter during the preseason. Null once the regular season starts. */
  preseasonWeek: number | null;
  /** Your record summed across every league tracked in Settings, not just the one showing. */
  totalRecord: { wins: number; losses: number; ties: number };
}

export function WarRoomConsole({
  data,
  leagueOptions,
  currentLeagueId,
  onLeagueChange,
  isPreseason,
  preseasonWeek,
  totalRecord,
}: WarRoomConsoleProps) {
  // Default the Dossier to this week's real opponent rather than always the
  // first manager. Re-synced (via the render-time reset pattern below,
  // rather than an effect) whenever the league or the matchup itself
  // changes — data.week only advances once Sleeper rolls the matchup over
  // (Tuesday), so this holds through the whole game and re-targets
  // automatically once the next one starts, while still letting PREV/NEXT
  // freely browse other managers in between.
  const opponentIdx = data.others.findIndex((m) => m.rosterId === data.you.opponentRosterId);
  const defaultSelectedIdx = opponentIdx >= 0 ? opponentIdx : 0;
  const matchupKey = `${data.leagueId}:${data.week}`;
  const [selectedIdx, setSelectedIdx] = useState(defaultSelectedIdx);
  const [syncedMatchupKey, setSyncedMatchupKey] = useState(matchupKey);
  if (matchupKey !== syncedMatchupKey) {
    setSyncedMatchupKey(matchupKey);
    setSelectedIdx(defaultSelectedIdx);
  }

  const [menuOpen, setMenuOpen] = useState(false);
  const [feedMode, setFeedMode] = useState<"transactions" | "live">("transactions");
  const [openGameId, setOpenGameId] = useState<string | null>(null);
  const [hoveredGameId, setHoveredGameId] = useState<string | null>(null);
  const todaysGames = useTodaysGames();
  const allTimeH2H = useAllTimeHeadToHead(data.leagueId);
  // Deferred to an effect (rather than a lazy initializer) so the initial
  // static-export prerender and the first client render agree on markup —
  // Date.now() only runs after mount, once we're client-side for good.
  const [now, setNow] = useState<number | null>(null);
  const windows = useMemo(() => buildWindows(new Date()), []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { you, others } = data;
  const selected = others[selectedIdx % Math.max(1, others.length)] ?? you;

  // Sportsbook-implied fantasy points for the chosen league's own starting
  // lineup — each starter's prop lines (from Pinnacle, via The Odds API)
  // weighed by this league's real scoring settings. See
  // fantasy-points-from-props.ts; recomputed whenever the league (and so
  // its lineup/scoring) changes.
  const propProjection = useMemo(
    () => projectLineupFromProps(you.lineup, playerPropsSnapshot, data.scoringSettings),
    [you.lineup, data.scoringSettings]
  );

  // Your real weekly matchup opponent — not whichever manager the Dossier's
  // PREV/NEXT is currently comparing you against — since the live scoring
  // zone is specifically about the game you're actually playing this week.
  const realOpponent = others.find((m) => m.rosterId === you.opponentRosterId) ?? null;

  // Same sportsbook-implied projection, run for the actual weekly opponent's
  // starting lineup, so SBK-01 can show a real head-to-head comparison
  // instead of just your own total.
  const opponentPropProjection = useMemo(
    () => (realOpponent ? projectLineupFromProps(realOpponent.lineup, playerPropsSnapshot, data.scoringSettings) : null),
    [realOpponent, data.scoringSettings]
  );
  const tracked: TrackedPlayer[] = [
    ...you.lineup
      .filter((p) => p.playerId)
      .map((p) => ({ playerId: p.playerId, name: p.name, team: "you" as const, actual: p.actual })),
    ...(realOpponent?.lineup ?? [])
      .filter((p) => p.playerId)
      .map((p) => ({ playerId: p.playerId, name: p.name, team: "cmp" as const, actual: p.actual })),
  ];
  const liveEvents = useLiveScoringFeed(data.leagueId, data.week, tracked, feedMode === "live");

  if (others.length === 0) {
    return (
      <div className="warroom-console">
        <div className="wrap">
          <p className="card-note">Need at least one other team in the league to populate the War Room.</p>
        </div>
      </div>
    );
  }

  const allManagers = [you, ...others];
  // Every team's projected-score rank (0 = highest), for the Threat Sweep
  // sonar — rank drives radius (biggest threat closest to center), while
  // each team keeps a stable angle by its position in allManagers.
  const sonarRankByRoster = new Map(
    [...allManagers].sort((a, b) => b.projectedFinal - a.projectedFinal).map((m, rank) => [m.rosterId, rank])
  );
  // *1.12 so the tallest bar/projected-final marker never sits flush
  // against the track's top edge, where .scoreboard's overflow:hidden
  // clips it off.
  const scoreboardMax = Math.max(1, ...allManagers.flatMap((m) => [m.livePoints, m.projectedFinal])) * 1.12;
  const heatWeekCount = you.seasonForm.length;

  let wIndex = 0;
  if (now != null) {
    const idx = windows.findIndex((w) => w.at > now);
    wIndex = idx === -1 ? 0 : idx;
  }
  const remain = now != null ? Math.max(0, windows[wIndex].at - now) : 0;
  const clockStr = `${pad(Math.floor(remain / 86400000))}:${pad(Math.floor(remain / 3600000) % 24)}:${pad(
    Math.floor(remain / 60000) % 60
  )}:${pad(Math.floor(remain / 1000) % 60)}`;

  const webNodes = circlePoints(allManagers.length, 75, 75, 56);
  const webMaxWins = Math.max(1, ...allManagers.map((m) => m.wins));
  const webEdges: { a: number; b: number; margin: number; involvesYou: boolean; involvesSel: boolean }[] = [];
  for (let i = 0; i < allManagers.length; i++) {
    for (let j = i + 1; j < allManagers.length; j++) {
      const rec: HeadToHeadRecord | undefined = allManagers[i].headToHead.get(allManagers[j].rosterId);
      if (!rec || rec.wins === rec.losses) continue;
      const [winnerIdx, loserIdx] = rec.wins > rec.losses ? [i, j] : [j, i];
      webEdges.push({
        a: winnerIdx,
        b: loserIdx,
        margin: Math.abs(rec.lastMargin ?? 0),
        involvesYou: winnerIdx === 0 || loserIdx === 0,
        involvesSel: winnerIdx === selectedIdx + 1 || loserIdx === selectedIdx + 1,
      });
    }
  }

  return (
    <div className="warroom-console">
      <div className="wrap">
        <header className="console-head-top">
          <div className="console-head-left">
            <span className="badge">BUFF WAR ROOM</span>
          </div>
          <div className="console-head-center">
            <span className="week-badge">
              {isPreseason ? `PRE WEEK ${preseasonWeek ?? 1}` : `WEEK ${data.week}`}
            </span>
          </div>
          <div className="console-menu">
            <span className="status-strip">
              {totalRecord.wins}-{totalRecord.losses}
              {totalRecord.ties ? `-${totalRecord.ties}` : ""}
            </span>
            <button
              className="console-menu-btn"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MenuIcon />
            </button>
            {menuOpen ? (
              <nav className="console-menu-dropdown">
                <Link href={`/league?id=${data.leagueId}`} onClick={() => setMenuOpen(false)}>
                  League
                </Link>
                <Link href="/values" onClick={() => setMenuOpen(false)}>
                  Values
                </Link>
                <Link href="/draft" onClick={() => setMenuOpen(false)}>
                  Draft
                </Link>
                <Link href="/settings" onClick={() => setMenuOpen(false)}>
                  Settings
                </Link>
              </nav>
            ) : null}
          </div>
        </header>

        <div className="clock-banner">
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="clock-left">
            <span className="clock-eyebrow">IDT-02 · MISSION CLOCK</span>
            <span className="clock-caption">NEXT: {windows[wIndex]?.label ?? "—"}</span>
          </div>
          <div className="clock-value">{now == null ? "--:--:--:--" : clockStr}</div>
          <div className="clock-windows">
            {windows.slice(0, 5).map((w, i) => (
              <span key={i} className={`clock-dot${i === wIndex ? " current" : ""}${i < wIndex ? " passed" : ""}`} />
            ))}
          </div>
        </div>

        <div className="console-body">
          <article className="card span-3">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">IDT-01</span>
                <span className="card-title">Manager Dossier</span>
              </div>
              <div className="card-flags"><span className="flag cmp">↔ DRIVES COMPARE</span></div>
            </div>
            <div className="league-picker">
              <span className="league-picker-label">LEAGUE</span>
              <select
                className="league-select"
                value={currentLeagueId}
                onChange={(e) => onLeagueChange(e.target.value)}
              >
                {leagueOptions.map((opt) => (
                  <option key={opt.leagueId} value={opt.leagueId}>
                    {opt.leagueName}
                  </option>
                ))}
              </select>
            </div>
            <div className="dossier-panes">
              <div className="dossier-pane you">
                <ManagerAvatar url={you.avatarUrl} initial={you.initial} name={you.name} className="dossier-photo" />
                <div className="dossier-info">
                  <span className="name">{you.name}</span>
                  <span>{you.wins}-{you.losses}{you.ties ? `-${you.ties}` : ""}</span>
                  <span className="dossier-tag you">YOU · ALWAYS SHOWN</span>
                </div>
              </div>
              <div className="dossier-pane cmp">
                <ManagerAvatar url={selected.avatarUrl} initial={selected.initial} name={selected.name} className="dossier-photo" />
                <div className="dossier-info">
                  <span className="name">{selected.name}</span>
                  <span>{selected.wins}-{selected.losses}{selected.ties ? `-${selected.ties}` : ""}</span>
                  <span className="dossier-tag cmp">{vsYouTag(you, selected, allTimeH2H)}</span>
                </div>
              </div>
            </div>
            <div className="dossier-controls">
              <span className="flip-label">FLIP THROUGH MANAGERS</span>
              <div className="ctrl-row">
                <button
                  className="ctrl-btn"
                  onClick={() => setSelectedIdx((i) => (i - 1 + others.length) % others.length)}
                >
                  ‹ PREV
                </button>
                <button
                  className="ctrl-btn"
                  onClick={() => setSelectedIdx((i) => (i + 1) % others.length)}
                >
                  NEXT ›
                </button>
              </div>
            </div>
            <p className="card-note">Pick a league above; flip managers to compare them below.</p>
          </article>

          <article className="card span-6">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">VIT-04</span>
                <span className="card-title">Live Momentum</span>
              </div>
              <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ COMPARES</span></div>
            </div>
            <svg className="momentum-svg" viewBox="0 0 620 140" preserveAspectRatio="none" aria-hidden="true">
              <line className="momentum-zero" x1="0" y1="70" x2="620" y2="70" />
              <polyline className="momentum-cmp" points={momentumPoints(selected.momentum, 620, 140, 3.0)} />
              <polyline
                className={`momentum-you${you.momentum.at(-1)! < 0 ? " losing" : ""}`}
                points={momentumPoints(you.momentum, 620, 140, 3.0)}
              />
              <circle
                className={`momentum-dot${you.momentum.at(-1)! < 0 ? " losing" : ""}`}
                r="4.5"
                cx="620"
                cy={70 - you.momentum.at(-1)! * 3.0}
              />
            </svg>
            <div className="momentum-legend">
              <span className="you">{you.name.toUpperCase()} — point differential vs your opponent</span>
              <span className="cmp">{selected.name.toUpperCase()} — point differential vs their opponent</span>
            </div>
            <p className="card-note">Kickoff to now&rsquo;s margin. Above = winning, below = losing.</p>
          </article>

          <article className="card span-6">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">IDT-03</span>
                <span className="card-title">Lineup Status</span>
              </div>
              <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ COMPARES</span></div>
            </div>
            <div className="led-header led-row">
              <span />
              <span className="you">{you.name.toUpperCase()}</span>
              <span className="led-nums you">{you.projectedFinal.toFixed(1)}</span>
              <span className="led-nums you"><strong>{you.livePoints.toFixed(1)}</strong></span>
              <span />
              <span className="led-nums opp cmp"><strong>{selected.livePoints.toFixed(1)}</strong></span>
              <span className="led-nums opp cmp">{selected.projectedFinal.toFixed(1)}</span>
              <span className="cmp">{selected.name.toUpperCase()}</span>
              <span />
            </div>
            <div className="led-rows">
              {you.lineup.map((mine, i) => {
                const theirs = selected.lineup[i];
                return (
                  <div className="led-row" key={i}>
                    <span className={`led-dot ${ledClass(mine.expected, mine.actual, mine.actual > 0)}`} />
                    <span className="led-name">{mine.name}</span>
                    <span className="led-nums">{mine.expected.toFixed(1)}</span>
                    <span className="led-nums"><strong>{mine.actual.toFixed(1)}</strong></span>
                    <span className="led-slot">{slotLabel(mine.slot)}</span>
                    <span className="led-nums opp"><strong>{theirs.actual.toFixed(1)}</strong></span>
                    <span className="led-nums opp">{theirs.expected.toFixed(1)}</span>
                    <span className="led-name opp">{theirs.name}</span>
                    <span className={`led-dot ${ledClass(theirs.expected, theirs.actual, theirs.actual > 0)}`} />
                  </div>
                );
              })}
            </div>
            <p className="card-note">Green = beating projection, amber = on pace or not started, red = behind since kickoff.</p>
          </article>

          <article className="card span-3">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">VIT-02</span>
                <span className="card-title">Live Scoreboard</span>
              </div>
              <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ HIGHLIGHTS</span></div>
            </div>
            <div className="scoreboard">
              {allManagers.map((m, i) => {
                const isYou = i === 0;
                const isSel = !isYou && i - 1 === selectedIdx;
                return (
                  <div className={`score-col${isYou ? " you" : ""}${isSel ? " selected" : ""}`} key={m.rosterId}>
                    <div className="score-track">
                      <div className="score-bar" style={{ height: `${(m.livePoints / scoreboardMax) * 100}%` }} />
                      <div className="score-target" style={{ bottom: `${(m.projectedFinal / scoreboardMax) * 100}%` }} />
                    </div>
                    <div className="score-val">{m.livePoints.toFixed(1)}</div>
                    <ManagerAvatar url={m.avatarUrl} initial={m.initial} name={m.name} className="score-photo" />
                  </div>
                );
              })}
            </div>
            <p className="card-note">Live totals; dashed line marks each team&rsquo;s projected final. Cyan = selected manager.</p>
          </article>

          <article className="card span-3">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">SIG-04</span>
                <span className="card-title">Threat Sweep</span>
              </div>
              <div className="card-flags"><span className="flag live">LIVE</span></div>
            </div>
            <svg className="sonar-svg" viewBox="0 0 140 140" aria-hidden="true">
              <circle className="sonar-ring" cx="70" cy="70" r="14" />
              <circle className="sonar-ring" cx="70" cy="70" r="27" />
              <circle className="sonar-ring" cx="70" cy="70" r="41" />
              <circle className="sonar-ring" cx="70" cy="70" r="55" />
              <line className="sonar-ring" x1="15" y1="70" x2="125" y2="70" />
              <line className="sonar-ring" x1="70" y1="15" x2="70" y2="125" />
              <g className="sonar-sweep-group">
                <path d="M70,70 L70,15 A55,55 0 0,1 105.4,27.9 Z" fill="url(#sweepFade)" />
              </g>
              <defs>
                <linearGradient id="sweepFade" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#4dd2c9" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#4dd2c9" stopOpacity="0" />
                </linearGradient>
              </defs>
              {allManagers.map((m, i) => {
                const angle = ((i / allManagers.length) * 360 - 90) * (Math.PI / 180);
                const rank = sonarRankByRoster.get(m.rosterId) ?? 0;
                const r = allManagers.length > 1 ? 18 + (58 - 18) * (rank / (allManagers.length - 1)) : 18;
                const x = 70 + r * Math.cos(angle);
                const y = 70 + r * Math.sin(angle);
                // Label sits further out along the same center-through-dot ray,
                // so the dot is always between the center and its letter.
                const labelR = r + 7;
                const lx = 70 + labelR * Math.cos(angle);
                const ly = 70 + labelR * Math.sin(angle);
                const isYou = i === 0;
                return (
                  <g key={m.rosterId}>
                    <circle className={`sonar-blip${isYou ? " you" : ""}`} cx={x} cy={y} r="3.5">
                      <title>{`${m.name} — projected ${m.projectedFinal.toFixed(1)}`}</title>
                    </circle>
                    <text className="sonar-blip-label" x={lx} y={ly}>{m.initial}</text>
                  </g>
                );
              })}
            </svg>
            <p className="card-note">Every team this week, closest to center = highest projected.</p>
          </article>

          <article className="card span-6">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">VIT-03</span>
                <span className="card-title">{feedMode === "transactions" ? "Transaction Feed" : "Live Scoring Zone"}</span>
              </div>
              <div className="card-flags"><span className="flag live">LIVE</span></div>
            </div>
            <div className="feed-toggle">
              <button
                className={`ctrl-btn${feedMode === "transactions" ? " active" : ""}`}
                onClick={() => setFeedMode("transactions")}
              >
                TRANSACTIONS
              </button>
              <button className={`ctrl-btn${feedMode === "live" ? " active" : ""}`} onClick={() => setFeedMode("live")}>
                LIVE ZONE
              </button>
            </div>
            <div className="terminal">
              {feedMode === "transactions" ? (
                data.transactionSummaries.length === 0 ? (
                  <div>No moves logged yet this week<span className="cursor" /></div>
                ) : (
                  data.transactionSummaries.slice(0, 30).map((line, i) => <div key={i}>{line}</div>)
                )
              ) : liveEvents.length === 0 ? (
                <div>Watching for scoring plays<span className="cursor" /></div>
              ) : (
                liveEvents.map((e) => (
                  <div key={e.id} className={e.team === "you" ? "t-you" : "t-cmp"}>
                    {e.name} +{e.delta.toFixed(1)} pts ({e.total.toFixed(1)} total)
                  </div>
                ))
              )}
            </div>
            <p className="card-note">
              {feedMode === "transactions"
                ? "This week’s waiver, free-agent, and trade moves."
                : "Live scoring for your matchup, polled every 25s — Sleeper has no play-by-play feed, so this is built from repeated live-score checks. Amber = you, cyan = your opponent."}
            </p>
          </article>

          <article className="card span-6">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">TER-01</span>
                <span className="card-title">Territory Map</span>
              </div>
              <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ COMPARES</span></div>
            </div>
            <div className="usmap-wrap" onClick={() => setOpenGameId(null)}>
              <svg className="usmap-svg" viewBox={US_MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <path className="usmap-outline" d={US_OUTLINE_PATH} />
                <path className="usmap-state-line" d={US_STATE_LINES_PATH} />
                <g>
                  {todaysGames.map((g) => {
                    const pos = TEAM_CITIES[g.homeTeam]?.pos;
                    if (!pos) return null;
                    const shown = openGameId === g.id || hoveredGameId === g.id;
                    const inGame = (p: WarRoomLineupPlayer) => Boolean(p.playerId) && (p.team === g.homeTeam || p.team === g.awayTeam);
                    const playerCount = you.lineup.filter(inGame).length + selected.lineup.filter(inGame).length;
                    const baseR = clamp(2.5 + playerCount * 1.3, 2.5, 8);
                    return (
                      <circle
                        key={g.id}
                        className={`usmap-dot game${g.state === "in" ? " live" : ""}${shown ? " active" : ""}`}
                        cx={pos[0]}
                        cy={pos[1]}
                        r={shown ? baseR + 1.5 : baseR}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenGameId(openGameId === g.id ? null : g.id);
                        }}
                        onMouseEnter={() => setHoveredGameId(g.id)}
                        onMouseLeave={() => setHoveredGameId((h) => (h === g.id ? null : h))}
                        style={{ cursor: "pointer" }}
                      >
                        <title>{`${g.awayTeam} @ ${g.homeTeam} — ${gameStatusLabel(g)} — ${playerCount} player${playerCount === 1 ? "" : "s"} between you & ${selected.name}`}</title>
                      </circle>
                    );
                  })}
                </g>
              </svg>
              {openGameId ?? hoveredGameId
                ? (() => {
                    const game = todaysGames.find((g) => g.id === (openGameId ?? hoveredGameId));
                    if (!game) return null;
                    const pos = TEAM_CITIES[game.homeTeam]?.pos ?? [160, 100];
                    const inGame = (p: WarRoomLineupPlayer) => p.team === game.homeTeam || p.team === game.awayTeam;
                    const youPlayers = you.lineup.filter((p) => p.playerId && inGame(p));
                    const cmpPlayers = selected.lineup.filter((p) => p.playerId && inGame(p));
                    return (
                      <div
                        className="usmap-popup"
                        style={{ left: `${(pos[0] / 320) * 100}%`, top: `${(pos[1] / 200) * 100}%` }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="usmap-popup-close"
                          onClick={() => {
                            setOpenGameId(null);
                            setHoveredGameId(null);
                          }}
                          aria-label="Close"
                        >
                          ×
                        </button>
                        <div className="usmap-popup-title">
                          {game.awayTeam} @ {game.homeTeam}
                        </div>
                        <div className="usmap-popup-status">{gameStatusLabel(game)}</div>
                        {youPlayers.length > 0 ? (
                          <div className="usmap-popup-group">
                            <span className="usmap-popup-label you">{you.name.toUpperCase()}</span>
                            {youPlayers.map((p) => (
                              <div key={p.playerId}>{p.name}</div>
                            ))}
                          </div>
                        ) : null}
                        {cmpPlayers.length > 0 ? (
                          <div className="usmap-popup-group">
                            <span className="usmap-popup-label cmp">{selected.name.toUpperCase()}</span>
                            {cmpPlayers.map((p) => (
                              <div key={p.playerId}>{p.name}</div>
                            ))}
                          </div>
                        ) : null}
                        {youPlayers.length === 0 && cmpPlayers.length === 0 ? (
                          <div className="usmap-popup-empty">No highlighted players in this game.</div>
                        ) : null}
                      </div>
                    );
                  })()
                : null}
            </div>
            <div className="usmap-legend">
              <span className="you">Amber = live game</span>
              <span className="cmp">Click a dot for who&rsquo;s playing</span>
            </div>
            <p className="card-note">
              Every NFL game today. Dot size = players you and {selected.name} have in that game. Schedule &amp;
              scores from ESPN&rsquo;s public scoreboard — Sleeper has no schedule data of its own.
            </p>
          </article>

          <article className="card span-3">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">SIG-03</span>
                <span className="card-title">Head-to-Head Web</span>
              </div>
              <div className="card-flags"><span className="flag cmp">↔ HIGHLIGHTS</span></div>
            </div>
            <svg className="web-svg" viewBox="0 0 150 150" aria-hidden="true">
              <defs>
                <marker id="arrowNeutral" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--node-neutral)" />
                </marker>
                <marker id="arrowActive" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--cyan)" />
                </marker>
              </defs>
              <g>
                {webEdges.map((e, i) => {
                  const active = e.involvesYou && e.involvesSel;
                  return (
                    <line
                      key={i}
                      x1={webNodes[e.a].x}
                      y1={webNodes[e.a].y}
                      x2={webNodes[e.b].x}
                      y2={webNodes[e.b].y}
                      strokeWidth={0.9 + Math.min(e.margin / 26, 1) * 1.8}
                      className={`web-edge${active ? " active" : ""}`}
                      markerEnd={active ? "url(#arrowActive)" : "url(#arrowNeutral)"}
                      opacity={e.involvesYou || e.involvesSel ? 1 : 0.35}
                    >
                      <title>{`${allManagers[e.a].name} beat ${allManagers[e.b].name} by ${e.margin.toFixed(1)}`}</title>
                    </line>
                  );
                })}
              </g>
              <g>
                {webNodes.map((p, i) => {
                  let cls = "web-node";
                  if (i === 0) cls += " you";
                  else if (i === selectedIdx + 1) cls += " active";
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={4 + (allManagers[i].wins / webMaxWins) * 7}
                      className={cls}
                    >
                      <title>{`${allManagers[i].name} — ${allManagers[i].wins} win${allManagers[i].wins !== 1 ? "s" : ""} this season`}</title>
                    </circle>
                  );
                })}
              </g>
            </svg>
            <div className="rivalry-readout">{headToHeadReadout(you, selected)}</div>
            <p className="card-note">Arrow points to the loser. Bigger dot = more wins.</p>
          </article>

          <article className="card span-4">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">SIG-01</span>
                <span className="card-title">Live Performance</span>
              </div>
              <div className="card-flags"><span className="flag live">LIVE</span><span className="flag cmp">↔ COMPARES</span></div>
            </div>
            <div className="gauges">
              <GaugeDial label="VS PACE" youVal={you.vsPaceGauge} cmpVal={selected.vsPaceGauge} />
              <GaugeDial label="WIN CHANCE" youVal={you.winChance} cmpVal={selected.winChance} />
              <GaugeDial label="TOP SCORER" youVal={you.topScorerChance} cmpVal={selected.topScorerChance} />
            </div>
            <p className="card-note">Pace vs your average, win chance from projected final scores, top-score odds from live scores.</p>
          </article>

          <article className="card span-5">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">SIG-02</span>
                <span className="card-title">Positional Value</span>
              </div>
              <div className="card-flags"><span className="flag cmp">↔ COMPARES</span></div>
            </div>
            <svg className="radar-svg" viewBox="-10 -10 160 160" aria-hidden="true">
              <polygon className="radar-ring" points={radarPoints([100, 100, 100, 100], 55, 70, 70)} />
              <polygon className="radar-ring" points={radarPoints([50, 50, 50, 50], 55, 70, 70)} />
              {RADAR_LABELS.map((_, i) => {
                const [x, y] = radarAxisPoint(55, 70, 70, i);
                return <line key={i} className="radar-axis" x1="70" y1="70" x2={x} y2={y} />;
              })}
              <polygon
                className="radar-fill cmp"
                points={radarPoints(RADAR_LABELS.map((p) => selected.radar[p]), 55, 70, 70)}
              />
              <polygon
                className="radar-fill you"
                points={radarPoints(RADAR_LABELS.map((p) => you.radar[p]), 55, 70, 70)}
              />
              {RADAR_LABELS.map((label, i) => {
                const [x, y] = radarAxisPoint(65, 70, 70, i);
                return (
                  <text key={label} className="radar-label" x={x} y={y}>
                    {label}
                  </text>
                );
              })}
            </svg>
            <p className="card-note">League rank by KTC value at each position, 1st = outer edge. Amber = you, cyan = selected.</p>
          </article>

          <article className="card span-3">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">VIT-01</span>
                <span className="card-title">League Vitals</span>
              </div>
              <div className="card-flags"><span className="flag live">LIVE</span></div>
            </div>
            <div className="vitals-wrap">
              <div className="vitals-header-spacer" />
              <div>
                {allManagers.map((m, i) => {
                  const isYou = i === 0;
                  const isSel = !isYou && i - 1 === selectedIdx;
                  const color = vitalsColorVar(m.winChance);
                  const tile = heartbeatTile(m.winChance, 100);
                  return (
                    <div className={`vitals-row${isYou ? " you" : ""}${isSel ? " selected" : ""}`} key={m.rosterId}>
                      <span className="vitals-name">{m.username}</span>
                      <span className="vitals-mini">
                        <svg className="vitals-svg-el" viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true">
                          <g className="vitals-scroll">
                            <polyline
                              points={tileToPoints(tile, 0)}
                              fill="none"
                              stroke={color}
                              strokeWidth="1.75"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                            />
                            <polyline
                              points={tileToPoints(tile, 100)}
                              fill="none"
                              stroke={color}
                              strokeWidth="1.75"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                            />
                          </g>
                        </svg>
                        <span className="vitals-pct" style={{ color }}>{m.winChance}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="card-note">Estimated live win chance — taller, faster pulse = higher.</p>
          </article>

          <article className="card span-6">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">TER-02</span>
                <span className="card-title">Season Form</span>
              </div>
              <div className="card-flags"><span className="flag cmp">↔ HIGHLIGHTS</span></div>
            </div>
            <div className="heat-wrap">
              <div className="heat-weeks" style={{ gridTemplateColumns: `58px repeat(${heatWeekCount}, 1fr)` }}>
                <span />
                {Array.from({ length: heatWeekCount }, (_, i) => (
                  <span key={i}>W{i + 1}</span>
                ))}
              </div>
              <div>
                {allManagers.map((m, i) => {
                  const isYou = i === 0;
                  const isSel = !isYou && i - 1 === selectedIdx;
                  return (
                    <div
                      key={m.rosterId}
                      className={`heat-row${isYou ? " you" : ""}${isSel ? " selected" : ""}`}
                      style={{ gridTemplateColumns: `58px repeat(${heatWeekCount}, 1fr)` }}
                    >
                      <span className="heat-name">{m.name}</span>
                      {m.seasonForm.map((pct, w) => (
                        <div key={w} className={`heat-cell ${formClass(pct)}`} title={`${pct}%`} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="card-note">Cumulative win% by week.</p>
          </article>

          <article className="card span-9">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="card-head">
              <div className="card-head-left">
                <span className="card-index">SBK-01</span>
                <span className="card-title">Sportsbook Fantasy Points</span>
              </div>
              <div className="card-flags">
                <span className="flag you">{propProjection.totalFantasyPoints.toFixed(1)} PTS · {you.name.toUpperCase()}</span>
                {realOpponent && opponentPropProjection ? (
                  <span className="flag cmp">
                    {opponentPropProjection.totalFantasyPoints.toFixed(1)} PTS · {realOpponent.name.toUpperCase()}
                  </span>
                ) : null}
              </div>
            </div>
            {playerPropsSnapshot.players.length === 0 ? (
              <p className="card-note">
                No prop odds fetched yet — this fills in once the player-props pipeline runs (Pinnacle via The Odds API).
              </p>
            ) : (
              <>
                <div className="props-columns">
                  <PropsColumn label={you.name.toUpperCase()} variant="you" projection={propProjection} />
                  {realOpponent && opponentPropProjection ? (
                    <PropsColumn label={realOpponent.name.toUpperCase()} variant="opp" projection={opponentPropProjection} />
                  ) : (
                    <div className="props-column">
                      <div className="props-column-label opp">NO OPPONENT THIS WEEK</div>
                      <p className="card-note">This week has no scheduled matchup to compare against.</p>
                    </div>
                  )}
                </div>
                <p className="card-note">
                  Lines are Pinnacle&apos;s where posted (the sharpest book available through this feed), falling back to
                  BetOnline — labeled per chip. ANY TD shows the anytime-touchdown market&apos;s implied probability,
                  since that market has no over/under line. Fantasy points use {data.leagueName}&apos;s own scoring
                  settings. Updated {playerPropsSnapshot.updatedAt ? new Date(playerPropsSnapshot.updatedAt).toLocaleString() : "—"}.
                </p>
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
