"use client";

import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TimelineColumn } from "@/lib/roster-timeline";
import { PICK, TimelinePlayer } from "@/lib/league-trades";
import { AnalyzedTrade } from "@/lib/trades";
import { playerHeadshotUrl } from "@/lib/sleeper";

// Each position's color on the dark panel; anyone else's a pale grey, a draft pick's white.
const POSITION_DOT: Record<string, string> = { QB: "#f2545f", RB: "#2fcf7a", WR: "#3d9cf0", TE: "#f0b429", K: "#b38cf0", DEF: "#9aa3b2" };
const OTHER_DOT = "#cfcfcf";
const PICK_RING = "#e8e8e8";
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
const colorOf = (p: TimelinePlayer | undefined) => (p?.position === PICK ? PICK_RING : (POSITION_DOT[p?.position ?? ""] ?? OTHER_DOT));
const PANEL = "#0b0b0b";
// The date row over the moments, each team's row, each player's room along it, a trading team's player's photo
// and anyone else's dot; and the teams' names' room on the left.
const HEADER_PX = 24;
const ROW = 22;
const SLOT = 18;
const FACE = 16;
const DOT = 2.4;
const LABEL_PX = 74;
// The room between two trades' moments, by the days between them: never less than GAP.min, and more the longer —
// but by the log of it, so a long lull doesn't stretch the timeline out and trades days apart don't pile up.
const GAP = { min: 40, perDoubling: 18 };
const gapFor = (days: number) => GAP.min + GAP.perDoubling * Math.log2(1 + Math.max(0, days));

