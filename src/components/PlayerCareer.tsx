"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { CareerSeason, careerColumns, careerTotals, getCareer, seasonPoints, seasonRank } from "@/lib/career-stats";
import { getPlayerBio, PlayerBio, ResolvedPlayer } from "@/lib/players";
import { nflLogoSize, nflLogoUrl } from "@/lib/nfl-logos";
import { POSITION_TEXT_COLOR } from "@/lib/position-colors";
import { ordinal } from "@/lib/format";
import { CareerStage, FloorCareer, FLOOR_RISE_MS } from "@/components/FloorCareer";

function TeamLogo({ team, side = 16 }: { team: string; side?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static SVG on a static export
    <img src={nflLogoUrl(team)} alt={team} title={team} loading="lazy" draggable={false} {...nflLogoSize(team, side)} className="shrink-0 object-contain" />
  );
}

/** "6'2\"" from inches. */
const feet = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;

/** Who he is in a line: position, team, number, age, years in, size, college — whatever Sleeper knows. */
export function bioLine(player: ResolvedPlayer, bio: PlayerBio | null): string {
  return [
    player.position,
    player.team,
    bio?.number ? `#${bio.number}` : null,
    bio?.age ? `${bio.age} yrs` : null,
    bio?.yearsExp != null ? (bio.yearsExp === 0 ? "Rookie" : `${ordinal(bio.yearsExp + 1)} season`) : null,
    bio?.height && bio.weight ? `${feet(bio.height)} ${bio.weight} lb` : null,
    bio?.college,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A headline number over its label. */
function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col border border-border bg-page px-2 py-1.5">
      <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="text-xl font-extrabold tabular-nums leading-tight text-ink-primary">{value}</span>
      {sub ? <span className="truncate text-[0.625rem] font-semibold uppercase text-ink-muted">{sub}</span> : null}
    </div>
  );
}

/** What a starter's numbers in a lineup are (see LeagueMatchupCarousel's RankedName), for their card to spell out. */
export interface LineupNumbers {
  /** Their rank at their position by trade value — dynasty values in a dynasty league, redraft otherwise. */
  valueRank: number | null;
  dynasty: boolean;
  /** Their rank at their position by this season's points, and their points a game. */
  seasonRank: number | null;
  ppg: number | null;
  /** Who they're playing this week (or a bye), that defense's rank against the position, and its color in the lineup. */
  opponent: string | null;
  bye: boolean;
  defenseRank: number | null;
  opponentColor?: string;
}

