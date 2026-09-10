// Draws the recap as a single shareable poster, iOS-card style — soft
// shadows and big rounded corners instead of hard borders. The header is
// always the write-up's own first line (never an invented one), and every
// list section is headed by the write-up's own literal header line
// (RECAP_HEADERS) where one exists in the real text. Bowl of the Week and
// Honorable Mention render as poster cards — the bowl/cup name in a
// "college sports" display font, the winning team's logo and name bright,
// the losing team's dimmed (same font/logo treatment with no winner/loser
// split for the not-yet-played upcoming matchup) — and always render, even
// before there's a real pick to show, falling back to bracketed
// placeholders so the graphic can be previewed at any point in the week.
// Winners this week get a 5-step podium, the high scorer gets a bar chart
// of every team's score with their logo on each bar, updated standings get
// bars proportional to money earned (most first, left to right), and last
// week's results are a plain name/score/result-icon table. Renders to the
// clipboard as an image (see RecapEditor's "Copy graphic" button). Pure
// canvas 2D drawing, no DOM/layout dependency beyond the canvas itself, and
// not theme-reactive — this is a fixed-look card, not a live page.

import { RecapModel, RECAP_HEADERS, RecapSectionKey, isSectionIncluded } from "./recap-model";
import { ordinal } from "./format";

const WIDTH = 1080;
const PADDING = 56;
const CONTENT_WIDTH = WIDTH - PADDING * 2;

const CARD_RADIUS = 24;
const CARD_PAD_X = 26;
const CARD_PAD_Y = 24;
const CARD_GAP = 18;

const COLOR = {
  bgTop: "#181410",
  bgBottom: "#0a0908",
  card: "rgba(255, 255, 255, 0.055)",
  bar: "rgba(255, 255, 255, 0.14)",
  primary: "#ffffff",
  secondary: "#c9c7bc",
  muted: "#87857c",
  accent: "#eb6834",
  accentInk: "#1a1208",
  hairline: "rgba(255, 255, 255, 0.12)",
};

const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export interface MatchupTeam {
  name: string;
  avatarUrl: string | null;
}

/** A decided head-to-head result (Bowl of the Week / Honorable Mention) — has a winner, so the poster card can style one bright and the other dimmed. */
export interface DecidedMatchup {
  bowlName: string;
  winner: MatchupTeam;
  loser: MatchupTeam;
}

/** The upcoming marquee matchup — picked, not yet played, so both teams render the same way. */
export interface PreviewMatchup {
  bowlName: string;
  teamA: MatchupTeam;
  teamB: MatchupTeam;
}

export interface RecapGraphicExtras {
  bowl?: DecidedMatchup | null;
  honorable?: DecidedMatchup | null;
  upcoming?: PreviewMatchup | null;
  upcomingHonorable?: PreviewMatchup | null;
  /** Every team's logo, keyed by the exact display name used in the write-up text — how the podium, high-scorer chart, and standings stacks find a team's logo, since the underlying text only ever has names. */
  avatarByName?: Record<string, string | null>;
  /** CSS font-family for the "college sports" display font (see fonts.ts) — falls back to the body font stack if omitted or it fails to load in time. */
  displayFontFamily?: string;
  /** Which sections to draw — same shape and meaning as `RecapModel.include` (see recap-model.ts), normally passed straight through from it so the graphic always matches what's checked on screen. */
  include?: Partial<Record<RecapSectionKey, boolean>>;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(" ")) {
      const attempt = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(attempt).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/** Shortens `text` to fit `maxWidth` under the ctx's currently-set font, with a trailing ellipsis — for name labels next to a fixed-width bar. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A soft-shadowed rounded surface — the iOS "card" look — instead of a hard-stroked border. The shadow is scoped to just this fill via save/restore so it never bleeds onto whatever's drawn next. */
function paintCardSurface(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/** A bracket placeholder (e.g. "[Team 1]", "[highest scoring team]") has nothing sensible to take an initial from. */
function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.startsWith("[")) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function lookupAvatar(avatarByName: Record<string, string | null> | undefined, name: string): string | null {
  return avatarByName?.[name] ?? null;
}

/** A circular logo, or an initials badge when there's no avatar or it failed to load. */
function drawAvatarCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  img: HTMLImageElement | null,
  name: string,
  opts: { ring?: boolean; alpha?: number } = {}
) {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  if (opts.ring) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.accent;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#2c261c";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = `800 ${Math.round(r)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFor(name), cx, cy + 1);
  }
  ctx.restore();
}

