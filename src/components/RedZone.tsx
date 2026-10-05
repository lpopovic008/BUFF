"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { LeagueLegendEntry, LeagueMark } from "@/components/LeagueMark";
import { FeedEntry, RedZoneFeed, RedZoneNow } from "@/hooks/useRedZoneFeed";
import { useLiveMode } from "@/hooks/useLiveTick";
import { GroupedStarter } from "@/lib/my-starters";
import { isBigPlay } from "@/lib/play-by-play";
import { formatPlayPoints } from "@/lib/play-points";
import { nflLogoFilter, nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
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
      style={{ filter: nflLogoFilter(team) }}
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
  const { players, points } = entry;
  return (
    <span className="flex flex-col items-end gap-0.5" title={POINTS_TITLE}>
      {players.map((p) => {
        const pts = points[p.playerId];
        if (!pts) return null;
        const surname = p.position === "DEF" ? displayName(p) : p.name.split(" ").slice(1).join(" ") || p.name;
        return (
          <span key={p.playerId} className="flex items-center gap-1.5 whitespace-nowrap leading-none tabular-nums">
            {players.length > 1 ? <span className="max-w-[6rem] truncate text-[0.625rem] text-ink-muted">{surname}</span> : null}
            <span className={`text-sm font-bold ${deltaClass(pts.delta)}`}>{formatPlayPoints(pts.delta)}</span>
            <TotalChip total={pts.total} />
          </span>
        );
      })}
    </span>
  );
}

function Badge({ children, className }: { children: string; className: string }) {
  return <span className={`px-1 py-px text-[0.625rem] font-bold uppercase leading-none tracking-wide ${className}`}>{children}</span>;
}

/** Each play's marks: a score, a takeaway, a red-zone snap, a long gain. */
function PlayBadges({ entry }: { entry: FeedEntry }) {
  const { play, players } = entry;
  const defense = players.every((p) => p.position === "DEF");
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {play.scoring ? <Badge className="bg-status-good text-white">{/touchdown/i.test(play.type + play.text) ? "TD" : "Score"}</Badge> : null}
      {play.turnover ? (
        <Badge className={defense ? "bg-status-good text-white" : "bg-status-critical text-white"}>{defense ? "Takeaway" : "Turnover"}</Badge>
      ) : null}
      {play.redZone && !play.scoring ? <Badge className="border border-status-critical text-status-critical">RZ</Badge> : null}
      {play.yards >= 20 && !play.scoring ? <Badge className="border border-ink-muted text-ink-secondary">{`+${play.yards}`}</Badge> : null}
    </span>
  );
}

/**
 * One play: your starter's photo, who (with the leagues they're started in),
 * ESPN's line for the play, and when. A play that arrives while you watch
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
  const { play, players } = entry;
  const lead = players[0];
  const leagueIds = [...new Set(players.flatMap((p) => p.leagueIds))];
  const good = play.scoring || (play.turnover && players.every((p) => p.position === "DEF"));
  return (
    <li
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-b border-border px-1 py-2 last:border-b-0 ${
        play.scoring ? "shadow-[inset_3px_0_0_var(--status-good)]" : ""
      }`}
      style={{
        animation: live
          ? "rise 0.35s ease-out backwards, rz-flash 2.4s ease-out"
          : `rise 0.4s ease-out ${Math.min(index, 10) * 40}ms backwards`,
        ["--rz-flash" as string]: good ? "var(--status-good)" : "var(--status-critical)",
      }}
    >
      <span className="relative mt-0.5">
        {lead.position === "DEF" && lead.team ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-page">
            <TeamLogo team={lead.team} side={20} />
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
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[0.8125rem] font-bold text-ink-primary">
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
        <span className="mt-0.5 line-clamp-2 text-[0.75rem] leading-snug text-ink-secondary">{play.text}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="flex items-center gap-1 whitespace-nowrap text-[0.6875rem] tabular-nums text-ink-muted">
          {play.offense ? <TeamLogo team={play.offense} side={12} /> : null}
          {whenLabel(entry)}
        </span>
        <PlayPoints entry={entry} />
        <PlayBadges entry={entry} />
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
        <span className="block truncate text-[0.75rem] text-ink-primary">{alert.players.map(displayName).join(", ")}</span>
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

/**
 * The Red Zone: every play your starters are part of, as it happens, newest
 * on top — and, pinned above the plays, any game where one of their teams has
 * the ball inside the 20. Follows the shared live clock, so it moves with the
 * scores everywhere else on the page.
 */
export function RedZone({ feed, legend, anyStarted }: { feed: RedZoneFeed; legend: LeagueLegendEntry[]; anyStarted: boolean }) {
  const mode = useLiveMode();
  const [bigOnly, setBigOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  // Plays already on hand when the feed first fills in just slide in; ones that arrive after that flash.
  const [settled, setSettled] = useState(false);
  const hasEntries = feed.entries.length > 0;
  useEffect(() => {
    if (!hasEntries || settled) return;
    const id = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(id);
  }, [hasEntries, settled]);

  const legendByLeagueId = new Map(legend.map((l) => [l.leagueId, l]));
  const entries = bigOnly ? feed.entries.filter((e) => isBigPlay(e.play)) : feed.entries;
  const live = mode === "live";

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            {live ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-critical opacity-60" /> : null}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-status-critical" : "bg-ink-muted"}`} />
          </span>
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-ink-primary">Red Zone</span>
          <span className="text-[0.6875rem] text-ink-muted">{live ? "Live · every 15s · PPR" : "Your starters, play by play · PPR"}</span>
        </h2>
        <div className="flex shrink-0 border border-border text-[0.6875rem] font-semibold" role="group" aria-label="Which plays">
          {[
            { label: "All", value: false },
            { label: "Big plays", value: true },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={bigOnly === opt.value}
              onClick={() => setBigOnly(opt.value)}
              className={`px-2 py-0.5 transition-colors ${
                bigOnly === opt.value ? "bg-ink-primary text-surface-raised" : "text-ink-secondary hover:text-ink-primary"
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
          <ol className="flex flex-col" aria-label="Plays your starters were part of" aria-live="polite">
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
          {entries.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="self-center px-3 py-1 text-xs font-semibold text-ink-secondary hover:text-ink-primary"
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
              ? "Plays your starters are part of land here as they happen, once their games kick off."
              : bigOnly
                ? "No big plays from your starters yet."
                : "No plays from your starters yet."}
        </p>
      )}
    </Card>
  );
}
