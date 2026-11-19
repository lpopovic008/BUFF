"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PlateCard } from "@/components/ui/PlateCard";
import { useLeagueTrades } from "@/hooks/useLeagueTrades";
import { AnalyzedTrade, filterTrades, TRADE_SIDE_COLORS, TRADE_SORTS, TradeFilter, tradeGap, TradeSide, TradeSort } from "@/lib/trades";
import { TradeViewer } from "@/components/TradeViewer";
import { shownGrade, valueGrade } from "@/lib/player-values";
import { canvasFile, drawTradeGraphic } from "@/lib/trade-graphic";
import { getHomeView } from "@/lib/localStore";
import { ImageIcon } from "@/components/ui/Icon";

// Each side's color (see TRADE_SIDE_COLORS).
const SIDE_COLORS = TRADE_SIDE_COLORS;

const ADDED =
  "KTC's trade calculator's value adjustment: fewer, better pieces are worth more than the plain sum. Each piece counts for more the closer it is to the trade's best, the side ahead that way is ahead by a player worth the difference, and this evens the plain totals out to match. It's held at its value when traded, so the totals since show how lopsided the trade has become";

/** A value as the values page shows it: its whole grade (9,999 reads 99). */
function grade(value: number): number {
  return shownGrade(valueGrade(value));
}

/** "+6" green, "−4" red, "0" grey — a change in whole grades. */
function Change({ from, to }: { from: number; to: number }) {
  const delta = grade(to) - grade(from);
  return (
    <span className={`tabular-nums ${delta > 0 ? "text-status-good" : delta < 0 ? "text-status-critical" : "text-ink-muted"}`}>
      {delta > 0 ? "+" : delta < 0 ? "−" : ""}
      {Math.abs(delta)}
    </span>
  );
}

/** A value as its grade, "–" with none. */
function Shown({ value }: { value: number | null }) {
  return <>{value !== null ? grade(value) : "–"}</>;
}

/** The least room between two labels beside the chart (px): they're moved apart no closer than this. */
const LABEL_PX = 13;