interface TextOpts {
  size: number;
  color: string;
  weight?: string;
  style?: string;
  lineHeight?: number;
  align?: "left" | "center";
  family?: string;
}

/** Wraps and, when `paint` is true, actually draws one block of text — always returning the height it took up, so the measure pass and the paint pass can never disagree about where the next thing goes. */
function drawText(
  ctx: CanvasRenderingContext2D,
  paint: boolean,
  x: number,
  y: number,
  maxWidth: number,
  text: string,
  opts: TextOpts
): number {
  if (!text) return 0;
  const { size, color, weight = "400", style = "normal", align = "left", family = FONT_STACK } = opts;
  const lineHeight = opts.lineHeight ?? size * 1.3;
  ctx.font = `${style} ${weight} ${size}px ${family}`;
  const lines = wrapText(ctx, text, maxWidth);
  if (paint) {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    let cy = y;
    for (const line of lines) {
      ctx.fillText(line, x, cy + size);
      cy += lineHeight;
    }
  }
  return lines.length * lineHeight;
}

interface BarItem {
  name: string;
  avatarUrl: string | null;
  /** Drives bar height when `proportional`; only rank/order matters otherwise. */
  value: number;
  /** Small label drawn above the logo — a score, a dollar amount, a rank. Omitted entirely if not given. */
  valueLabel?: string;
  highlight?: boolean;
}

/** One bar per item, logo sitting on top of it, an optional value label above that and the (possibly truncated) name below — the shared chart primitive behind the podium, the high-scorer chart, and the standings stacks. Bar height is either proportional to `value` or a fixed rank-based staircase (tallest first), per `opts.proportional`. */
function barChartContent(
  ctx: CanvasRenderingContext2D,
  paint: boolean,
  inner: { x: number; y: number; width: number },
  items: BarItem[],
  images: Map<string, HTMLImageElement>,
  opts: { proportional: boolean; maxBarH: number; minBarH: number }
): number {
  const n = items.length;
  if (n === 0) return 0;
  const { maxBarH, minBarH } = opts;
  const gap = 12;
  const colW = (inner.width - gap * (n - 1)) / n;
  const avatarR = Math.max(13, Math.min(24, colW / 2 - 6));
  const barW = Math.max(10, colW - 16);

  const heights = opts.proportional
    ? (() => {
        const max = Math.max(...items.map((i) => i.value), 1);
        return items.map((i) => Math.max(minBarH, (Math.max(0, i.value) / max) * maxBarH));
      })()
    : items.map((_, idx) => Math.max(minBarH, maxBarH - idx * ((maxBarH - minBarH) / Math.max(1, n - 1))));

  const valueLabelH = 18;
  const topPad = valueLabelH + avatarR + 6;
  const baselineY = inner.y + topPad + maxBarH;

  if (paint) {
    for (let i = 0; i < n; i++) {
      const item = items[i];
      const cx = inner.x + i * (colW + gap) + colW / 2;
      const barH = heights[i];
      const barTop = baselineY - barH;

      roundRectPath(ctx, cx - barW / 2, barTop, barW, barH, Math.min(10, barW / 2));
      ctx.fillStyle = item.highlight ? COLOR.accent : COLOR.bar;
      ctx.fill();

      if (item.valueLabel) {
        ctx.font = `700 13px ${FONT_STACK}`;
        ctx.fillStyle = item.highlight ? COLOR.accent : COLOR.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(item.valueLabel, cx, inner.y + valueLabelH - 4);
      }

      const img = item.avatarUrl ? (images.get(item.avatarUrl) ?? null) : null;
      drawAvatarCircle(ctx, cx, inner.y + valueLabelH + avatarR, avatarR, img, item.name, { ring: item.highlight });

      ctx.font = `${item.highlight ? "700" : "400"} 13px ${FONT_STACK}`;
      ctx.fillStyle = item.highlight ? COLOR.primary : COLOR.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const label = truncateToWidth(ctx, item.name, colW + gap - 6);
      ctx.fillText(label, cx, baselineY + 20);
    }
  }

  return topPad + maxBarH + 30;
}

