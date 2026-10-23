"use client";

import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TimelineColumn } from "@/lib/roster-timeline";
import { PICK, TimelinePlayer } from "@/lib/league-trades";
import { AnalyzedTrade } from "@/lib/trades";

// Each position's dot on the dark panel; anyone else's a pale grey.
const POSITION_DOT: Record<string, string> = { QB: "#f2545f", RB: "#2fcf7a", WR: "#3d9cf0", TE: "#f0b429", K: "#b38cf0", DEF: "#9aa3b2" };
const OTHER_DOT = "#cfcfcf";
// A draft pick's a ring, under the team's players.
const PICK_RING = "#e8e8e8";
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
const colorOf = (p: TimelinePlayer | undefined) => (p?.position === PICK ? PICK_RING : (POSITION_DOT[p?.position ?? ""] ?? OTHER_DOT));
const PANEL = "#0b0b0b";
// The date row over the columns, the narrowest and widest a dot's row is, and the teams' names' room on the left.
const HEADER_PX = 24;
const PITCH = { min: 2, max: 6 };
const LABEL_PX = 74;
// The room between two trades' columns, by the days between them: never less than GAP.min, and more the longer —
// but by the log of it, so a long lull doesn't stretch the timeline out and trades days apart don't pile up.
const GAP = { min: 22, perDoubling: 15 };
const gapFor = (days: number) => GAP.min + GAP.perDoubling * Math.log2(1 + Math.max(0, days));