/** Labels' heights (percent down the chart) moved apart just enough not to overlap (`gap` percent), kept within it, in their order. */
function spread(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const over = order.length > 0 ? order[order.length - 1].y - 100 : 0;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - gap);
  const out = Array<number>(ys.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

/** The day the sides were closest together, any week since the trade (see tradeGap). */
function closestDay(trade: AnalyzedTrade): number | null {
  const days = trade.sides[0]?.path.map((p) => p.day) ?? [];
  let best: { day: number; gap: number } | null = null;
  days.forEach((day, i) => {
    const gap = tradeGap(trade.sides, i).gap;
    if (!best || gap < best.gap) best = { day, gap };
  });
  return (best as { day: number; gap: number } | null)?.day ?? null;
}

/**
 * A trade's every piece on one chart, week by week from the trade to now: each a line in the color of the team that
 * got it (a pick's running on into whoever it became), its name outside the chart on the left by where it started,
 * and its value now outside it on the right by where it ends. Inside it, nothing but two faint wires: the week the
 * sides were farthest apart, and the week they were closest.
 */
function TradeChart({ trade, colorOf }: { trade: AnalyzedTrade; colorOf: (side: TradeSide) => string }) {
  const box = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(176);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setTall(el.clientHeight || 176);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const days = trade.sides[0]?.path.map((p) => p.day) ?? [];
  const [first, last] = [days[0] ?? 0, days[days.length - 1] ?? 0];
  const lines = trade.sides.flatMap((side) =>
    side.got.map((asset) => ({ asset, color: colorOf(side), points: asset.path.map((p) => ({ day: p.day, value: p.value ?? 0 })) }))
  );
  if (lines.length === 0) return null;
  // One scale for every piece, the trade's lowest value to its highest (a piece with no value sits at 0).
  const values = lines.flatMap((l) => [...l.points.map((p) => p.value), l.asset.then ?? 0, l.asset.now ?? 0]);
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const span = hi - lo || 1;
  // Percent down the chart, a little room kept at the top and bottom; and across it.
  const y = (value: number) => 4 + (1 - (value - lo) / span) * 92;
  const x = (day: number) => (last > first ? ((day - first) / (last - first)) * 100 : 0);
  const gap = (LABEL_PX / Math.max(1, tall)) * 100;
  // Where each line starts and ends on the chart — its name and its value now beside them, moved apart only as far as
  // they'd otherwise overlap (a tick then joining a name to its line's start).
  const starts = lines.map((l) => y(l.points[0]?.value ?? l.asset.then ?? 0));
  const lefts = spread(starts, gap);
  const rights = spread(lines.map((l) => y(l.points[l.points.length - 1]?.value ?? l.asset.now ?? 0)), gap);
  const widest = x(trade.widest.day);
  const closestOn = closestDay(trade);
  const closest = closestOn !== null ? x(closestOn) : null;
  const label = "absolute -translate-y-1/2 whitespace-nowrap text-xs leading-none";
  return (
    <div ref={box} className="grid min-h-[11rem] flex-1 grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2rem] gap-x-0 gap-y-1.5" role="img" aria-label="Each piece's value from the trade to now">
      {/* Each piece's name, right beside where its line starts. */}
      <div className="relative">
        <svg viewBox="0 0 8 100" preserveAspectRatio="none" className="absolute inset-y-0 right-0 h-full w-2 overflow-visible" aria-hidden>
          {lines.map((l, i) =>
            Math.abs(lefts[i] - starts[i]) > 0.5 ? (
              <line key={i} x1={0} y1={lefts[i]} x2={8} y2={starts[i]} stroke={l.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ) : null
          )}
        </svg>
        {lines.map((l, i) => (
          <span
            key={i}
            className={`${label} right-2.5 max-w-[calc(100%-0.625rem)] truncate font-semibold`}
            style={{ top: `${lefts[i]}%`, color: l.color }}
            title={[l.asset.label, l.asset.became ? `became ${l.asset.became.name}` : null, l.asset.pickOf ? `(${l.asset.pickOf})` : null].filter(Boolean).join(" ")}
          >
            {l.asset.label}
          </span>
        ))}
      </div>
      <div className="relative border-x border-border">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          {/* The week the sides were farthest apart, and the week they were closest. */}
          {[widest, closest].map((at, i) =>
            at === null ? null : (
              <line key={i} x1={at} x2={at} y1={0} y2={100} stroke="var(--ink-primary)" strokeOpacity={0.3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )
          )}
          {lines.map((l, i) =>
            l.points.length > 1 ? (
              <polyline
                key={i}
                points={l.points.map((p) => `${x(p.day)},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={l.color}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : null
          )}
        </svg>
      </div>
      {/* Each piece's value now, by where its line ends. */}
      <div className="relative">
        {lines.map((l, i) => (
          <span key={i} className={`${label} left-1.5 font-bold tabular-nums text-ink-primary`} style={{ top: `${rights[i]}%` }} title={l.asset.became ? `${l.asset.became.name} now` : "Now"}>
            <Shown value={l.asset.now} />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The trade as a picture to send to the league (see trade-graphic.ts), in the export theme picked in Settings: handed
 * to the share sheet where there is one (a phone's — Messages, the group chat) as the picture alone, no text with it, else
 * copied to paste, else saved.
 */
function TradeExport({ trade, leagueName }: { trade: AnalyzedTrade; leagueName: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "saved" | "error">("idle");
  const settle = (next: typeof status) => {
    setStatus(next);
    window.setTimeout(() => setStatus("idle"), 2200);
  };
  const exportIt = async () => {
    let file: File;
    try {
      const canvas = document.createElement("canvas");
      drawTradeGraphic(canvas, trade, leagueName, getHomeView().exportTheme);
      const day = new Date(trade.at).toISOString().slice(0, 10);
      file = canvasFile(canvas, `trade-${day}.png`);
    } catch {
      settle("error");
      return;
    }
    // Straight to the share sheet, in this same tap.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
      settle("copied");
      return;
    } catch {
      // On to saving it.
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    settle("saved");
  };
  const label = status === "copied" ? "Copied" : status === "saved" ? "Saved" : status === "error" ? "Couldn't export" : "Export";
  return (
    <button
      type="button"
      onClick={exportIt}
      title="Export this trade as a picture to send to your league"
      aria-live="polite"
      className="ml-auto flex shrink-0 items-center gap-1 border border-border px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-ink-primary transition-colors hover:border-ink-primary"
    >
      <ImageIcon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/**
 * A trade: its date at the top left and its teams beside it, each in its color (yours underlined; whoever's haul is
 * worth the most now on the plate), and at the right a way to export it as a picture; its pieces on one chart (see TradeChart); and under it, each side's FAAB, added
 * value and totals, then and now. `height`: as tall as that (px), the chart taking what's left — else as tall as it
 * needs.
 */
function TradeCard({ trade, leagueName, height }: { trade: AnalyzedTrade; leagueName: string; height?: number | null }) {
  const worth = (s: TradeSide) => s.now + s.added;
  const leader = trade.sides.reduce((best, s) => (worth(s) > worth(best) ? s : best), trade.sides[0]);
  const madeOn = new Date(trade.at);
  const colorOf = (side: TradeSide) => SIDE_COLORS[Math.max(0, trade.sides.indexOf(side)) % SIDE_COLORS.length];
  return (
    <li data-trade-id={trade.id} className="flex flex-col gap-2 py-2 sm:py-3" style={height ? { height } : undefined}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-secondary tabular-nums" title="When the trade was made">
          {madeOn.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {trade.sides.map((side) => {
          const ahead = side === leader && side.now > 0;
          return (
            <span key={side.rosterId} className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="h-2 w-2 shrink-0" style={{ background: colorOf(side) }} aria-hidden />
              <span
                className={`min-w-0 truncate font-bold ${ahead ? "bg-[var(--map-tag)] px-1 text-[var(--map-tag-ink)]" : ""} ${side.mine ? "underline decoration-2 underline-offset-2" : ""}`}
                style={ahead ? undefined : { color: colorOf(side) }}
                title={ahead ? `${side.team} — worth the most now` : side.team}
              >
                {side.team}
              </span>
            </span>
          );
        })}
        <TradeExport trade={trade} leagueName={leagueName} />
      </div>
      <TradeChart trade={trade} colorOf={colorOf} />
      {/* Each side's totals, in its color: what it got at its whole grades, added up — and any FAAB and added value. */}
      <div className="grid gap-x-4 gap-y-1 border-t border-border pt-1" style={{ gridTemplateColumns: `repeat(${trade.sides.length}, minmax(0, 1fr))` }}>
        {trade.sides.map((side) => (
          <div key={side.rosterId} className="flex min-w-0 flex-wrap items-end justify-between gap-x-3">
            <div className="flex min-w-0 flex-col pb-1 text-xs">
              {side.faab > 0 ? <span className="text-ink-muted">${side.faab} FAAB</span> : null}
              {side.got.length === 0 && side.faab === 0 ? <span className="text-ink-muted">Nothing</span> : null}
              {side.added > 0 ? (
                <span className="italic text-ink-secondary" title={ADDED}>
                  Added value <span className="not-italic tabular-nums">{grade(side.added)}</span>
                </span>
              ) : null}
            </div>
            <div className="ml-auto flex shrink-0 items-baseline gap-2">
              <span className="text-xs" style={{ color: colorOf(side) }}>
                Total
              </span>
              <span className="text-lg tabular-nums text-ink-muted">{grade(side.then + side.added)}</span>
              <span className="text-ink-muted">→</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: colorOf(side) }}>
                {grade(side.now + side.added)}
              </span>
              <span className="text-lg">
                <Change from={side.then + side.added} to={side.now + side.added} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </li>
  );
}

const FIELD = "min-w-0 border border-border bg-page px-2 py-1 text-xs text-ink-primary outline-none focus:border-ink-primary";

/** Finding trades: a season, a team slot (by its latest name), and the order they're in. */
function TradeFilters({
  trades,
  teams,
  filter,
  onChange,
}: {
  trades: AnalyzedTrade[];
  teams: { rosterId: number; name: string }[];
  filter: TradeFilter;
  onChange: (next: TradeFilter) => void;
}) {
  const seasons = useMemo(() => [...new Set(trades.map((t) => t.season))].sort().reverse(), [trades]);
  return (
    <div className="flex flex-wrap gap-2">
      <select aria-label="Season" value={filter.season ?? ""} onChange={(e) => onChange({ ...filter, season: e.target.value || null })} className={FIELD}>
        <option value="">All seasons</option>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select aria-label="Team" value={filter.team ?? ""} onChange={(e) => onChange({ ...filter, team: e.target.value === "" ? null : Number(e.target.value) })} className={`${FIELD} max-w-[12rem]`}>
        <option value="">All teams</option>
        {teams.map((t) => (
          <option key={t.rosterId} value={t.rosterId}>
            {t.name}
          </option>
        ))}
      </select>
      <select aria-label="Sort" value={filter.sort} onChange={(e) => onChange({ ...filter, sort: e.target.value as TradeSort })} className={FIELD}>
        {TRADE_SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const NO_FILTER: TradeFilter = { season: null, team: null, sort: "newest" };

/**
 * How far down its column the line a trade card's read at is, scrolled to its top: the card across it is the trade
 * shown. Scrolled further, the line goes on down with it, so it's at the column's foot at its end (and the last card's
 * read, however short).
 */
const READ_AT = 0.3;

/** How close to filling its column a card has to come to rest (a share of its height) to be eased the rest of the way. */
const SNAP_WITHIN = 0.25;
/** How long a column's scroll has to have stopped to have come to rest (ms). */
const SETTLE_MS = 160;

/** How far `card` is from filling its column `column` — its top at the column's, past its padding (px, + below). */
function offFill(column: HTMLElement, card: HTMLElement): number {
  const pad = parseFloat(getComputedStyle(column).paddingTop) || 0;
  return card.getBoundingClientRect().top - (column.getBoundingClientRect().top + pad);
}

/**
 * Every trade in a league, all its seasons, newest first: what each side got, what it was worth when traded
 * and now — in KTC dynasty values (superflex or 1QB, as the league plays), shown as the values page's grades —
 * and each side's haul from the trade to now on a little chart. Filters above find a season's or a team's, and
 * reorder them. Over them, the trades one at a time on a timeline (see TradeViewer).
 *
 * `layout`, where it's given, puts the two in columns of their own: the timeline (with the filters under it) and the
 * cards, scrolled through — the card a little way down its column the trade shown on the timeline (and on the room's
 * floor), and a trade picked on the timeline scrolled to.
 */
export function TradeAnalyzer({
  leagueId,
  leagueName,
  sleeperUserId,
  layout,
}: {
  leagueId: string;
  leagueName: string;
  sleeperUserId: string | null;
  layout?: (parts: { timeline: ReactNode; cards: ReactNode }) => ReactNode;
}) {
  const data = useLeagueTrades(leagueId, sleeperUserId);
  const [filter, setFilter] = useState<TradeFilter>(NO_FILTER);
  const shown = useMemo(() => (data ? filterTrades(data.trades, filter) : []), [data, filter]);
  const filtered = filter.season !== null || filter.team !== null;
  // The trade shown, in columns: the card read, or the trade picked on the timeline.
  const [shownId, setShownId] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  // A trade picked on the timeline scrolled to — not then taken for the cards being scrolled through, for a moment.
  const pickedAt = useRef(0);
  const showPicked = (id: string) => {
    setShownId(id);
    const card = list.current?.querySelector<HTMLElement>(`[data-trade-id="${CSS.escape(id)}"]`);
    const column = list.current?.closest<HTMLElement>("[data-scroll-list]");
    if (!card || !column) return;
    pickedAt.current = performance.now();
    // Its card filling the column (as tall as it shows, see cardHeight).
    column.scrollTo({ top: Math.max(0, column.scrollTop + offFill(column, card)) });
  };
  // The card across the line it's read at, as its column's scrolled.
  const columns = !!layout;
  useEffect(() => {
    const el = list.current;
    const column = el?.closest<HTMLElement>("[data-scroll-list]");
    if (!columns || !el || !column) return;
    const read = () => {
      if (performance.now() - pickedAt.current < 400) return;
      const most = column.scrollHeight - column.clientHeight;
      const through = most > 0 ? Math.min(1, Math.max(0, column.scrollTop / most)) : 0;
      const line = column.getBoundingClientRect().top + column.clientHeight * (READ_AT + (1 - READ_AT) * through);
      const cards = [...el.querySelectorAll<HTMLElement>("[data-trade-id]")];
      const across = cards.find((c) => c.getBoundingClientRect().bottom > line) ?? cards.at(-1);
      const id = across?.dataset.tradeId;
      if (id) setShownId((was) => (was === id ? was : id));
    };
    read();
    // Scrolled as it is — but come to rest close to a card's filling the column (within a quarter of it), eased the
    // rest of the way there.
    let settle = 0;
    const settled = () => {
      const cards = [...el.querySelectorAll<HTMLElement>("[data-trade-id]")];
      const nearest = cards.map((c) => ({ c, off: offFill(column, c) })).sort((a, b) => Math.abs(a.off) - Math.abs(b.off))[0];
      if (!nearest || Math.abs(nearest.off) < 1 || Math.abs(nearest.off) > nearest.c.offsetHeight * SNAP_WITHIN) return;
      const top = Math.max(0, Math.min(column.scrollHeight - column.clientHeight, column.scrollTop + nearest.off));
      column.scrollTo({ top, behavior: "smooth" });
    };
    const scrolled = () => {
      read();
      window.clearTimeout(settle);
      settle = window.setTimeout(settled, SETTLE_MS);
    };
    column.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      window.clearTimeout(settle);
      column.removeEventListener("scroll", scrolled);
    };
  }, [columns, shown]);

  // In columns, each card as tall as its column shows: one trade fills it.
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  useEffect(() => {
    const column = list.current?.closest<HTMLElement>("[data-scroll-list]");
    if (!columns || !column) return;
    const measure = () => {
      const style = getComputedStyle(column);
      const room = column.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
      setCardHeight((was) => (room > 0 && was !== room ? room : was));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [columns, shown]);

  const hasTimeline = !!data && data.timeline.some((c) => c.kind === "trade");
  const filters = data && data.trades.length > 0 ? <TradeFilters trades={data.trades} teams={data.teams} filter={filter} onChange={setFilter} /> : null;
  const count = data ? <span className="tabular-nums">{filtered ? `${shown.length} of ${data.trades.length}` : data.trades.length} trades</span> : null;
  const cardList = !data ? (
    <p className="py-4 text-center text-sm text-ink-secondary">Loading trades…</p>
  ) : data.trades.length === 0 ? (
    <p className="py-4 text-center text-sm text-ink-secondary">No trades yet.</p>
  ) : shown.length === 0 ? (
    <p className="py-4 text-center text-sm text-ink-secondary">No trades match.</p>
  ) : (
    <ol ref={list} className="flex flex-col gap-3">
      {shown.map((trade) => (
        <TradeCard key={trade.id} trade={trade} leagueName={leagueName} height={columns ? cardHeight : null} />
      ))}
    </ol>
  );

  if (layout) {
    return (
      <>
        {layout({
          // The trade shown (the timeline's on the room's floor), the way to step and replay, and under it the filters.
          timeline: (
            <div className="flex flex-col gap-3">
              {hasTimeline ? (
                <PlateCard title="Trade" bodyClassName="p-2">
                  <TradeViewer
                    timeline={data!.timeline}
                    people={data!.people}
                    teams={data!.teams}
                    trades={data!.trades}
                    valueAt={data!.valueAt}
                    season={filter.season}
                    shownId={shownId}
                    onShow={showPicked}
                    narrow
                  />
                </PlateCard>
              ) : null}
              {data ? (
                <PlateCard title={leagueName} aside={count} bodyClassName="p-2">
                  {filters ?? <p className="py-2 text-center text-sm text-ink-secondary">{data.trades.length === 0 ? "No trades yet." : "Loading trades…"}</p>}
                </PlateCard>
              ) : null}
            </div>
          ),
          cards: cardList,
        })}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-3">
    {/* The trades one at a time: a timeline, the rosters they changed, and their cards. */}
    {hasTimeline ? (
      <PlateCard title="Trade" bodyClassName="p-2 sm:p-3">
        <TradeViewer
          timeline={data!.timeline}
          people={data!.people}
          teams={data!.teams}
          trades={data!.trades}
          valueAt={data!.valueAt}
          season={filter.season}
          renderTrade={(trade) => <TradeCard trade={trade} leagueName={leagueName} />}
        />
      </PlateCard>
    ) : null}
    <PlateCard title={leagueName} aside={count} bodyClassName="p-2 sm:p-3">
      <div className="flex flex-col gap-3">
        {filters}
        {cardList}
      </div>
    </PlateCard>
    </div>
  );
}