/** "🔹Luka" / "▫️Ivan" -> { name: "Luka", highlight: true }. */
function parseWinners(text: string): { name: string; highlight: boolean }[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => ({ name: line.replace(/^(🔹|▫️)/, "").trim(), highlight: line.startsWith("🔹") }));
}

/**
 * "Luka\n142.40 ✅\nMarko\n118.90 ❌..." -> one row per team, keeping the
 * original points text verbatim rather than re-formatting the parsed
 * number. A pair that isn't a real score yet (still the bracketed
 * placeholder text, e.g. "[team 1 points] [✅ for a win, ❌ for a loss]")
 * still becomes a row — `resolved: false`, a "–" in place of the score —
 * so the chart/table show a placeholder instead of silently having nothing
 * to draw.
 */
function parseScoreboardRows(text: string): { name: string; points: number; pointsLabel: string; won: boolean; resolved: boolean }[] {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const rows: { name: string; points: number; pointsLabel: string; won: boolean; resolved: boolean }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const name = lines[i];
    const match = lines[i + 1].match(/^([\d.,]+)\s*(✅|❌)?/);
    if (match) {
      rows.push({ name, points: parseFloat(match[1].replace(/,/g, "")), pointsLabel: match[1], won: match[2] === "✅", resolved: true });
    } else {
      rows.push({ name, points: 0, pointsLabel: "–", won: false, resolved: false });
    }
  }
  return rows;
}

/**
 * "$75 Luka\n$60 Ivan..." -> one row per team, keeping the original dollar
 * text verbatim. Falls back to the whole line as an unresolved placeholder
 * row (amount 0, "–" label) when it isn't in that shape yet — e.g. the
 * default single-line placeholder before any payouts exist.
 */
function parseStandingsRows(text: string): { name: string; amount: number; amountLabel: string; resolved: boolean }[] {
  const rows: { name: string; amount: number; amountLabel: string; resolved: boolean }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(/^\$(-?[\d.,]+)\s+(.+)$/);
    if (match) {
      rows.push({ name: match[2].trim(), amount: parseFloat(match[1].replace(/,/g, "")), amountLabel: `$${match[1]}`, resolved: true });
    } else {
      rows.push({ name: line.trim(), amount: 0, amountLabel: "–", resolved: false });
    }
  }
  return rows;
}

interface GraphicContext {
  images: Map<string, HTMLImageElement>;
  displayFamily: string;
  avatarByName?: Record<string, string | null>;
}

interface TeamColumnOpts {
  alpha: number;
  nameColor: string;
  ring: boolean;
}

/** One vertical cursor shared by every section. Each card measures its own content once (regardless of `paint`) to size itself, then — only when actually painting — draws its background before its content, so nothing is ever painted over an unsized box. */
class Layout {
  y = PADDING;
  constructor(
    private ctx: CanvasRenderingContext2D,
    private paint: boolean,
    private gctx: GraphicContext
  ) {}

  space(px: number) {
    this.y += px;
  }

  text(text: string, opts: TextOpts) {
    this.y += drawText(this.ctx, this.paint, PADDING, this.y, CONTENT_WIDTH, text, opts);
  }

  /** Bowl of the Week / Honorable Mention as a poster: the name in the display font, the winner's logo and name bright, the loser's dimmed, side by side. */
  decidedMatchup(data: DecidedMatchup) {
    this.posterCard((paint, inner) => {
      const cx = inner.x + inner.width / 2;
      let h = drawText(this.ctx, paint, cx, inner.y, inner.width, data.bowlName.toUpperCase(), {
        size: 32,
        color: COLOR.primary,
        lineHeight: 38,
        align: "center",
        family: this.gctx.displayFamily,
      });
      h += 26;

      const avatarR = 44;
      const colWidth = inner.width / 2 - 20;
      const leftCx = inner.x + colWidth / 2 + 4;
      const rightCx = inner.x + inner.width - colWidth / 2 - 4;
      const rowY = inner.y + h;

      const winnerH = this.teamColumn(false, leftCx, rowY, colWidth, avatarR, data.winner, {
        alpha: 1,
        nameColor: COLOR.primary,
        ring: true,
      });
      const loserH = this.teamColumn(false, rightCx, rowY, colWidth, avatarR, data.loser, {
        alpha: 0.5,
        nameColor: COLOR.muted,
        ring: false,
      });

      if (paint) {
        this.teamColumn(true, leftCx, rowY, colWidth, avatarR, data.winner, { alpha: 1, nameColor: COLOR.primary, ring: true });
        this.teamColumn(true, rightCx, rowY, colWidth, avatarR, data.loser, { alpha: 0.5, nameColor: COLOR.muted, ring: false });
        this.ctx.fillStyle = COLOR.muted;
        this.ctx.font = `700 13px ${FONT_STACK}`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("def.", cx, rowY + avatarR);
      }
      h += Math.max(winnerH, loserH);
      return h;
    });
  }