/** A starter's lineup numbers, each in its lineup color, with what it means. */
function LineupLine({ position, numbers }: { position: string; numbers: LineupNumbers }) {
  const { valueRank, dynasty, seasonRank, ppg, opponent, bye, defenseRank, opponentColor } = numbers;
  const items: { value: string; className?: string; style?: React.CSSProperties; text: string }[] = [];
  if (valueRank !== null)
    items.push({ value: String(valueRank), className: "text-series-4", text: `${dynasty ? "Dynasty" : "Redraft"} rank — ${ordinal(valueRank)} among ${position}s by trade value` });
  if (seasonRank !== null) items.push({ value: String(seasonRank), className: "text-series-1", text: `Season rank — ${ordinal(seasonRank)} among ${position}s in points this season` });
  if (ppg !== null) items.push({ value: ppg.toFixed(1), className: "text-ink-muted", text: "Points per game this season" });
  if (bye) items.push({ value: "BYE", className: "text-ink-muted", text: "On a bye this week" });
  else if (opponent)
    items.push({
      value: defenseRank !== null ? `${opponent} (${defenseRank})` : opponent,
      style: opponentColor ? { color: opponentColor } : undefined,
      text:
        defenseRank !== null
          ? `This week's opponent — ${ordinal(defenseRank)} defense against ${position}s (1st allows the fewest points; red toughest, green easiest)`
          : "This week's opponent",
    });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border border-border bg-page px-2 py-1.5">
      <span className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">In this lineup</span>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.text} className="flex items-baseline gap-2 text-xs">
            <span className={`w-16 shrink-0 text-right font-bold tabular-nums ${item.className ?? ""}`} style={item.style}>
              {item.value}
            </span>
            <span className="min-w-0 text-ink-secondary">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A player's career, over the page: who he is, his career's fantasy points, points a game and best finish, and a
 * table of every season — his team, games, his fantasy points under the league's scoring, a game, and where he
 * finished at his position, then the stats of his job (passing, rushing, receiving…) — newest first, the career
 * added up at the foot — opened from a lineup, what its numbers on them mean first (`numbers`). Closed with its button,
 * Escape, or a tap outside it.
 */
export function PlayerCareer({
  player,
  season,
  scoring,
  onClose,
  numbers,
  stage,
}: {
  player: ResolvedPlayer;
  /** The season to count through — the league's. */
  season: number;
  scoring?: Record<string, number>;
  onClose: () => void;
  /** Their numbers in the lineup it was opened from, spelled out. */
  numbers?: LineupNumbers;
  /**
   * Up out of the room's floor in front (the League Room's, where the home page's Red Zone comes up), his seasons
   * standing on it (see FloorCareer) — the page around it left as it is, rather than over the page, dimmed.
   */
  stage?: CareerStage;
}) {
  // Up out of the floor (on a stage): on its way up once it's drawn, back down before it's gone.
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!stage) return;
    const show = requestAnimationFrame(() => requestAnimationFrame(() => setUp(true)));
    return () => cancelAnimationFrame(show);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it's drawn
  }, []);
  const leaving = useRef(0);
  useEffect(() => () => window.clearTimeout(leaving.current), []);
  const close = useCallback(() => {
    if (!stage) return onClose();
    setUp(false);
    window.clearTimeout(leaving.current);
    leaving.current = window.setTimeout(onClose, FLOOR_RISE_MS);
  }, [stage, onClose]);
  const [career, setCareer] = useState<CareerSeason[] | null>(null);
  const [bio, setBio] = useState<PlayerBio | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCareer(player.playerId, season)
      .then((c) => !cancelled && setCareer(c))
      .catch(() => !cancelled && setCareer([]));
    getPlayerBio(player.playerId).then((b) => !cancelled && setBio(b));
    return () => {
      cancelled = true;
    };
  }, [player.playerId, season]);

  // Escape closes it; the page under it holds still.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [close]);

  const groups = careerColumns(player.position);
  const rows = (career ?? []).map((s) => ({ ...s, points: seasonPoints(s.stats, scoring), rank: seasonRank(s.stats, scoring) })).reverse();
  const totals = careerTotals(career ?? []);
  const games = totals.gp ?? 0;
  const points = rows.reduce((t, r) => t + r.points, 0);
  const best = rows.filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!)[0];
  const ppgBest = Math.max(0, ...rows.map((r) => (r.stats.gp ? r.points / r.stats.gp : 0)));
  const cell = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";

  // Everything about him, to read down: what his lineup numbers mean, his career's headline numbers, every season.
  const details = (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
          {numbers ? <LineupLine position={player.position} numbers={numbers} /> : null}
          {career === null ? (
            <p className="py-8 text-center text-xs font-bold uppercase tracking-wide text-ink-muted">Loading career…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-xs font-bold uppercase tracking-wide text-ink-muted">No regular-season stats yet</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Figure label="Career points" value={points.toFixed(1)} sub={`${rows.length} season${rows.length === 1 ? "" : "s"} · ${games} games`} />
                <Figure label="Points a game" value={games ? (points / games).toFixed(1) : "–"} sub={`Best ${ppgBest.toFixed(1)}`} />
                <Figure label="Best finish" value={best ? `${player.position}${best.rank}` : "–"} sub={best ? best.season : undefined} />
                <Figure label="This season" value={rows[0].season === String(season) ? rows[0].points.toFixed(1) : "–"} sub={rows[0].season === String(season) && rows[0].rank ? `${player.position}${rows[0].rank} so far` : undefined} />
              </div>

              {/* Sideways on a phone, the season held at the left. */}
              <div className="overflow-x-auto border border-border">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">
                      <th className="sticky left-0 bg-surface-raised" />
                      <th colSpan={2} />
                      <th colSpan={3} className="border-l border-border px-2 pt-1.5 text-center text-ink-primary">
                        Fantasy
                      </th>
                      {groups.map((g) => (
                        <th key={g.group} colSpan={g.columns.length} className="border-l border-border px-2 pt-1.5 text-center">
                          {g.group}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-ink-primary text-[0.625rem] font-bold uppercase tracking-wide text-ink-secondary">
                      <th className="sticky left-0 bg-surface-raised px-2 py-1 text-left">Year</th>
                      <th className="px-2 py-1 text-left">Team</th>
                      <th className={`${cell} py-1`} title="Games played">
                        GP
                      </th>
                      <th className={`${cell} border-l border-border py-1 text-ink-primary`} title="Fantasy points, under this league's scoring">
                        PTS
                      </th>
                      <th className={`${cell} py-1`} title="Fantasy points a game">
                        PPG
                      </th>
                      <th className={`${cell} py-1`} title="Where he finished at his position">
                        RK
                      </th>
                      {groups.map((g) =>
                        g.columns.map((c, i) => (
                          <th key={`${g.group}-${c.label}`} title={c.title} className={`${cell} py-1 ${i === 0 ? "border-l border-border" : ""}`}>
                            {c.label}
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.season} className="border-b border-border last:border-b-0">
                        <td className="sticky left-0 bg-surface-raised px-2 py-1.5 font-bold tabular-nums text-ink-primary">{r.season}</td>
                        <td className="px-2 py-1.5">{r.team ? <TeamLogo team={r.team} /> : <span className="text-ink-muted">–</span>}</td>
                        <td className={`${cell} text-ink-secondary`}>{Math.round(r.stats.gp ?? 0)}</td>
                        <td className={`${cell} border-l border-border font-extrabold text-ink-primary`}>{r.points.toFixed(1)}</td>
                        <td className={`${cell} font-semibold text-ink-primary`}>{r.stats.gp ? (r.points / r.stats.gp).toFixed(1) : "–"}</td>
                        <td className={`${cell} font-bold ${POSITION_TEXT_COLOR[player.position] ?? "text-ink-primary"}`}>{r.rank ? `${player.position}${r.rank}` : "–"}</td>
                        {groups.map((g) =>
                          g.columns.map((c, i) => (
                            <td key={`${g.group}-${c.label}`} className={`${cell} text-ink-secondary ${i === 0 ? "border-l border-border" : ""}`}>
                              {c.value(r.stats)}
                            </td>
                          ))
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {rows.length > 1 ? (
                    <tfoot>
                      <tr className="border-t border-ink-primary font-bold">
                        <td className="sticky left-0 bg-surface-raised px-2 py-1.5 uppercase text-ink-primary">Career</td>
                        <td />
                        <td className={`${cell} text-ink-primary`}>{Math.round(games)}</td>
                        <td className={`${cell} border-l border-border font-extrabold text-ink-primary`}>{points.toFixed(1)}</td>
                        <td className={`${cell} text-ink-primary`}>{games ? (points / games).toFixed(1) : "–"}</td>
                        <td />
                        {groups.map((g) =>
                          g.columns.map((c, i) => (
                            <td key={`${g.group}-${c.label}`} className={`${cell} text-ink-primary ${i === 0 ? "border-l border-border" : ""}`}>
                              {c.value(totals)}
                            </td>
                          ))
                        )}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </>
          )}
        </div>
  );
  const card = (
      <div
        role="dialog"
        aria-modal={stage ? undefined : "true"}
        aria-label={`${player.name}'s career`}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full flex-col border border-border bg-surface-raised ${
          stage ? "h-full transition-transform ease-out" : "max-h-[88dvh] sm:max-w-4xl"
        }`}
        style={
          stage
            ? { transform: up ? "translateY(0)" : "translateY(100%)", transitionDuration: `${FLOOR_RISE_MS}ms` }
            : { animation: "rise 0.25s ease-out" }
        }
      >
        {/* Who he is, on the plate. */}
        <div className="flex items-center gap-3 bg-[var(--title-plate)] px-3 py-2 text-[var(--map-tag-ink)]">
          <PlayerHeadshot playerId={player.playerId} sizeClass="h-11 w-11" square />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold uppercase tracking-wide sm:text-lg">{player.name}</h2>
            <p className="truncate text-[0.6875rem] font-semibold uppercase opacity-80">{bioLine(player, bio)}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-current text-lg font-bold leading-none active:scale-90"
          >
            ×
          </button>
        </div>

        {details}
      </div>
  );
  // On a stage: cut off at the floor it comes up out of.
  if (stage) {
    return (
      <FloorCareer
        player={player}
        bio={bioLine(player, bio)}
        seasons={career === null ? null : [...rows].reverse()}
        numbers={numbers}
        details={details}
        stage={stage}
        up={up}
        onClose={close}
      />
    );
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={close}>
      {card}
    </div>
  );
}
