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

/** Labels' heights (screen y's) moved apart just enough not to overlap (`gap` apart), kept between `top` and `bottom`, in their order. */
function spreadPx(ys: number[], gap: number, top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y: Math.min(bottom, Math.max(top, y)), i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const over = order.length > 0 ? order[order.length - 1].y - bottom : 0;
  if (over > 0) for (const o of order) o.y -= over;
  for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - gap);
  const out = Array<number>(ys.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

/**
 * Where a value's label goes inside the chart beside a point on a line at screen y `at`: just above it or just below,
 * whichever leaves more room from the other lines there (`others`) and the labels already put beside them (`placed`)
 * — kept between `top` and `bottom`. `h`: a label's height; `pad`: the room between it and its line.
 */
function roomForPx(at: number, others: number[], placed: number[], h: number, pad: number, top: number, bottom: number): number {
  const keep = (c: number) => Math.min(bottom - h / 2, Math.max(top + h / 2, c));
  const [above, below] = [keep(at - pad - h / 2), keep(at + pad + h / 2)];
  const clearance = (c: number) => Math.min(Infinity, ...others.map((o) => Math.abs(o - c)), ...placed.map((p) => Math.abs(p - c) - h / 2));
  return clearance(below) > clearance(above) + 1 ? below : above;
}

/**
 * Draws `trade` (in league `leagueName`) onto `canvas` in export theme `themeId`: its league and date over each side's
 * block — the team (the one worth the most now marked ahead), what it got with each piece's grade then → now, any FAAB
 * and added value, and its total then → now — then every piece's value week by week on one chart from nothing up
 * (each in its side's color, named by its start, a drafted pick's dotted where it was drafted and named by its end for
 * who it became), and the source at the foot.
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
  const CHART = 510;
  const FOOTER = 64;
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
      // Each piece: its name, then its grade then → now and the change, in columns — every arrow (the total's too) one
      // above the other, however many digits are either side of it.
      const signed = (d: number | null) => (d === null ? "" : d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");
      type Row = { name: string; muted?: boolean; then?: string; now?: string; delta?: number | null; text?: string };
      const rowsOf: Row[] = [];
      if (side.got.length === 0 && side.faab === 0) rowsOf.push({ name: "Nothing", muted: true });
      for (const a of side.got) {
        const then = a.then !== null ? grade(a.then) : null;
        const now = a.now !== null ? grade(a.now) : null;
        rowsOf.push({ name: pieceName(a), then: then !== null ? String(then) : "–", now: now !== null ? String(now) : "–", delta: then !== null && now !== null ? now - then : null });
      }
      if (side.faab > 0) rowsOf.push({ name: `$${side.faab} FAAB`, muted: true });
      if (side.added > 0) rowsOf.push({ name: "Added value", muted: true, text: String(grade(side.added)) });
      const totalThen = grade(side.then + side.added);
      const totalNow = grade(side.now + side.added);
      // One place for every arrow (the total's too): as far left as the widest row needs, right of it each row's
      // value now straight after its arrow, and its change at the block's right edge.
      const widthIn = (size: number, weight: string, text: string) => {
        type(size, weight);
        return ctx.measureText(text).width;
      };
      const pieces = rowsOf.filter((r) => r.then !== undefined);
      const colGap = 10;
      const arrowW = Math.max(widthIn(30, "600", "→"), widthIn(26, "600", "→"));
      const pieceNowW = Math.max(0, ...pieces.map((r) => widthIn(26, "800", r.now!)));
      const pieceDeltaW = Math.max(0, ...pieces.map((r) => widthIn(26, "800", signed(r.delta ?? null))));
      const totalRoom = widthIn(42, "800", String(totalNow)) + colGap + widthIn(42, "800", signed(totalNow - totalThen));
      const pieceRoom = pieceNowW + colGap + pieceDeltaW;
      const right = x + colW - 24;
      const arrowMid = right - Math.max(totalRoom, pieceRoom) - colGap - arrowW / 2;
      const thenRight = arrowMid - arrowW / 2 - colGap;
      const nowLeft = arrowMid + arrowW / 2 + colGap;
      const thenW = Math.max(0, ...pieces.map((r) => widthIn(26, "600", r.then!)));
      // A row's then → now and change — in `big` type for the total.
      const numbers = (at: number, then: string, now: string, delta: number | null, nowColor: string, big = false) => {
        ctx.textAlign = "right";
        type(big ? 30 : 26, "600");
        ctx.fillStyle = C.muted;
        ctx.fillText(then, thenRight, at);
        ctx.textAlign = "center";
        ctx.fillText("→", arrowMid, at);
        ctx.textAlign = "left";
        type(big ? 42 : 26, "800");
        ctx.fillStyle = nowColor;
        ctx.fillText(now, nowLeft, at);
        // The change at the block's right edge, every row's lined up there.
        ctx.textAlign = "right";
        ctx.fillStyle = delta === null || delta === 0 ? C.muted : delta > 0 ? C.win : C.loss;
        ctx.fillText(signed(delta), right, at);
        ctx.textAlign = "left";
      };
      for (const r of rowsOf) {
        by += ROW;
        let leftOf = right;
        if (r.then !== undefined) {
          numbers(by, r.then, r.now!, r.delta ?? null, C.primary);
          leftOf = thenRight - thenW;
        } else if (r.text) {
          type(26, "800");
          ctx.fillStyle = C.secondary;
          ctx.textAlign = "right";
          ctx.fillText(r.text, right, by);
          ctx.textAlign = "left";
          leftOf = right - ctx.measureText(r.text).width;
        }
        // Smaller before it's cut short.
        const room = leftOf - 16 - (x + 24);
        for (const size of [26, 23, 20]) {
          type(size, r.muted ? "500" : "700");
          if (ctx.measureText(r.name).width <= room) break;
        }
        ctx.fillStyle = r.muted ? C.secondary : C.primary;
        ctx.fillText(fit(ctx, r.name, room), x + 24, by);
      }
      // Its total.
      const ty = y + h - 34;
      ctx.fillStyle = C.hairline;
      ctx.fillRect(x + 24, ty - 56, inner, 2);
      type(24, "800");
      ctx.fillStyle = color;
      ctx.fillText("TOTAL", x + 24, ty);
      numbers(ty, String(totalThen), String(totalNow), totalNow - totalThen, color, true);
    });
    y += rowHeights[ri] + GAP;
  });

  // Every piece's value week by week since the trade, on one scale: its name at the left by where its line starts,
  // and at the right by where it ends its value now — or, a pick that's become a player, his name, a dot on the line
  // where it did and its value now inside the chart by the line's end. Every line's value when traded inside it by
  // its start. Inside labels go over or under their line, wherever there's more room.
  const lines = trade.sides.flatMap((side) =>
    side.got.map((a) => ({ asset: a, color: colorOf(side), points: a.path.map((p) => ({ day: p.day, value: p.value ?? 0 })) }))
  );
  const days = trade.sides[0]?.path.map((p) => p.day) ?? [];
  const [first, last] = [days[0] ?? 0, days[days.length - 1] ?? 0];
  const chart = { x: PAD, y: y + 40, w: WIDTH - 2 * PAD, h: CHART - 110 };
  type(18, "800");
  ctx.fillStyle = C.muted;
  ctx.fillText("VALUE OVER TIME", PAD, y + 18);
  const named = lines.some((l) => l.asset.became);
  const NAME_W = 190;
  const plot = { x: chart.x + NAME_W + 14, y: chart.y, w: chart.w - NAME_W - 14 - (named ? NAME_W + 14 : 64), h: chart.h };
  const values = lines.flatMap((l) => l.points.map((p) => p.value));
  if (values.length > 0 && last > first) {
    // From nothing up to the highest, and room over it as wide as a fair trade's sides can be apart (FAIR_SHARE): how
    // far apart two lines are is how far apart their values are, so pieces close enough to be a fair trade draw close.
    const span = Math.max(1, Math.max(...values) * (1 + FAIR_SHARE));
    const px = (day: number) => plot.x + ((day - first) / (last - first)) * plot.w;
    const py = (v: number) => plot.y + 16 + (1 - v / span) * (plot.h - 32);
    // Its edges: a faint line up either side.
    ctx.fillStyle = C.hairline;
    ctx.fillRect(plot.x, plot.y, 2, plot.h);
    ctx.fillRect(plot.x + plot.w - 2, plot.y, 2, plot.h);
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    for (const l of lines) {
      if (l.points.length < 2) continue;
      ctx.strokeStyle = l.color;
      ctx.beginPath();
      l.points.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.day), py(p.value)) : ctx.lineTo(px(p.day), py(p.value))));
      ctx.stroke();
    }
    const startY = lines.map((l) => py(l.points[0]?.value ?? 0));
    const endY = lines.map((l) => py(l.points[l.points.length - 1]?.value ?? 0));
    // Where each pick became a player.
    for (const l of lines) {
      const at = l.asset.became?.at;
      if (at === undefined || at < first || at > last) continue;
      const point = l.points.find((p) => p.day >= at) ?? l.points[l.points.length - 1];
      if (!point) continue;
      ctx.beginPath();
      ctx.arc(px(at), py(point.value), 8, 0, Math.PI * 2);
      ctx.fillStyle = l.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.bgBottom;
      ctx.stroke();
    }
    // The names and values at either side, moved apart only as far as they'd otherwise overlap — a tick then joining
    // a moved one to its line.
    const LABEL = 30;
    // A name in the biggest of these that fits, before it's cut short.
    const fitType = (text: string, room: number) => {
      for (const size of [22, 19, 17]) {
        type(size, "700");
        if (ctx.measureText(text).width <= room) return;
      }
    };
    const lefts = spreadPx(startY, LABEL, plot.y + 12, plot.y + plot.h - 12);
    const rights = spreadPx(endY, LABEL, plot.y + 12, plot.y + plot.h - 12);
    ctx.lineWidth = 2;
    lines.forEach((l, i) => {
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      fitType(l.asset.label, NAME_W - 12);
      ctx.fillStyle = l.color;
      ctx.fillText(fit(ctx, l.asset.label, NAME_W - 12), plot.x - 14, lefts[i]);
      if (Math.abs(lefts[i] - startY[i]) > 1) {
        ctx.strokeStyle = l.color;
        ctx.beginPath();
        ctx.moveTo(plot.x - 10, lefts[i]);
        ctx.lineTo(plot.x, startY[i]);
        ctx.stroke();
      }
      ctx.textAlign = "left";
      const became = l.asset.became;
      if (became) {
        fitType(became.name, NAME_W);
        ctx.fillStyle = l.color;
        ctx.fillText(fit(ctx, became.name, NAME_W), plot.x + plot.w + 14, rights[i]);
      } else {
        type(22, "800");
        ctx.fillStyle = C.primary;
        ctx.fillText(l.asset.now !== null ? String(grade(l.asset.now)) : "–", plot.x + plot.w + 14, rights[i]);
      }
      if (Math.abs(rights[i] - endY[i]) > 1) {
        ctx.strokeStyle = l.color;
        ctx.beginPath();
        ctx.moveTo(plot.x + plot.w, endY[i]);
        ctx.lineTo(plot.x + plot.w + 10, rights[i]);
        ctx.stroke();
      }
    });
    // The values inside: each line's when traded by its start; a drafted pick's now by its end.
    const H = 22;
    const placedStarts: number[] = [];
    lines.forEach((l, i) => {
      const at = roomForPx(startY[i], startY.filter((_, j) => j !== i), placedStarts, H, 6, plot.y, plot.y + plot.h);
      placedStarts.push(at);
      type(20, "800");
      ctx.fillStyle = l.color;
      ctx.textAlign = "left";
      ctx.fillText(String(grade(l.points[0]?.value ?? 0)), plot.x + 10, at);
    });
    const placedEnds: number[] = [];
    lines.forEach((l, i) => {
      if (!l.asset.became) return;
      const at = roomForPx(endY[i], endY.filter((_, j) => j !== i), placedEnds, H, 6, plot.y, plot.y + plot.h);
      placedEnds.push(at);
      type(20, "800");
      ctx.fillStyle = l.color;
      ctx.textAlign = "right";
      ctx.fillText(l.asset.now !== null ? String(grade(l.asset.now)) : "–", plot.x + plot.w - 10, at);
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  type(20, "600");
  ctx.fillStyle = C.muted;
  // The chart starts the day it was made.
  ctx.fillText(new Date(trade.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), plot.x, chart.y + chart.h + 32);
  const nowLabel = "Now";
  ctx.fillText(nowLabel, plot.x + plot.w - ctx.measureText(nowLabel).width, chart.y + chart.h + 32);
  // Each side's color, in the middle under it, a row of its own.
  const keyY = chart.y + chart.h + 74;
  type(20, "700");
  const keys = trade.sides.map((s) => fit(ctx, s.team, 220));
  const keyW = keys.reduce((sum, k) => sum + 22 + ctx.measureText(k).width + 28, -28);
  let kx = WIDTH / 2 - keyW / 2;
  trade.sides.forEach((side, i) => {
    ctx.fillStyle = colorOf(side);
    ctx.fillRect(kx, keyY - 14, 14, 14);
    kx += 22;
    ctx.fillText(keys[i], kx, keyY);
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