  /** The upcoming marquee matchup: same poster treatment, but neither team is bright or dimmed — nobody's won yet. */
  previewMatchup(header: string, data: PreviewMatchup) {
    this.posterCard((paint, inner) => {
      const cx = inner.x + inner.width / 2;
      let h = drawText(this.ctx, paint, cx, inner.y, inner.width, header, {
        size: 14,
        weight: "700",
        color: COLOR.accent,
        lineHeight: 18,
        align: "center",
      });
      h += 12;
      h += drawText(this.ctx, paint, cx, inner.y + h, inner.width, data.bowlName.toUpperCase(), {
        size: 30,
        color: COLOR.primary,
        lineHeight: 36,
        align: "center",
        family: this.gctx.displayFamily,
      });
      h += 24;

      const avatarR = 40;
      const colWidth = inner.width / 2 - 20;
      const leftCx = inner.x + colWidth / 2 + 4;
      const rightCx = inner.x + inner.width - colWidth / 2 - 4;
      const rowY = inner.y + h;

      const aH = this.teamColumn(false, leftCx, rowY, colWidth, avatarR, data.teamA, { alpha: 1, nameColor: COLOR.primary, ring: false });
      const bH = this.teamColumn(false, rightCx, rowY, colWidth, avatarR, data.teamB, { alpha: 1, nameColor: COLOR.primary, ring: false });

      if (paint) {
        this.teamColumn(true, leftCx, rowY, colWidth, avatarR, data.teamA, { alpha: 1, nameColor: COLOR.primary, ring: false });
        this.teamColumn(true, rightCx, rowY, colWidth, avatarR, data.teamB, { alpha: 1, nameColor: COLOR.primary, ring: false });
        this.ctx.fillStyle = COLOR.accent;
        this.ctx.font = `800 14px ${FONT_STACK}`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("VS", cx, rowY + avatarR);
      }
      h += Math.max(aH, bH);
      return h;
    });
  }

