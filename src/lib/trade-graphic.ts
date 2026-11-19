// A trade drawn as a picture to send round the league (see the Values page's trade cards): who got what, each piece's
// value when traded and now, each side's totals, and every piece's value from the trade to now on one chart — in the
// export theme picked in Settings (see recap-graphic.ts's RECAP_THEMES). Drawn all at once, with nothing to load, so
// it's ready to share in the same tap that asked for it.

import { exportTheme } from "./recap-graphic";
import { shownGrade, valueGrade } from "./player-values";
import { FAIR_SHARE } from "./trade-monitor";
import type { AnalyzedTrade, TradeAsset, TradeSide } from "./trades";

const WIDTH = 1080;
const PAD = 56;
const GAP = 24;

/** A value as the values page shows it: its whole grade. */
const grade = (value: number) => shownGrade(valueGrade(value));

/** A CSS color variable's value on the page, or `fallback` off it. */
function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** `text` cut to fit `width` (px) in the context's current font, an ellipsis where it's cut. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** A piece's name as the picture gives it: a pick with whoever it became. */
const pieceName = (a: TradeAsset) => (a.became ? `${a.label} → ${a.became.name}` : a.label);

/** A piece's row, and how tall one side's block is: its team, a row a piece (its FAAB and added value too; "Nothing"
 * with none), then its total. */
const ROW = 50;
const blockHeight = (side: TradeSide) => 108 + Math.max(1, side.got.length + (side.faab > 0 ? 1 : 0) + (side.added > 0 ? 1 : 0)) * ROW + 90;

/**
 * Draws `trade` (in league `leagueName`) onto `canvas` in export theme `themeId`: its league and date over each side's
 * block — the team (the one worth the most now marked ahead), what it got with each piece's grade then → now, any FAAB
 * and added value, and its total then → now — then every piece's value week by week on one chart from nothing up
 * (each in its side's color), and the source at the foot.
 */
