"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { LeagueLegendEntry, LeagueMark } from "@/components/LeagueMark";
import { replayRedZonePlay } from "@/components/GameRows";
import { FeedEntry, FeedScope, RedZoneNow, useRedZoneFeed } from "@/hooks/useRedZoneFeed";
import { useLiveMode } from "@/hooks/useLiveTick";
import { GameStarters, GroupedStarter } from "@/lib/my-starters";
import { NFLGame } from "@/lib/nfl-schedule";
import { formatPlayPoints } from "@/lib/play-points";
import { nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";

const PAGE = 30;

function TeamLogo({ team, side = 16 }: { team: string; side?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
    <img
      src={nflLogoUrl(team)}
      alt={team}
      title={team}
      loading="lazy"
      draggable={false}
      {...nflLogoSize(team, side)}
      className="shrink-0 object-contain"
    />
  );
}

/** A starter's name as the feed shows it — a team defense by its team. */
function displayName(p: GroupedStarter): string {
  return p.position === "DEF" && p.team ? `${p.team} D/ST` : p.name;
}

function periodLabel(period: number): string {
  if (period <= 0) return "";
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

/** When in the game a play happened: "Q2 4:31", or the scoreboard's own line for a play just in. */
function whenLabel(entry: FeedEntry): string {
  const { play, game } = entry;
  if (play.period > 0) return `${periodLabel(play.period)} ${play.clock}`.trim();
  return game.statusDetail ?? "Live";
}

const POINTS_TITLE =
  "Standard PPR points, worked out from ESPN's play-by-play — your league's scoring, and Sleeper's official numbers, can differ.";

function deltaClass(delta: number): string {
  return delta > 0 ? "text-status-good" : delta < 0 ? "text-status-critical" : "text-ink-muted";
}

/** The player's game total through a play, on the app's highlight plate. */
function TotalChip({ total }: { total: number }) {
  return (
    <span className="bg-[var(--map-tag)] px-1 py-px text-[0.6875rem] font-bold tabular-nums text-[var(--map-tag-ink)]">{total.toFixed(2)}</span>
  );
}

/**
 * What the play was worth, on one line: the points it earned (green up, red
 * down), then the player's PPR total for the game through this play,
 * highlighted. A play with two of your starters lists each, by surname.
 */
function PlayPoints({ entry }: { entry: FeedEntry }) {
  const { players, points, others } = entry;
  // Name each line once there's more than one — your starters by surname, everyone else as ESPN writes them.
  const labeled = players.length + others.length > 1;
  return (
    <span className="flex flex-col items-end gap-0.5" title={POINTS_TITLE}>
      {players.map((p) => {
        const pts = points[p.playerId];
        if (!pts) return null;
        const surname = p.position === "DEF" ? displayName(p) : p.name.split(" ").slice(1).join(" ") || p.name;
        return (
          <span key={p.playerId} className="flex items-center gap-1.5 whitespace-nowrap leading-none tabular-nums">
            {labeled ? <span className="text-[0.625rem] text-ink-muted">{surname}</span> : null}
            {/* Tagged so the starters list can fly a copy of it over to this player's total. */}
            <span
              data-rz-player={p.playerId}
              data-rz-delta={pts.delta}
              data-rz-at={entry.play.at ?? 0}
              className={`text-sm font-bold ${deltaClass(pts.delta)}`}
            >
              {formatPlayPoints(pts.delta)}
            </span>
            <TotalChip total={pts.total} />
          </span>
        );
      })}
      {/* Everyone else's (the all-plays view): the same numbers, the +/- left uncolored. */}
      {others.map((o) => (
        <span key={o.key} className="flex items-center gap-1.5 whitespace-nowrap leading-none tabular-nums">
          {labeled ? <span className="text-[0.625rem] text-ink-muted">{o.label}</span> : null}
          <span
            data-rz-actor={o.label}
            data-rz-team={entry.play.offense ?? ""}
            data-rz-delta={o.delta}
            data-rz-at={entry.play.at ?? 0}
            className="text-sm font-bold text-ink-primary"
          >
            {formatPlayPoints(o.delta)}
          </span>
          <TotalChip total={o.total} />
        </span>
      ))}
    </span>
  );
}

function Badge({ children, className }: { children: string; className: string }) {
  return <span className={`px-1 py-px text-[0.625rem] font-bold uppercase leading-none tracking-wide ${className}`}>{children}</span>;
}

/** A scoring play's short name: TD, FG, SAF, or 2PT for a two-point try. */
function scoreLabel(type: string, text: string): string {
  const both = `${type} ${text}`;
  if (/touchdown/i.test(both)) return "TD";
  if (/field goal/i.test(both)) return "FG";
  if (/safety/i.test(both)) return "SAF";
  if (/two-point/i.test(both)) return "2PT";
  return "PTS";
}

/**
 * Each play's marks, abbreviated: a score (TD/FG/SAF), a turnover (TO — green
 * when it's your defense taking the ball away, red when your player gave it
 * up), a red-zone snap (RZ), a long gain (+21).
 */
function PlayBadges({ entry }: { entry: FeedEntry }) {
  const { play, players } = entry;
  const defense = players.length > 0 && players.every((p) => p.position === "DEF");
  return (
    <>
      {play.scoring ? <Badge className="bg-status-good text-white">{scoreLabel(play.type, play.text)}</Badge> : null}
      {play.turnover ? (
        <Badge className={defense ? "bg-status-good text-white" : "bg-status-critical text-white"}>TO</Badge>
      ) : null}
      {play.redZone && !play.scoring ? <Badge className="border border-status-critical text-status-critical">RZ</Badge> : null}
      {play.yards >= 20 && !play.scoring ? <Badge className="border border-ink-muted text-ink-secondary">{`+${play.yards}`}</Badge> : null}
    </>
  );
}

/**
 * One play: your starter's photo, who (with the leagues they're started in),
 * ESPN's line for the play, and when — the down and distance it was snapped
 * on, the team with the ball, the clock. A play none of your starters were in
 * (the all-plays view) leads with the team with the ball instead. A play that arrives while you watch
 * slides in and washes its row in color — green for a score, red otherwise.
 */
function FeedRow({
  entry,
  legendByLeagueId,
  arrivedLive,
  index,
}: {
  entry: FeedEntry;
  legendByLeagueId: Map<string, LeagueLegendEntry>;
  arrivedLive: boolean;
  index: number;
}) {
  // Decided once, when the row first appears.
  const [live] = useState(arrivedLive);
  const hasPoints = Object.values(entry.points).some((p) => p.delta !== 0) || entry.others.some((o) => o.delta !== 0);
  const { play, players } = entry;
  const lead = players[0] as GroupedStarter | undefined;
  const leagueIds = [...new Set(players.flatMap((p) => p.leagueIds))];
  const good = play.scoring || (play.turnover && players.length > 0 && players.every((p) => p.position === "DEF"));
  const { game } = entry;
  return (
    // Tapping a play (on desktop) replays its points flying over to the starters list.
    <li
      onClick={(e) => replayRedZonePlay(e.currentTarget)}
      title={hasPoints ? "Replay" : undefined}
      className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 border-b border-border px-1 py-2 last:border-b-0 ${
        play.scoring ? "shadow-[inset_3px_0_0_var(--status-good)]" : ""
      } ${hasPoints ? "md:cursor-pointer md:hover:bg-[color-mix(in_srgb,var(--ink-primary)_4%,transparent)]" : ""}`}
      style={{
        animation: live
          ? "rise 0.35s ease-out backwards, rz-flash 2.4s ease-out"
          : `rise 0.4s ease-out ${Math.min(index, 10) * 40}ms backwards`,
        ["--rz-flash" as string]: good ? "var(--status-good)" : "var(--status-critical)",
      }}
    >
      <span className="relative mt-0.5">
        {!lead || (lead.position === "DEF" && lead.team) ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-page">
            {(lead?.team ?? play.offense) ? <TeamLogo team={(lead?.team ?? play.offense)!} side={20} /> : null}
          </span>
        ) : (
          <PlayerHeadshot playerId={lead.playerId} size={32} />
        )}
        {players.length > 1 ? (
          <span className="absolute -bottom-1 -right-1 rounded-full border border-surface-raised bg-ink-primary px-1 text-[0.5625rem] font-bold leading-tight text-surface-raised">
            +{players.length - 1}
          </span>
        ) : null}
      </span>
      {/* Who and when on the top line; the play's full description underneath, with what it was worth beside it. */}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            {lead ? (
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                <span className="min-w-0 break-words text-[0.8125rem] font-bold text-ink-primary">
                  {players.map(displayName).join(" & ")}
                </span>
                <span className={`shrink-0 text-[0.625rem] font-semibold uppercase ${POSITION_TEXT_COLOR[lead.position] ?? "text-ink-muted"}`}>
                  {lead.position === "DEF" ? "" : lead.position}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {leagueIds.map((id) => (
                    <LeagueMark key={id} league={legendByLeagueId.get(id)} className="h-3 w-3" />
                  ))}
                </span>
              </span>
            ) : (
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                <span className="text-[0.8125rem] font-bold text-ink-primary">{play.offense ?? game.awayTeam}</span>
                <span className="text-[0.625rem] uppercase text-ink-muted">
                  {game.awayTeam} @ {game.homeTeam}
                </span>
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap pt-px text-[0.6875rem] tabular-nums text-ink-muted">
            <PlayBadges entry={entry} />
            {play.downDistance ? <span className="font-semibold text-ink-secondary">{play.downDistance}</span> : null}
            {play.offense ? <TeamLogo team={play.offense} side={12} /> : null}
            {whenLabel(entry)}
          </span>
        </span>
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 break-words text-[0.75rem] leading-snug text-ink-secondary">{play.text}</span>
          <span className="shrink-0">
            <PlayPoints entry={entry} />
          </span>
        </span>
      </span>
    </li>
  );
}

/** Who on your side has the ball inside the 20 right now. */
function RedZoneAlert({ alert }: { alert: RedZoneNow }) {
  return (
    <li
      className="flex items-center gap-2 bg-[color-mix(in_srgb,var(--status-critical)_12%,transparent)] py-1.5 pl-3 pr-2 animate-[rz-pulse_1.6s_ease-in-out_infinite]"
      aria-label={`${alert.team} in the red zone${alert.downDistance ? `, ${alert.downDistance}` : ""}`}
    >
      <TeamLogo team={alert.team} side={18} />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] font-bold uppercase tracking-wide text-status-critical">
          {alert.downDistance ?? `${alert.team} in the red zone`}
        </span>
        <span className="block break-words text-[0.75rem] text-ink-primary">
          {alert.players.length > 0 ? alert.players.map(displayName).join(", ") : `${alert.game.awayTeam} @ ${alert.game.homeTeam}`}
        </span>
      </span>
      <span className="flex shrink-0 -space-x-2">
        {alert.players.slice(0, 4).map((p) => (
          <span key={p.playerId} className="rounded-full ring-2 ring-surface-raised">
            <PlayerHeadshot playerId={p.playerId} size={24} />
          </span>
        ))}
      </span>
    </li>
  );
}

/** How many plays the phone's live box shows at once. */
const PHONE_ROWS = 3;

const SCOPES: { label: string; value: FeedScope }[] = [
  { label: "Team", value: "mine" },
  { label: "All", value: "all" },
];

/**
 * The Red Zone: plays as they happen, newest on top — by default only the
 * ones your starters are part of, or every play of every game — and, pinned
 * above them, the games where a team has the ball inside the 20. Follows the
 * shared live clock, so it moves with the scores everywhere else on the page.
 */
export function RedZone({
  starters,
  weekGames,
  legend,
  compactOnPhone = false,
}: {
  /** Your starters, grouped by the game they're playing in. */
  starters: GameStarters[];
  /** Every game of the week. */
  weekGames: NFLGame[];
  legend: LeagueLegendEntry[];
  /** On phones, show the plays in a box three rows tall that scrolls on its own, instead of a long list with a "Show more" button. */
  compactOnPhone?: boolean;
}) {
  const mode = useLiveMode();
  const [scope, setScope] = useState<FeedScope>("mine");
  const feed = useRedZoneFeed(starters, weekGames, scope);
  const [shown, setShown] = useState(PAGE);
  // Plays already on hand when the feed fills in just slide in; ones that arrive after that flash.
  const [settled, setSettled] = useState(false);
  const hasEntries = feed.entries.length > 0;
  useEffect(() => {
    if (!hasEntries || settled) return;
    const id = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(id);
  }, [hasEntries, settled]);
  // The phone box is exactly as tall as its first three rows — measured, since rows wrap to different heights.
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    const list = listRef.current;
    if (!compactOnPhone || !box || !list) return;
    const measure = () => {
      const rows = Array.from(list.children).slice(0, PHONE_ROWS) as HTMLElement[];
      const height = rows.reduce((sum, row) => sum + row.offsetHeight, 0);
      if (height > 0) box.style.setProperty("--rz-box-h", `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [compactOnPhone, hasEntries]);
  const moreToShow = feed.entries.length > shown;
  // In the phone box, scrolling to the end loads the next page of plays.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!compactOnPhone || !sentinel) return;
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [compactOnPhone, moreToShow, shown]);

  const pickScope = (next: FeedScope) => {
    if (next === scope) return;
    setScope(next);
    setShown(PAGE);
    setSettled(false);
  };

  const legendByLeagueId = new Map(legend.map((l) => [l.leagueId, l]));
  const entries = feed.entries;
  const live = mode === "live";
  const anyStarted =
    scope === "mine"
      ? starters.some((g) => g.game.state !== "pre" && g.players.length > 0)
      : weekGames.some((g) => g.state !== "pre");

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            {live ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-critical opacity-60" /> : null}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-status-critical" : "bg-ink-muted"}`} />
          </span>
          <span className="whitespace-nowrap text-sm font-bold uppercase tracking-[0.2em] text-ink-primary">Red Zone</span>
          {live ? <span className="hidden truncate text-[0.6875rem] text-ink-muted sm:inline">Live · every 15s</span> : null}
        </h2>
        <div className="flex shrink-0 border border-border text-[0.6875rem] font-semibold" role="group" aria-label="Which plays">
          {SCOPES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={scope === opt.value}
              onClick={() => pickScope(opt.value)}
              className={`whitespace-nowrap px-2 py-0.5 transition-colors ${
                scope === opt.value ? "bg-ink-primary text-surface-raised" : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {feed.redZone.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="In the red zone now">
          {feed.redZone.map((alert) => (
            <RedZoneAlert key={alert.game.id} alert={alert} />
          ))}
        </ul>
      ) : null}

      {entries.length > 0 ? (
        <>
          <div
            ref={boxRef}
            className={
              compactOnPhone
                ? "max-md:max-h-[var(--rz-box-h,15rem)] max-md:overflow-y-auto max-md:overscroll-contain max-md:border-y max-md:border-border"
                : ""
            }
          >
            <ol ref={listRef} className="flex flex-col" aria-label={scope === "mine" ? "Plays your starters were part of" : "Every play"} aria-live="polite">
              {entries.slice(0, shown).map((entry, i) => (
                <FeedRow
                  key={`${entry.game.id}-${entry.play.id}`}
                  entry={entry}
                  legendByLeagueId={legendByLeagueId}
                  arrivedLive={settled}
                  index={i}
                />
              ))}
            </ol>
            {compactOnPhone && entries.length > shown ? <div ref={sentinelRef} className="h-px md:hidden" aria-hidden /> : null}
          </div>
          {entries.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className={`self-center px-3 py-1 text-xs font-semibold text-ink-secondary hover:text-ink-primary ${compactOnPhone ? "max-md:hidden" : ""}`}
            >
              Show more ({entries.length - shown})
            </button>
          ) : null}
        </>
      ) : (
        <p className="py-3 text-center text-xs text-ink-muted">
          {feed.loading
            ? "Loading play-by-play…"
            : !anyStarted
              ? scope === "mine"
                ? "Plays your starters are part of land here as they happen, once their games kick off."
                : "Every play lands here as it happens, once the week's games kick off."
              : scope === "mine"
                ? "No plays from your starters yet."
                : "No plays yet."}
        </p>
      )}
    </Card>
  );
}