  /** A 5-step podium (or however many actually won this week) — tallest/leftmost is the top scorer among the winners. */
  winnersPodium(header: string, rows: { name: string; highlight: boolean }[]) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = drawText(this.ctx, paint, inner.x, inner.y, inner.width, header, {
        size: 15,
        weight: "700",
        color: COLOR.accent,
        lineHeight: 20,
      });
      h += 16;
      const items: BarItem[] = rows.map((r, idx) => ({
        name: r.name,
        avatarUrl: lookupAvatar(this.gctx.avatarByName, r.name),
        value: rows.length - idx,
        valueLabel: ordinal(idx + 1),
        highlight: r.highlight,
      }));
      h += barChartContent(this.ctx, paint, { x: inner.x, y: inner.y + h, width: inner.width }, items, this.gctx.images, {
        proportional: false,
        maxBarH: 110,
        minBarH: 36,
      });
      return h;
    });
  }

  /** Every team's score as a bar, that team's logo riding on top of it, the week's high scorer picked out in accent. The write-up's own sentence + detail render small and gray beneath, like a caption — the chart carries the section now. */
  highScorerChart(rows: { name: string; points: number; pointsLabel: string }[], captionLines: string[]) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      const maxPoints = Math.max(...rows.map((r) => r.points), 0);
      const items: BarItem[] = rows.map((r) => ({
        name: r.name,
        avatarUrl: lookupAvatar(this.gctx.avatarByName, r.name),
        value: r.points,
        valueLabel: r.pointsLabel,
        highlight: r.points === maxPoints,
      }));
      let h = barChartContent(this.ctx, paint, { x: inner.x, y: inner.y, width: inner.width }, items, this.gctx.images, {
        proportional: true,
        maxBarH: 120,
        minBarH: 30,
      });
      for (const line of captionLines) {
        if (!line.trim()) continue;
        h += 10;
        h += drawText(this.ctx, paint, inner.x, inner.y + h, inner.width, line, {
          size: 15,
          style: "italic",
          color: COLOR.muted,
          lineHeight: 20,
        });
      }
      return h;
    });
  }

  /** Bars proportional to money earned this season, richest team first (left) to least (right), that team's logo on top of its bar. */
  standingsStacks(header: string, rows: { name: string; amount: number; amountLabel: string }[]) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = drawText(this.ctx, paint, inner.x, inner.y, inner.width, header, {
        size: 15,
        weight: "700",
        color: COLOR.accent,
        lineHeight: 20,
      });
      h += 16;
      const items: BarItem[] = rows.map((r, idx) => ({
        name: r.name,
        avatarUrl: lookupAvatar(this.gctx.avatarByName, r.name),
        value: r.amount,
        valueLabel: r.amountLabel,
        highlight: idx === 0,
      }));
      h += barChartContent(this.ctx, paint, { x: inner.x, y: inner.y + h, width: inner.width }, items, this.gctx.images, {
        proportional: true,
        maxBarH: 120,
        minBarH: 26,
      });
      return h;
    });
  }

  /** Name on the left, score in the middle, result icon on the right — one row per team. */
  lastWeekTable(header: string, rows: { name: string; pointsLabel: string; won: boolean; resolved: boolean }[]) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = drawText(this.ctx, paint, inner.x, inner.y, inner.width, header, {
        size: 15,
        weight: "700",
        color: COLOR.accent,
        lineHeight: 20,
      });
      h += 14;
      const rowH = 32;
      const scoreCx = inner.x + inner.width * 0.62;
      const iconX = inner.x + inner.width - 6;
      if (paint) {
        const ctx = this.ctx;
        for (const row of rows) {
          const baseline = inner.y + h + 16;

          ctx.font = `400 18px ${FONT_STACK}`;
          ctx.fillStyle = COLOR.secondary;
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          const name = truncateToWidth(ctx, row.name, scoreCx - inner.x - 100);
          ctx.fillText(name, inner.x, baseline);

          ctx.font = `700 18px ${FONT_STACK}`;
          ctx.fillStyle = COLOR.primary;
          ctx.textAlign = "center";
          ctx.fillText(row.pointsLabel, scoreCx, baseline);

          ctx.font = `16px ${FONT_STACK}`;
          ctx.fillStyle = COLOR.muted;
          ctx.textAlign = "right";
          ctx.fillText(row.resolved ? (row.won ? "✅" : "❌") : "–", iconX, baseline);

          h += rowH;
        }
      } else {
        h += rowH * rows.length;
      }
      return h;
    });
  }

  /** A circular logo (or an initials fallback, when there's no avatar or it failed to load) with the team's name beneath it — always the same height for a given avatar radius, so measure and paint passes can never disagree. */
  private teamColumn(paint: boolean, cx: number, y: number, colWidth: number, avatarR: number, team: MatchupTeam, opts: TeamColumnOpts): number {
    if (paint) {
      const img = team.avatarUrl ? (this.gctx.images.get(team.avatarUrl) ?? null) : null;
      drawAvatarCircle(this.ctx, cx, y + avatarR, avatarR, img, team.name, { ring: opts.ring, alpha: opts.alpha });
    }
    let h = avatarR * 2 + 12;
    h += drawText(this.ctx, paint, cx, y + h, colWidth, team.name, {
      size: 19,
      weight: "700",
      color: opts.nameColor,
      lineHeight: 24,
      align: "center",
    });
    return h;
  }

  private card(render: (paint: boolean, inner: { x: number; y: number; width: number }) => number) {
    const innerX = PADDING + CARD_PAD_X;
    const innerWidth = CONTENT_WIDTH - CARD_PAD_X * 2;
    const innerHeight = render(false, { x: innerX, y: 0, width: innerWidth });
    const cardHeight = innerHeight + CARD_PAD_Y * 2;

    if (this.paint) {
      paintCardSurface(this.ctx, PADDING, this.y, CONTENT_WIDTH, cardHeight, CARD_RADIUS, COLOR.card);
      render(true, { x: innerX, y: this.y + CARD_PAD_Y, width: innerWidth });
    }
    this.y += cardHeight + CARD_GAP;
  }

  private posterCard(render: (paint: boolean, inner: { x: number; y: number; width: number }) => number) {
    const padX = CARD_PAD_X + 6;
    const padY = CARD_PAD_Y + 8;
    const innerX = PADDING + padX;
    const innerWidth = CONTENT_WIDTH - padX * 2;
    const innerHeight = render(false, { x: innerX, y: 0, width: innerWidth });
    const cardHeight = innerHeight + padY * 2;

    if (this.paint) {
      const ctx = this.ctx;
      const grad = ctx.createLinearGradient(0, this.y, 0, this.y + cardHeight);
      grad.addColorStop(0, "rgba(235, 104, 52, 0.16)");
      grad.addColorStop(1, "rgba(235, 104, 52, 0.04)");
      paintCardSurface(ctx, PADDING, this.y, CONTENT_WIDTH, cardHeight, CARD_RADIUS + 4, grad);
      render(true, { x: innerX, y: this.y + padY, width: innerWidth });
    }
    this.y += cardHeight + CARD_GAP + 4;
  }
}