function columnLabel(column: TimelineColumn): string {
  const d = new Date(column.at);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

/** One trade's moment: every team's row of players just after it — the two (or more) trading teams' with gaps
 * where those they gave up stood — and an arrow for each who moved, from their gap to their new spot. */
interface Moment {
  column: TimelineColumn;
  rows: Map<number, { id: string; gone: boolean }[]>;
  trading: Set<number>;
  moves: { id: string; from: [rosterId: number, slot: number]; to: [rosterId: number, slot: number] }[];
  width: number;
}

/**
 * Every team's roster as a timeline: a moment for each trade, the league just after it, spaced by the time between
 * them (see gapFor). In each, every team is a row of its players (by position, then KTC value, its draft picks
 * last) — a small dot each in its position's color — but the teams in the trade show each player's photo, ringed in
 * that color, and an arrow from where each player they swapped stood to where he went. Scroll it sideways; the
 * moment in the middle is picked, and its trade shows under it.
 */
export function RosterTimeline({
  timeline,
  people,
  teams,
  trades,
  renderTrade,
}: {
  timeline: TimelineColumn[];
  people: Map<string, TimelinePlayer>;
  teams: { rosterId: number; name: string }[];
  trades: AnalyzedTrade[];
  renderTrade: (trade: AnalyzedTrade) => ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<{ width: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  // The teams down the side, in roster order (and any only the timeline knows).
  const rowsOf = useMemo(() => {
    const ids = teams.map((t) => t.rosterId);
    for (const column of timeline) for (const id of column.rosters.keys()) if (!ids.includes(id)) ids.push(id);
    return ids.map((rosterId, i) => ({ rosterId, name: teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`, y: HEADER_PX + (i + 0.5) * ROW }));
  }, [timeline, teams]);
  const height = HEADER_PX + rowsOf.length * ROW + 4;

  const moments = useMemo((): Moment[] => {
    const rank = (id: string) => {
      const p = people.get(id);
      const at = p?.position === PICK ? POSITION_ORDER.length + 1 : POSITION_ORDER.indexOf(p?.position ?? "");
      return [at < 0 ? POSITION_ORDER.length : at, -(p?.value ?? 0)];
    };
    const order = (a: string, b: string) => {
      const [ra, rb] = [rank(a), rank(b)];
      return ra[0] - rb[0] || ra[1] - rb[1] || a.localeCompare(b, undefined, { numeric: true });
    };
    return timeline
      .filter((c) => c.kind === "trade" && c.move)
      .map((column) => {
        const move = column.move!;
        const trading = new Set([...move.adds, ...move.drops].map(([, rosterId]) => rosterId));
        const rows = new Map<number, { id: string; gone: boolean }[]>();
        for (const { rosterId } of rowsOf) {
          const now = column.rosters.get(rosterId) ?? [];
          const gone = trading.has(rosterId) ? move.drops.filter(([id, from]) => from === rosterId && !now.includes(id)).map(([id]) => id) : [];
          rows.set(
            rosterId,
            [...now, ...gone].sort(order).map((id) => ({ id, gone: gone.includes(id) }))
          );
        }
        const slotOf = (rosterId: number, id: string, gone: boolean) => rows.get(rosterId)?.findIndex((s) => s.id === id && s.gone === gone) ?? -1;
        const moves = move.adds.flatMap(([id, to]) => {
          const from = move.drops.find(([d]) => d === id)?.[1];
          if (from == null) return [];
          const [a, b] = [slotOf(from, id, true), slotOf(to, id, false)];
          return a < 0 || b < 0 ? [] : [{ id, from: [from, a] as [number, number], to: [to, b] as [number, number] }];
        });
        const width = Math.max(1, ...[...rows.values()].map((r) => r.length)) * SLOT;
        return { column, rows, trading, moves, width };
      });
  }, [timeline, people, rowsOf]);

  // Each moment's left edge from the first's, by its width and the days since the one before.
  const xs = useMemo(() => {
    const out = [0];
    for (let i = 1; i < moments.length; i++)
      out.push(out[i - 1] + moments[i - 1].width + gapFor((moments[i].column.at - moments[i - 1].column.at) / 86_400_000));
    return out;
  }, [moments]);

  // The picked moment is the one in the middle; room either side so the first and last can get there.
  const last = moments.length - 1;
  const padLeft = Math.max(LABEL_PX, (view?.width ?? 0) / 2 - (moments[0]?.width ?? 0) / 2);
  const padRight = Math.max(16, (view?.width ?? 0) / 2 - (moments[last]?.width ?? 0) / 2);
  const contentWidth = last < 0 ? 0 : padLeft + xs[last] + moments[last].width + padRight;
  const leftOf = useCallback((i: number) => padLeft + xs[i], [padLeft, xs]);
  const nearest = useCallback(
    (cx: number) => {
      let best = 0;
      for (let i = 0; i < moments.length; i++) {
        const d = Math.abs(leftOf(i) + moments[i].width / 2 - cx);
        if (d < Math.abs(leftOf(best) + moments[best].width / 2 - cx)) best = i;
      }
      return best;
    },
    [moments, leftOf]
  );
  const [picked, setPicked] = useState(Math.max(0, moments.length - 1));

  // Photos, each loaded once and cut into a ringed circle; drawn once they're in (a plain dot till then, or
  // for good if there's none).
  const faces = useRef(new Map<string, HTMLCanvasElement | null>());
  const [loaded, setLoaded] = useState(0);
  const redraw = useRef(0);
  const face = useCallback(
    (id: string, color: string, dpr: number) => {
      const key = `${id}|${dpr}`;
      if (faces.current.has(key)) return faces.current.get(key)!;
      faces.current.set(key, null);
      const img = new Image();
      img.onload = () => {
        const size = Math.ceil(FACE * dpr);
        const sprite = document.createElement("canvas");
        sprite.width = sprite.height = size;
        const ctx = sprite.getContext("2d")!;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = "#1c1c1c";
        ctx.fillRect(0, 0, size, size);
        // Sleeper's headshots are wider than tall: the middle of it, filling the circle.
        const scale = size / Math.min(img.width, img.height);
        ctx.drawImage(img, (size - img.width * scale) / 2, (size - img.height * scale) / 2, img.width * scale, img.height * scale);
        ctx.lineWidth = 1.6 * dpr;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 0.8 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        faces.current.set(key, sprite);
        // One redraw for however many came in together.
        cancelAnimationFrame(redraw.current);
        redraw.current = requestAnimationFrame(() => setLoaded((n) => n + 1));
      };
      img.src = playerHeadshotUrl(id);
      return null;
    },
    []
  );

  const draw = useCallback(() => {
    const el = canvas.current;
    const box = scroller.current;
    if (!el || !box || !view) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = el.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PANEL;
    ctx.fillRect(0, 0, view.width, height);
    const font = getComputedStyle(document.body).fontFamily;
    const left = box.scrollLeft;
    const rowY = new Map(rowsOf.map((r) => [r.rosterId, r.y]));

    // Every other team's row shaded.
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    rowsOf.forEach((r, i) => {
      if (i % 2 === 1) ctx.fillRect(0, r.y - ROW / 2, view.width, ROW);
    });

    moments.forEach((m, i) => {
      const x0 = leftOf(i) - left;
      if (x0 > view.width || x0 + m.width < 0) return;
      const x = (slot: number) => x0 + (slot + 0.5) * SLOT;
      // The picked moment, lit faintly behind.
      if (i === picked) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(x0 - 4, HEADER_PX - 2, m.width + 8, height - HEADER_PX);
      }
      // Its date over it.
      ctx.font = `600 10px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = i === picked ? "#ffffff" : "rgba(255,255,255,0.45)";
      ctx.fillText(columnLabel(m.column), x0 + m.width / 2, HEADER_PX / 2);

      for (const [rosterId, slots] of m.rows) {
        const y = rowY.get(rosterId)!;
        const trading = m.trading.has(rosterId);
        slots.forEach((s, k) => {
          const p = people.get(s.id);
          const color = colorOf(p);
          const cx = x(k);
          if (s.gone) {
            // Where one they gave up stood.
            ctx.setLineDash([2, 2]);
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, y, FACE / 2 - 1, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (!trading) {
            ctx.beginPath();
            ctx.arc(cx, y, DOT, 0, Math.PI * 2);
            if (p?.position === PICK) {
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.stroke();
            } else {
              ctx.fillStyle = color;
              ctx.fill();
            }
          } else if (p?.position === PICK) {
            // A pick: a ring with its round in it.
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(cx, y, FACE / 2 - 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font = `700 7px ${font}`;
            ctx.fillStyle = color;
            ctx.fillText(`R${s.id.slice(5).split("-")[1]}`, cx, y + 0.5);
          } else {
            const sprite = face(s.id, color, dpr);
            if (sprite) ctx.drawImage(sprite, cx - FACE / 2, y - FACE / 2, FACE, FACE);
            else {
              ctx.fillStyle = `${color}55`;
              ctx.strokeStyle = color;
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.arc(cx, y, FACE / 2 - 0.8, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          }
        });
      }

      // The trade's arrows: from each one's gap, bowed out to the side, to his new spot.
      for (const mv of m.moves) {
        const color = colorOf(people.get(mv.id));
        const [x1, y1, x2, y2] = [x(mv.from[1]), rowY.get(mv.from[0])!, x(mv.to[1]), rowY.get(mv.to[0])!];
        const bow = Math.min(36, Math.abs(y2 - y1) * 0.35) * (y2 > y1 ? -1 : 1);
        const [qx, qy] = [(x1 + x2) / 2 + bow, (y1 + y2) / 2];
        // Ends at the photo's edge, its head pointing along the curve.
        const angle = Math.atan2(y2 - qy, x2 - qx);
        const [ex, ey] = [x2 - Math.cos(angle) * (FACE / 2 + 1), y2 - Math.sin(angle) * (FACE / 2 + 1)];
        ctx.strokeStyle = ctx.fillStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1 + Math.sign(y2 - y1) * (FACE / 2));
        ctx.quadraticCurveTo(qx, qy, ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(angle - 0.45) * 5, ey - Math.sin(angle - 0.45) * 5);
        ctx.lineTo(ex - Math.cos(angle + 0.45) * 5, ey - Math.sin(angle + 0.45) * 5);
        ctx.closePath();
        ctx.fill();
      }
    });

    // The teams' names, held at the left edge over a fade — the picked trade's bright.
    const fade = ctx.createLinearGradient(0, 0, LABEL_PX, 0);
    fade.addColorStop(0, PANEL);
    fade.addColorStop(0.75, `${PANEL}e6`);
    fade.addColorStop(1, `${PANEL}00`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, LABEL_PX, height);
    ctx.font = `600 9px ${font}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const r of rowsOf) {
      let name = r.name;
      while (name.length > 3 && ctx.measureText(name).width > LABEL_PX - 12) name = name.slice(0, -1);
      ctx.fillStyle = moments[picked]?.trading.has(r.rosterId) ? "#ffffff" : "rgba(255,255,255,0.55)";
      ctx.fillText(name === r.name ? name : `${name.trimEnd()}…`, 6, r.y);
    }
  }, [view, height, rowsOf, moments, leftOf, picked, people, face]);

  // The panel's width; the canvas sized to it (for the screen's pixels), redrawn on every scroll.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const measure = () => setView({ width: box.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el || !view) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(view.width * dpr);
    el.height = Math.round(height * dpr);
    draw();
    // And again as photos come in.
  }, [view, height, draw, loaded]);
  // Opens at the newest trade.
  const opened = useRef(false);
  useEffect(() => {
    const box = scroller.current;
    if (!box || !view || opened.current) return;
    opened.current = true;
    box.scrollLeft = box.scrollWidth;
  }, [view]);

  const frame = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = scroller.current;
      if (!box) return;
      const next = nearest(box.scrollLeft + box.clientWidth / 2);
      if (next !== picked) setPicked(next);
      else draw();
      setHover(null);
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Pointing at a player names him; a tap on a moment brings it to the middle.
  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const box = scroller.current!;
    const rect = box.getBoundingClientRect();
    const cx = e.clientX - rect.left + box.scrollLeft;
    const cy = e.clientY - rect.top;
    if (moments.length === 0) return null;
    const i = nearest(cx);
    const row = rowsOf.find((r) => Math.abs(r.y - cy) <= ROW / 2);
    const slot = Math.floor((cx - leftOf(i)) / SLOT);
    const s = row ? moments[i].rows.get(row.rosterId)?.[slot] : undefined;
    return { i, x: e.clientX - rect.left, y: row?.y ?? cy, id: s && !s.gone ? s.id : null, team: row?.name };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const hit = at(e);
    if (!hit?.id) return setHover(null);
    const p = people.get(hit.id);
    const position = p?.position && p.position !== PICK ? ` ${p.position}` : "";
    setHover({ x: hit.x, y: hit.y - FACE / 2, text: `${p?.name ?? hit.id}${position}${hit.team ? ` · ${hit.team}` : ""}` });
  };
  const onClick = (e: React.MouseEvent) => {
    const hit = at(e);
    if (!hit) return;
    scroller.current?.scrollTo({ left: leftOf(hit.i) + moments[hit.i].width / 2 - (view?.width ?? 0) / 2, behavior: "smooth" });
  };

  const column = moments[picked]?.column;
  const trade = column?.tradeId ? trades.find((t) => t.id === column.tradeId) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scroller}
        onScroll={onScroll}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
        className="relative overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:thin]"
        style={{ background: PANEL }}
        role="img"
        aria-label="Every team's roster at each trade, the players traded drawn moving"
      >
        <div style={{ width: contentWidth, height }}>
          <canvas ref={canvas} className="sticky left-0 block" style={{ width: view?.width ?? 0, height }} />
        </div>
        {hover ? (
          <span
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap bg-white px-1.5 py-0.5 text-[0.6875rem] font-semibold text-black"
            style={{ left: hover.x, top: hover.y }}
          >
            {hover.text}
          </span>
        ) : null}
      </div>
      {/* The trade the picked moment shows. */}
      {trade ? <ol>{renderTrade(trade)}</ol> : null}
    </div>
  );
}