/** A dot in a color — or a ring — drawn once and stamped: far quicker than drawing each of hundreds of dots. */
function dotSprite(color: string, radius: number, dpr: number, ring: boolean): HTMLCanvasElement {
  const size = Math.ceil(radius * 2 * dpr) + 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  if (ring) {
    const width = Math.max(1, radius * 0.45) * dpr;
    ctx.arc(size / 2, size / 2, radius * dpr - width / 2, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  } else {
    ctx.arc(size / 2, size / 2, radius * dpr, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  return canvas;
}

function columnLabel(column: TimelineColumn): string {
  const d = new Date(column.at);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

/**
 * Every team's players as a timeline of dots: a column for each trade, as the league stood just after it, spaced by
 * the time between them (see gapFor); each team's players down it single file in their own band (by position,
 * then KTC value) — the bands back to back, every other one shaded — a dot each in its position's color, and its
 * draft picks under them as rings (by season, then round); and between columns, a line from each player or pick to
 * where they are next — faint for one staying put, in their color for one who moved, and from a pick that's been
 * used to the player it became. Scroll it sideways; the column at the focus line
 * (the middle on a phone, three quarters across wider) is picked, and the trade that made it shows under it.
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
  // A column for each trade.
  const columns = useMemo(() => timeline.filter((c) => c.kind === "trade"), [timeline]);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  const [picked, setPicked] = useState(columns.length - 1);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  // Each team's band: as many rows as its most players at any point, from the top down in roster order.
  const layout = useMemo(() => {
    const ids = teams.map((t) => t.rosterId);
    for (const column of columns) for (const id of column.rosters.keys()) if (!ids.includes(id)) ids.push(id);
    const rows = ids.map((id) => Math.max(1, ...columns.map((c) => c.rosters.get(id)?.length ?? 0)));
    const totalRows = rows.reduce((t, r) => t + r, 0);
    const room = typeof window === "undefined" ? 700 : Math.min(900, Math.max(360, window.innerHeight * 0.72));
    const pitch = Math.min(PITCH.max, Math.max(PITCH.min, (room - HEADER_PX) / totalRows));
    const bands: { rosterId: number; name: string; top: number; rows: number }[] = [];
    let y = HEADER_PX;
    for (let i = 0; i < ids.length; i++) {
      bands.push({ rosterId: ids[i], name: teams.find((t) => t.rosterId === ids[i])?.name ?? `Team ${ids[i]}`, top: y, rows: rows[i] });
      y += rows[i] * pitch;
    }
    return { bands, pitch, height: Math.ceil(y + 2) };
  }, [columns, teams]);

  // Each column's x from the first, by the days since the one before.
  const xs = useMemo(() => {
    const out = [0];
    for (let i = 1; i < columns.length; i++) out.push(out[i - 1] + gapFor((columns[i].at - columns[i - 1].at) / 86_400_000));
    return out;
  }, [columns]);

  // Each column's players, ordered down each band, and where each one's dot sits.
  const placed = useMemo(() => {
    const rank = (id: string) => {
      const p = people.get(id);
      const at = p?.position === PICK ? POSITION_ORDER.length + 1 : POSITION_ORDER.indexOf(p?.position ?? "");
      return [at < 0 ? POSITION_ORDER.length : at, -(p?.value ?? 0)];
    };
    return columns.map((column) => {
      const spots = new Map<string, { y: number; rosterId: number }>();
      for (const band of layout.bands) {
        const players = [...(column.rosters.get(band.rosterId) ?? [])].sort((a, b) => {
          const [ra, rb] = [rank(a), rank(b)];
          return ra[0] - rb[0] || ra[1] - rb[1] || a.localeCompare(b, undefined, { numeric: true });
        });
        players.forEach((id, i) => spots.set(id, { y: band.top + (i + 0.5) * layout.pitch, rosterId: band.rosterId }));
      }
      return spots;
    });
  }, [columns, people, layout]);

  // Where the picked column sits across the panel: the middle on a phone, three quarters across wider — so at now,
  // most of the panel shows the past. Column i's x in the scrolled content, with room either side so the first and
  // last columns can reach that line.
  const focus = (view?.width ?? 0) >= 768 ? 0.75 : 0.5;
  const padding = (view?.width ?? 0) * focus;
  const xOf = useCallback((i: number) => padding + xs[i], [padding, xs]);
  // The column nearest a point in the scrolled content.
  const nearest = useCallback(
    (cx: number) => xs.reduce((best, x, i) => (Math.abs(padding + x - cx) < Math.abs(padding + xs[best] - cx) ? i : best), 0),
    [xs, padding]
  );

  const draw = useCallback(() => {
    const el = canvas.current;
    const box = scroller.current;
    if (!el || !box || !view) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = el.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PANEL;
    ctx.fillRect(0, 0, view.width, layout.height);
    const left = box.scrollLeft;
    const x = (i: number) => xOf(i) - left;
    // Just the columns in sight, and one either side for the lines running off the edges.
    let from = 0;
    while (from < columns.length - 1 && x(from + 1) < 0) from++;
    let to = columns.length - 1;
    while (to > 0 && x(to - 1) > view.width) to--;
    const font = getComputedStyle(document.body).fontFamily;

    // Every other team's band shaded, so the teams read apart with no gap between them.
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    layout.bands.forEach((band, i) => {
      if (i % 2 === 1) ctx.fillRect(0, band.top, view.width, band.rows * layout.pitch);
    });
    // The picked column, lit faintly behind.
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x(picked) - 5, 0, 10, layout.height);

    // The lines between columns: the faint ones first, then the moves over them.
    const radius = Math.max(0.8, layout.pitch * 0.34);
    ctx.lineCap = "round";
    for (const moved of [false, true]) {
      for (let i = from; i < to; i++) {
        const [a, b] = [placed[i], placed[i + 1]];
        const [x1, x2] = [x(i), x(i + 1)];
        for (const [id, s] of a) {
          // A pick that's gone by the next column runs to the player it became.
          const became = b.has(id) ? undefined : people.get(id)?.becomes;
          const t = b.get(id) ?? (became ? b.get(became) : undefined);
          if (!t || (became != null || t.rosterId !== s.rosterId) !== moved) continue;
          ctx.beginPath();
          ctx.moveTo(x1, s.y);
          ctx.bezierCurveTo((x1 + x2) / 2, s.y, (x1 + x2) / 2, t.y, x2, t.y);
          if (moved) {
            ctx.strokeStyle = colorOf(people.get(became ?? id));
            ctx.lineWidth = 1.1;
          } else {
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.lineWidth = 0.6;
          }
          ctx.stroke();
        }
      }
    }

    // The dots.
    const sprites = new Map<string, HTMLCanvasElement>();
    const sprite = (p: TimelinePlayer | undefined) => {
      const color = colorOf(p);
      if (!sprites.has(color)) sprites.set(color, dotSprite(color, radius, dpr, p?.position === PICK));
      return sprites.get(color)!;
    };
    const size = (Math.ceil(radius * 2 * dpr) + 2) / dpr;
    for (let i = from; i <= to; i++) {
      for (const [id, s] of placed[i]) ctx.drawImage(sprite(people.get(id)), x(i) - size / 2, s.y - size / 2, size, size);
    }

    // Each column's date over it where there's room, the picked one's always and bright.
    ctx.font = `600 10px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const pickedLabel = { x: x(picked), w: ctx.measureText(columnLabel(columns[picked])).width };
    let clear = -Infinity;
    for (let i = from; i <= to; i++) {
      const text = columnLabel(columns[i]);
      const w = ctx.measureText(text).width;
      const overPicked = i !== picked && Math.abs(x(i) - pickedLabel.x) < (w + pickedLabel.w) / 2 + 6;
      if (i !== picked && (x(i) - w / 2 < clear || overPicked)) continue;
      ctx.fillStyle = i === picked ? "#ffffff" : "rgba(255,255,255,0.45)";
      ctx.fillText(text, x(i), HEADER_PX / 2);
      if (i !== picked) clear = x(i) + w / 2 + 6;
    }

    // The teams' names, held at the left edge over a fade.
    const fade = ctx.createLinearGradient(0, 0, LABEL_PX, 0);
    fade.addColorStop(0, PANEL);
    fade.addColorStop(0.75, `${PANEL}e6`);
    fade.addColorStop(1, `${PANEL}00`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, LABEL_PX, layout.height);
    ctx.font = `600 9px ${font}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (const band of layout.bands) {
      let name = band.name;
      while (name.length > 3 && ctx.measureText(name).width > LABEL_PX - 12) name = name.slice(0, -1);
      ctx.fillText(name === band.name ? name : `${name.trimEnd()}…`, 6, band.top);
    }
  }, [view, layout, columns, placed, people, picked, xOf]);

  // The panel's width; the canvas sized to it (for the screen's pixels), redrawn on every scroll.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const measure = () => setView({ width: box.clientWidth, height: layout.height });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [layout.height]);
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el || !view) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(view.width * dpr);
    el.height = Math.round(view.height * dpr);
    draw();
  }, [view, draw]);
  // Opens at now, the newest column in the middle.
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
      const next = nearest(box.scrollLeft + box.clientWidth * focus);
      if (next !== picked) setPicked(next);
      else draw();
      setHover(null);
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Pointing at a dot names its player; a tap on a column brings it to the middle.
  const at = (e: React.PointerEvent) => {
    const box = scroller.current!;
    const rect = box.getBoundingClientRect();
    const cx = e.clientX - rect.left + box.scrollLeft;
    const cy = e.clientY - rect.top;
    if (columns.length === 0) return null;
    const i = nearest(cx);
    let best: { id: string; d: number } | null = null;
    for (const [id, s] of placed[i]) {
      const d = Math.abs(s.y - cy);
      if (!best || d < best.d) best = { id, d };
    }
    return { i, x: e.clientX - rect.left, y: cy, id: best && best.d <= Math.max(4, layout.pitch) && Math.abs(cx - xOf(i)) < 10 ? best.id : null };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const hit = at(e);
    if (!hit?.id) return setHover(null);
    const p = people.get(hit.id);
    const team = layout.bands.find((b) => b.rosterId === placed[hit.i].get(hit.id!)?.rosterId)?.name;
    const position = p?.position && p.position !== PICK ? ` ${p.position}` : "";
    setHover({ x: hit.x, y: hit.y, text: `${p?.name ?? hit.id}${position}${team ? ` · ${team}` : ""}` });
  };
  const onClick = (e: React.MouseEvent) => {
    const hit = at(e as unknown as React.PointerEvent);
    if (!hit) return;
    scroller.current?.scrollTo({ left: xOf(hit.i) - (view?.width ?? 0) * focus, behavior: "smooth" });
  };

  const column = columns[picked];
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
        aria-label="Every team's players and draft picks over time, a column of dots after each trade"
      >
        <div style={{ width: (view?.width ?? 0) + (xs[xs.length - 1] ?? 0), height: layout.height }}>
          <canvas ref={canvas} className="sticky left-0 block" style={{ width: view?.width ?? 0, height: layout.height }} />
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
      {/* The trade that made the picked column. */}
      {trade ? (
        <ol>{renderTrade(trade)}</ol>
      ) : (
        null
      )}
    </div>
  );
}