const PLACEHOLDER_MATCHUP: DecidedMatchup = {
  bowlName: "[Bowl Game Name]",
  winner: { name: "[Team 1]", avatarUrl: null },
  loser: { name: "[Team 2]", avatarUrl: null },
};

const PLACEHOLDER_PREVIEW: PreviewMatchup = {
  bowlName: "[Bowl Game Name]",
  teamA: { name: "[Team 1]", avatarUrl: null },
  teamB: { name: "[Team 2]", avatarUrl: null },
};

function runLayout(
  ctx: CanvasRenderingContext2D,
  header: string,
  model: RecapModel | null,
  restBody: string,
  matchups: RecapGraphicExtras,
  gctx: GraphicContext,
  paint: boolean
): number {
  const l = new Layout(ctx, paint, gctx);

  const badgeW = 92;
  const badgeH = 32;
  if (paint) {
    roundRectPath(ctx, PADDING, l.y, badgeW, badgeH, 8);
    ctx.fillStyle = COLOR.accent;
    ctx.fill();
    ctx.fillStyle = COLOR.accentInk;
    ctx.font = `800 15px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BUFF", PADDING + badgeW / 2, l.y + badgeH / 2 + 1);
  }
  l.space(badgeH + 24);

  l.text(header, { size: 38, weight: "800", color: COLOR.primary, lineHeight: 46 });
  l.space(14);
  if (paint) {
    ctx.fillStyle = COLOR.accent;
    ctx.fillRect(PADDING, l.y, 64, 5);
  }
  l.space(34);

  const included = (key: RecapSectionKey) => isSectionIncluded({ include: matchups.include ?? {} }, key);

  if (model) {
    if (included("bowl")) l.decidedMatchup(matchups.bowl ?? PLACEHOLDER_MATCHUP);
    if (included("honorable")) l.decidedMatchup(matchups.honorable ?? PLACEHOLDER_MATCHUP);
    if (included("highScorer")) l.highScorerChart(parseScoreboardRows(model.lastWeek), [model.highScorer, model.highScorerDetail]);
    if (included("winners")) l.winnersPodium(RECAP_HEADERS.winners, parseWinners(model.winners));
    if (included("lastWeek")) l.lastWeekTable(RECAP_HEADERS.lastWeek, parseScoreboardRows(model.lastWeek));
    if (included("standings")) l.standingsStacks(RECAP_HEADERS.standings, parseStandingsRows(model.standings));
    if (included("upcomingBowl")) l.previewMatchup(RECAP_HEADERS.upcomingBowl, matchups.upcoming ?? PLACEHOLDER_PREVIEW);
    if (included("upcomingHonorable")) l.previewMatchup(RECAP_HEADERS.upcomingHonorable, matchups.upcomingHonorable ?? PLACEHOLDER_PREVIEW);
  } else if (restBody.trim()) {
    l.text(restBody, { size: 19, color: COLOR.secondary, lineHeight: 27 });
    l.space(20);
  }

  if (paint) {
    ctx.strokeStyle = COLOR.hairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, l.y);
    ctx.lineTo(WIDTH - PADDING, l.y);
    ctx.stroke();
  }
  l.space(28);
  l.text("BUFF · Fantasy Recap", { size: 14, weight: "700", color: COLOR.muted });

  return l.y + PADDING;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Anonymous CORS mode: either the CDN allows it and the image loads
    // cleanly (safe to export afterwards), or the request is refused and
    // onerror fires — never a silently-tainted canvas that throws only
    // later, on export.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Loads every distinct avatar URL in parallel; a missing or failed one is simply absent from the map, so callers fall back to an initials badge rather than blocking or failing the whole graphic. */
async function preloadImages(urls: (string | null | undefined)[]): Promise<Map<string, HTMLImageElement>> {
  const unique = Array.from(new Set(urls.filter((u): u is string => !!u)));
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    unique.map(async (url) => {
      const img = await loadImage(url);
      if (img) map.set(url, img);
    })
  );
  return map;
}

/** Forces the display font's glyphs to actually download before it's used in canvas text — canvas drawing doesn't wait for async font loads on its own. Falls back to the body font stack if there's no font, or it fails to load (e.g. offline). */
async function ensureDisplayFont(family: string | undefined): Promise<string> {
  if (!family || typeof document === "undefined" || !document.fonts) return FONT_STACK;
  try {
    await document.fonts.load(`400 40px ${family}`);
    return family;
  } catch {
    return FONT_STACK;
  }
}

/**
 * Renders `body` (exactly what gets saved/copied/posted — see
 * joinRecapModel) onto `canvas`, sized to fit the content, so the caller
 * should create it fresh and not assume a fixed height. The header is
 * always `body`'s own first line — never a separately-composed title — and
 * every section header is either that same first-line convention (the bowl
 * results) or one of the write-up's own literal header lines
 * (RECAP_HEADERS, for the podium/chart/stacks/table sections and the
 * upcoming matchup). `model` renders every structured section; a league
 * without the structured house style falls back to the rest of `body` as a
 * single block of text. `matchups` supplies the poster-card data (team
 * names, logos, and — for a decided game — which team won) and the
 * name -> logo lookup the other sections use; anything missing renders as
 * bracketed placeholders rather than being skipped, so the graphic can be
 * previewed before there's real data to show. Async because it has to wait
 * for the display font and any team logos to finish loading before it can
 * lay anything out.
 */
export async function drawRecapGraphic(
  canvas: HTMLCanvasElement,
  body: string,
  model: RecapModel | null,
  matchups: RecapGraphicExtras = {}
): Promise<void> {
  const lines = body.split("\n");
  const header = lines[0] ?? "";
  const restBody = model ? "" : lines.slice(1).join("\n").replace(/^\n+/, "");

  const avatarUrls = [
    matchups.bowl?.winner.avatarUrl,
    matchups.bowl?.loser.avatarUrl,
    matchups.honorable?.winner.avatarUrl,
    matchups.honorable?.loser.avatarUrl,
    matchups.upcoming?.teamA.avatarUrl,
    matchups.upcoming?.teamB.avatarUrl,
    matchups.upcomingHonorable?.teamA.avatarUrl,
    matchups.upcomingHonorable?.teamB.avatarUrl,
    ...Object.values(matchups.avatarByName ?? {}),
  ];
  const [images, displayFamily] = await Promise.all([preloadImages(avatarUrls), ensureDisplayFont(matchups.displayFontFamily)]);
  const gctx: GraphicContext = { images, displayFamily, avatarByName: matchups.avatarByName };

  const measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) throw new Error("Couldn't measure the graphic — canvas isn't supported here.");
  const height = runLayout(measureCtx, header, model, restBody, matchups, gctx, false);

  const scale = 2; // draw at 2x for a crisp image on high-density screens
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the graphic — canvas isn't supported here.");
  ctx.scale(scale, scale);

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, COLOR.bgTop);
  grad.addColorStop(1, COLOR.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, height);

  runLayout(ctx, header, model, restBody, matchups, gctx, true);
}
