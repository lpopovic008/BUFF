"use client";

import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TimelineColumn } from "@/lib/roster-timeline";
import { TimelinePlayer } from "@/lib/league-trades";
import { AnalyzedTrade } from "@/lib/trades";

// Each position's dot, bright on the dark panel; anyone else's a pale grey.
const POSITION_DOT: Record<string, string> = { QB: "#ff4d5e", RB: "#2ee88a", WR: "#3fa9ff", TE: "#ffc542", K: "#c792ff", DEF: "#9aa3b2" };
const OTHER_DOT = "#d6d6d6";
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
const PANEL = "#0b0b0b";
// Columns' spacing, the date row over them, the room between teams, and the narrowest and widest a dot's row is.
const COLUMN_PX = 56;
const HEADER_PX = 24;
const TEAM_GAP_PX = 7;
const PITCH = { min: 2, max: 6 };
const LABEL_PX = 74;

/** A glowing dot in a color, drawn once and stamped — far quicker than a gradient for each of hundreds of dots. */
function glowSprite(color: string, radius: number, dpr: number): HTMLCanvasElement {
  const size = Math.ceil(radius * 6 * dpr);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.12, "#ffffff");
  glow.addColorStop(0.2, color);
  glow.addColorStop(0.42, `${color}66`);
  glow.addColorStop(1, `${color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function columnLabel(column: TimelineColumn): string {
  if (column.kind === "start") return "Start";
  if (column.kind === "now") return "Now";
  const d = new Date(column.at);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

/**
 * Every team's players as a timeline of dots: a column for each moment — before the first trade, after each trade,
 * now — each team's players down it single file in their own band (by position, then KTC value), a dot each,
 * bright in its position's color; and between columns, a line from each player to where they are next — faint
 * for one staying put, bright in their color for one who moved. Scroll it sideways; the column at the focus line
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
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  const [picked, setPicked] = useState(timeline.length - 1);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  // Each team's band: as many rows as its most players at any point, from the top down in roster order.
  const layout = useMemo(() => {
    const ids = teams.map((t) => t.rosterId);
    for (const column of timeline) for (const id of column.rosters.keys()) if (!ids.includes(id)) ids.push(id);
    const rows = ids.map((id) => Math.max(1, ...timeline.map((c) => c.rosters.get(id)?.length ?? 0)));
    const totalRows = rows.reduce((t, r) => t + r, 0);
    const room = typeof window === "undefined" ? 700 : Math.min(900, Math.max(360, window.innerHeight * 0.72));
    const pitch = Math.min(PITCH.max, Math.max(PITCH.min, (room - HEADER_PX - TEAM_GAP_PX * ids.length) / totalRows));
    const bands: { rosterId: number; name: string; top: number; rows: number }[] = [];
    let y = HEADER_PX;
    for (let i = 0; i < ids.length; i++) {
      bands.push({ rosterId: ids[i], name: teams.find((t) => t.rosterId === ids[i])?.name ?? `Team ${ids[i]}`, top: y, rows: rows[i] });
      y += rows[i] * pitch + TEAM_GAP_PX;
    }
    return { bands, pitch, height: Math.ceil(y + 4) };
  }, [timeline, teams]);

  // Each column's players, ordered down each band, and where each one's dot sits.
  const placed = useMemo(() => {
    const rank = (id: string) => {
      const p = people.get(id);
      const at = POSITION_ORDER.indexOf(p?.position ?? "");
      return [at < 0 ? POSITION_ORDER.length : at, -(p?.value ?? 0)];
    };
    return timeline.map((column) => {
      const spots = new Map<string, { y: number; rosterId: number }>();
      for (const band of layout.bands) {
        const players = [...(column.rosters.get(band.rosterId) ?? [])].sort((a, b) => {
          const [ra, rb] = [rank(a), rank(b)];
          return ra[0] - rb[0] || ra[1] - rb[1] || a.localeCompare(b);
        });
        players.forEach((id, i) => spots.set(id, { y: band.top + (i + 0.5) * layout.pitch, rosterId: band.rosterId }));
      }
      return spots;
    });
  }, [timeline, people, layout]);

  // Where the picked column sits across the panel: the middle on a phone, three quarters across wider — so at now,
  // most of the panel shows the past. Column i's x in the scrolled content, with room either side so the first and
  // last columns can reach that line.
  const focus = (view?.width ?? 0) >= 768 ? 0.75 : 0.5;
  const padding = (view?.width ?? 0) * focus;
  const xOf = useCallback((i: number) => padding + i * COLUMN_PX, [padding]);

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
    const from = Math.max(0, Math.floor((left - padding) / COLUMN_PX) - 1);
    const to = Math.min(timeline.length - 1, Math.ceil((left + view.width - padding) / COLUMN_PX) + 1);
    const x = (i: number) => xOf(i) - left;
    const font = getComputedStyle(document.body).fontFamily;

    // The picked column, lit faintly behind.
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x(picked) - COLUMN_PX / 2 + 6, 0, COLUMN_PX - 12, layout.height);

    // The lines between columns: the faint ones first, then the moves over them.
    const radius = Math.max(1, layout.pitch * 0.36);
    ctx.lineCap = "round";
    for (const moved of [false, true]) {
      ctx.globalCompositeOperation = moved ? "lighter" : "source-over";
      for (let i = from; i < to; i++) {
        const [a, b] = [placed[i], placed[i + 1]];
        const [x1, x2] = [x(i), x(i + 1)];
        for (const [id, s] of a) {
          const t = b.get(id);
          if (!t || (t.rosterId !== s.rosterId) !== moved) continue;
          ctx.beginPath();
          ctx.moveTo(x1, s.y);
          ctx.bezierCurveTo((x1 + x2) / 2, s.y, (x1 + x2) / 2, t.y, x2, t.y);
          if (moved) {
            ctx.strokeStyle = POSITION_DOT[people.get(id)?.position ?? ""] ?? OTHER_DOT;
            ctx.lineWidth = 1.3;
          } else {
            ctx.strokeStyle = "rgba(255,255,255,0.09)";
            ctx.lineWidth = 0.75;
          }
          ctx.stroke();
        }
      }
    }

    // The dots, glowing — added light over light, so where they crowd they brighten.
    ctx.globalCompositeOperation = "lighter";
    const sprites = new Map<string, HTMLCanvasElement>();
    const sprite = (color: string) => {
      if (!sprites.has(color)) sprites.set(color, glowSprite(color, radius, dpr));
      return sprites.get(color)!;
    };
    const size = radius * 6;
    for (let i = from; i <= to; i++) {
      for (const [id, s] of placed[i]) {
        const color = POSITION_DOT[people.get(id)?.position ?? ""] ?? OTHER_DOT;
        ctx.drawImage(sprite(color), x(i) - size / 2, s.y - size / 2, size, size);
      }
    }
    ctx.globalCompositeOperation = "source-over";

    // Each column's date over it, the picked one bright.
    ctx.font = `600 10px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = from; i <= to; i++) {
      ctx.fillStyle = i === picked ? "#ffffff" : "rgba(255,255,255,0.45)";
      ctx.fillText(columnLabel(timeline[i]), x(i), HEADER_PX / 2);
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
  }, [view, layout, timeline, placed, people, picked, padding, xOf]);

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
      const middle = Math.round((box.scrollLeft + box.clientWidth * focus - padding) / COLUMN_PX);
      const next = Math.min(timeline.length - 1, Math.max(0, middle));
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
    const i = Math.round((cx - padding) / COLUMN_PX);
    if (i < 0 || i >= timeline.length) return null;
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
    setHover({ x: hit.x, y: hit.y, text: `${p?.name ?? hit.id}${p?.position ? ` ${p.position}` : ""}${team ? ` · ${team}` : ""}` });
  };
  const onClick = (e: React.MouseEvent) => {
    const hit = at(e as unknown as React.PointerEvent);
    if (!hit) return;
    scroller.current?.scrollTo({ left: xOf(hit.i) - (view?.width ?? 0) * focus, behavior: "smooth" });
  };

  const column = timeline[picked];
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
        aria-label="Every team's players over time, a column of dots after each trade"
      >
        <div style={{ width: (view?.width ?? 0) + (timeline.length - 1) * COLUMN_PX, height: layout.height }}>
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
        <p className="text-center text-xs text-ink-muted">{column?.kind === "start" ? "Before the first trade" : "Now — since the last trade"}</p>
      )}
    </div>
  );
}