export function drawTradeGraphic(canvas: HTMLCanvasElement, trade: AnalyzedTrade, leagueName: string, themeId?: string) {
  const { theme, font } = exportTheme(themeId);
  const C = theme.color;
  const sideColors = [C.primary, cssColor("--series-4", "#f59e0b"), C.muted, cssColor("--series-3", "#38bdf8")];
  const colorOf = (side: TradeSide) => sideColors[Math.max(0, trade.sides.indexOf(side)) % sideColors.length];
  const worth = (s: TradeSide) => s.now + s.added;
  const leader = trade.sides.reduce((best, s) => (worth(s) > worth(best) ? s : best), trade.sides[0]);

  // Two sides to a row, side by side; a third and fourth on the next.
  const perRow = Math.min(2, trade.sides.length);
  const colW = (WIDTH - 2 * PAD - GAP * (perRow - 1)) / perRow;
  const rows: TradeSide[][] = [];
  for (let i = 0; i < trade.sides.length; i += perRow) rows.push(trade.sides.slice(i, i + perRow));
  const rowHeights = rows.map((r) => Math.max(...r.map(blockHeight)));
  const HEADER = 170;
  const CHART = 420;
  const FOOTER = 24;
  const height = PAD + HEADER + rowHeights.reduce((a, b) => a + b + GAP, 0) + CHART + FOOTER + PAD;

  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the trade.");
  ctx.scale(scale, scale);
  const type = (size: number, weight = "600") => (ctx.font = `${weight} ${size}px ${font}`);

  // The ground.
  const ground = ctx.createLinearGradient(0, 0, 0, height);
  ground.addColorStop(0, C.bgTop);
  ground.addColorStop(1, C.bgBottom);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, WIDTH, height);

  // Its header: a badge, the league, the day it was made.
  let y = PAD;
  type(22, "800");
  const badge = "TRADE";
  const badgeW = ctx.measureText(badge).width + 28;
  ctx.fillStyle = C.accent;
  ctx.fillRect(PAD, y, badgeW, 40);
  ctx.fillStyle = C.accentInk;
  ctx.textBaseline = "middle";
  ctx.fillText(badge, PAD + 14, y + 21);
  type(44, "800");
  ctx.fillStyle = C.primary;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fit(ctx, leagueName, WIDTH - 2 * PAD), PAD, y + 100);
  type(26, "600");
  ctx.fillStyle = C.muted;
  const made = new Date(trade.at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  ctx.fillText(made, PAD, y + 140);
  y += HEADER;

  // Each side's block.
  rows.forEach((row, ri) => {
    row.forEach((side, ci) => {
      const x = PAD + ci * (colW + GAP);
      const h = rowHeights[ri];
      const color = colorOf(side);
      ctx.fillStyle = C.card;
      ctx.fillRect(x, y, colW, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, colW, 6);
      const inner = colW - 48;
      let by = y + 60;
      // The team, and whether it's ahead now (at the right) — the name smaller before it's cut short.
      let tagW = 0;
      if (side === leader && side.now > 0) {
        type(18, "800");
        const tag = "AHEAD NOW";
        tagW = ctx.measureText(tag).width + 20;
        ctx.fillStyle = C.accent;
        ctx.fillRect(x + colW - 24 - tagW, by - 24, tagW, 30);
        ctx.fillStyle = C.accentInk;
        ctx.fillText(tag, x + colW - 24 - tagW + 10, by - 2);
      }
      const team = `${side.team}${side.mine ? " (you)" : ""}`;
      const teamRoom = inner - (tagW > 0 ? tagW + 12 : 0);
      for (const size of [34, 29, 25]) {
        type(size, "800");
        if (ctx.measureText(team).width <= teamRoom) break;
      }
      ctx.fillStyle = color;
      ctx.fillText(fit(ctx, team, teamRoom), x + 24, by);
      by += 14;
      // Each piece: its name, its grade then → now and the change.
      const line = (name: string, right: { then: string; now: string; delta: number | null } | string, muted = false) => {
        by += ROW;
        type(26, "800");
        let rightW = 0;
        if (typeof right === "string") {
          ctx.fillStyle = C.secondary;
          rightW = ctx.measureText(right).width;
          ctx.fillText(right, x + colW - 24 - rightW, by);
        } else {
          const delta = right.delta === null ? "" : right.delta > 0 ? ` +${right.delta}` : right.delta < 0 ? ` −${Math.abs(right.delta)}` : " 0";
          const nowText = right.now;
          const thenText = `${right.then} → `;
          const dW = ctx.measureText(delta).width;
          const nW = ctx.measureText(nowText).width;
          type(26, "600");
          const tW = ctx.measureText(thenText).width;
          rightW = tW + nW + dW;
          let rx = x + colW - 24 - rightW;
          ctx.fillStyle = C.muted;
          ctx.fillText(thenText, rx, by);
          rx += tW;
          type(26, "800");
          ctx.fillStyle = C.primary;
          ctx.fillText(nowText, rx, by);
          rx += nW;
          ctx.fillStyle = right.delta === null || right.delta === 0 ? C.muted : right.delta > 0 ? C.win : C.loss;
          ctx.fillText(delta, rx, by);
        }
        // Smaller before it's cut short.
        const room = inner - rightW - 16;
        for (const size of [26, 23, 20]) {
          type(size, muted ? "500" : "700");
          if (ctx.measureText(name).width <= room) break;
        }
        ctx.fillStyle = muted ? C.secondary : C.primary;
        ctx.fillText(fit(ctx, name, room), x + 24, by);
      };
      if (side.got.length === 0 && side.faab === 0) line("Nothing", "", true);
      for (const a of side.got) {
        const then = a.then !== null ? grade(a.then) : null;
        const now = a.now !== null ? grade(a.now) : null;
        line(pieceName(a), { then: then !== null ? String(then) : "–", now: now !== null ? String(now) : "–", delta: then !== null && now !== null ? now - then : null });
      }
      if (side.faab > 0) line(`$${side.faab} FAAB`, "", true);
      if (side.added > 0) line("Added value", String(grade(side.added)), true);
      // Its total.
      const ty = y + h - 34;
      ctx.fillStyle = C.hairline;
      ctx.fillRect(x + 24, ty - 56, inner, 2);
      const then = grade(side.then + side.added);
      const now = grade(side.now + side.added);
      const delta = now - then;
      type(24, "800");
      ctx.fillStyle = color;
      ctx.fillText("TOTAL", x + 24, ty);
      type(46, "800");
      const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0";
      const dW = ctx.measureText(` ${deltaText}`).width;
      const nW = ctx.measureText(String(now)).width;
      type(30, "600");
      const tText = `${then} → `;
      const tW = ctx.measureText(tText).width;
      let rx = x + colW - 24 - (tW + nW + dW);
      ctx.fillStyle = C.muted;
      ctx.fillText(tText, rx, ty);
      rx += tW;
      type(46, "800");
      ctx.fillStyle = color;
      ctx.fillText(String(now), rx, ty);
      rx += nW;
      ctx.fillStyle = delta > 0 ? C.win : delta < 0 ? C.loss : C.muted;
      ctx.fillText(` ${deltaText}`, rx, ty);
    });
    y += rowHeights[ri] + GAP;
  });

  // Every piece's value week by week since the trade, on one scale.
  const lines = trade.sides.flatMap((side) => side.got.map((a) => ({ color: colorOf(side), points: a.path.map((p) => ({ day: p.day, value: p.value ?? 0 })) })));
  const days = trade.sides[0]?.path.map((p) => p.day) ?? [];
  const [first, last] = [days[0] ?? 0, days[days.length - 1] ?? 0];
  const chart = { x: PAD, y: y + 40, w: WIDTH - 2 * PAD, h: CHART - 110 };
  type(18, "800");
  ctx.fillStyle = C.muted;
  ctx.fillText("VALUE OVER TIME", PAD, y + 18);
  const values = lines.flatMap((l) => l.points.map((p) => p.value));
  if (values.length > 0 && last > first) {
    // From nothing up to the highest, and room over it as wide as a fair trade's sides can be apart (FAIR_SHARE): how
    // far apart two lines are is how far apart their values are, so pieces close enough to be a fair trade draw close.
    const lo = 0;
    const span = Math.max(1, Math.max(...values) * (1 + FAIR_SHARE));
    const px = (day: number) => chart.x + 16 + ((day - first) / (last - first)) * (chart.w - 32);
    const py = (v: number) => chart.y + 16 + (1 - (v - lo) / span) * (chart.h - 32);
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    for (const l of lines) {
      if (l.points.length < 2) continue;
      ctx.strokeStyle = l.color;
      ctx.beginPath();
      l.points.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.day), py(p.value)) : ctx.lineTo(px(p.day), py(p.value))));
      ctx.stroke();
    }
  }
  type(20, "600");
  ctx.fillStyle = C.muted;
  // The chart starts the day it was made.
  ctx.fillText(new Date(trade.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), chart.x, chart.y + chart.h + 32);
  const nowLabel = "Now";
  ctx.fillText(nowLabel, chart.x + chart.w - ctx.measureText(nowLabel).width, chart.y + chart.h + 32);
  // Each side's color, in the middle under it.
  type(20, "700");
  const keys = trade.sides.map((s) => fit(ctx, s.team, 220));
  const keyW = keys.reduce((sum, k) => sum + 22 + ctx.measureText(k).width + 28, -28);
  let kx = WIDTH / 2 - keyW / 2;
  trade.sides.forEach((side, i) => {
    ctx.fillStyle = colorOf(side);
    ctx.fillRect(kx, chart.y + chart.h + 18, 14, 14);
    kx += 22;
    ctx.fillText(keys[i], kx, chart.y + chart.h + 32);
    kx += ctx.measureText(keys[i]).width + 28;
  });

  // The foot: where the values come from.
  type(20, "700");
  ctx.fillStyle = C.muted;
  ctx.fillText("Commi$h · KeepTradeCut dynasty values", PAD, height - PAD + 4);
}

/** The picture as a PNG file, made at once (no waiting, so a share sheet can still open in the same tap). */
export function canvasFile(canvas: HTMLCanvasElement, name: string): File {
  const data = atob(canvas.toDataURL("image/png").split(",")[1]);
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  return new File([bytes], name, { type: "image/png" });
}
