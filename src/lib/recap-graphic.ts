// Draws the recap as a single shareable poster, iOS-card style — soft
// shadows and big rounded corners instead of hard borders. The header is
// always the write-up's own first line (never an invented one), and every
// list section is headed by the write-up's own literal header line
// (RECAP_HEADERS) where one exists in the real text. Bowl of the Week and
// Honorable Mention render as poster cards — the bowl/cup name in a
// "college sports" display font, team logos with centered names beneath
// them, a green "W"/red "L" badge on the inside of each decided matchup's
// logos (the not-yet-played upcoming matchup gets no badge — nobody's won
// yet) — and always render, even before there's a real pick to show,
// falling back to bracketed placeholders so the graphic can be previewed at
// any point in the week. High Scorer shows the top-3-scoring teams' logos
// (3rd/2nd/1st left to right) plus the winning team's top 3 players'
// headshots in a triangle, Winners lists usernames with how much they won
// by instead of a bar, Updated Standings stacks bills instead of bars, and
// Last Week's Results is a name/score/W-L table with a faint score bar
// behind each row. Renders to the clipboard as an image (see RecapEditor's
// "Copy graphic" button). Pure canvas 2D drawing, no DOM/layout dependency
// beyond the canvas itself, and not theme-reactive — this is a fixed-look
// card, not a live page.

import { RecapModel, RECAP_HEADERS, RecapSectionKey, isSectionIncluded } from "./recap-model";

const WIDTH = 1080;
const PADDING = 56;
const CONTENT_WIDTH = WIDTH - PADDING * 2;

const CARD_RADIUS = 24;
const CARD_PAD_X = 26;
const CARD_PAD_Y = 24;
const CARD_GAP = 18;

// The commish's neon palette — used as smooth gradients wherever the old
// theme had a flat orange fill, never as abruptly alternating solid blocks.
const NEON = {
  pink: "#ff2e9a",
  blue: "#22d3ee",
  green: "#39ff8e",
};

const COLOR = {
  bgTop: "#181410",
  bgBottom: "#0a0908",
  card: "rgba(255, 255, 255, 0.055)",
  bar: "rgba(255, 255, 255, 0.14)",
  primary: "#ffffff",
  secondary: "#c9c7bc",
  muted: "#87857c",
  // A single representative neon (pink) for small text/labels, where a
  // gradient fill isn't practical — larger filled areas use neonGradient.
  accent: NEON.pink,
  accentInk: "#170a10",
  hairline: "rgba(255, 255, 255, 0.12)",
  win: "#22c55e",
  loss: "#ef4444",
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

/** The High Scorer section's live data: the week's top-3-scoring teams and the winning team's top 3 individual players. */
export interface HighScorerGraphicData {
  team: MatchupTeam;
  points: string;
  /** 2nd and 3rd place, in that order (0-2 entries). */
  runnersUp: { team: MatchupTeam; points: string }[];
  /** Up to 3, highest-scoring first. */
  topPlayers: { name: string; points: string; photoUrl: string | null }[];
  /** The write-up's own sentence + detail, rendered small beneath the podium/photos. */
  captionLines: string[];
}

/** One row of the Winners section — a username and how much they won their matchup by, not a team name or a bar. */
export interface WinnerGraphicRow {
  name: string;
  avatarUrl: string | null;
  /** e.g. "+12.34" — blank when there's no real matchup to diff against yet. */
  marginLabel: string;
  highlight: boolean;
}

/** One row of the Updated Standings section — a username's running total, stacked as bills rather than a bar. */
export interface StandingsGraphicRow {
  name: string;
  avatarUrl: string | null;
  amount: number;
  amountLabel: string;
}

export interface RecapGraphicExtras {
  bowl?: DecidedMatchup | null;
  honorable?: DecidedMatchup | null;
  upcoming?: PreviewMatchup | null;
  upcomingHonorable?: PreviewMatchup | null;
  highScorer?: HighScorerGraphicData | null;
  winners?: WinnerGraphicRow[] | null;
  standings?: StandingsGraphicRow[] | null;
  /** Every team's logo, keyed by the exact display name used in the write-up text — how sections without their own structured data above (an older/plain recap) find a team's logo, since the underlying text only ever has names. */
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

/** #rrggbb -> rgba(...) at the given alpha — every neon fill goes through this so opacity stays consistent whichever of the 3 hues is in play. */
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The pink → blue → green house gradient, scoped to whatever box it's filling — never a hard cut between hues, always this same smooth 3-stop blend. */
function neonGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, alpha = 1): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, hexToRgba(NEON.pink, alpha));
  g.addColorStop(0.5, hexToRgba(NEON.blue, alpha));
  g.addColorStop(1, hexToRgba(NEON.green, alpha));
  return g;
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

/** A circular logo, or an initials badge when there's no avatar or it failed to load — optionally with a big "W"/"L" badge on the inside, bottom-right. */
function drawAvatarCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  img: HTMLImageElement | null,
  name: string,
  opts: { ring?: boolean; alpha?: number; result?: "W" | "L" } = {}
) {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  if (opts.ring) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = neonGradient(ctx, cx - r - 5, cy - r - 5, cx + r + 5, cy + r + 5);
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

  if (opts.result) {
    const badgeR = Math.max(14, r * 0.42);
    const bx = cx + r * 0.6;
    const by = cy + r * 0.6;
    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = opts.result === "W" ? COLOR.win : COLOR.loss;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLOR.bgBottom;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.round(badgeR * 1.2)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.result, bx, by + 1);
    ctx.restore();
  }
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

/** "🔹Luka" / "▫️Ivan" -> { name: "Luka", highlight: true }. Only used as a fallback for a recap with no structured winners data (an older/plain recap) — matchups.winners is preferred whenever it's present. */
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
 * so the table shows a placeholder instead of silently having nothing to
 * draw.
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
 * row (amount 0, "–" label) when it isn't in that shape yet. Only used as a
 * fallback for a recap with no structured standings data.
 */
function parseStandingsRows(text: string): { name: string; amount: number; amountLabel: string }[] {
  const rows: { name: string; amount: number; amountLabel: string }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(/^\$(-?[\d.,]+)\s+(.+)$/);
    if (match) {
      rows.push({ name: match[2].trim(), amount: parseFloat(match[1].replace(/,/g, "")), amountLabel: `$${match[1]}` });
    } else {
      rows.push({ name: line.trim(), amount: 0, amountLabel: "–" });
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
  result?: "W" | "L";
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

  /** Bowl of the Week / Honorable Mention as a poster: the name in the display font, both logos with centered names beneath, a green "W"/red "L" badge on the inside of each. */
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
        result: "W",
      });
      const loserH = this.teamColumn(false, rightCx, rowY, colWidth, avatarR, data.loser, {
        alpha: 0.5,
        nameColor: COLOR.muted,
        ring: false,
        result: "L",
      });

      if (paint) {
        this.teamColumn(true, leftCx, rowY, colWidth, avatarR, data.winner, { alpha: 1, nameColor: COLOR.primary, ring: true, result: "W" });
        this.teamColumn(true, rightCx, rowY, colWidth, avatarR, data.loser, { alpha: 0.5, nameColor: COLOR.muted, ring: false, result: "L" });
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

  /** The upcoming marquee matchup: same poster treatment, centered names beneath both logos, but neither team is bright, dimmed, or badged — nobody's won yet. */
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

  /** The top-3-scoring teams' logos (3rd, 2nd, 1st left to right, centered names beneath each) plus the winning team's top 3 players as headshots in a triangle — highest scorer on top, 2nd bottom-left, 3rd bottom-right, each with their score above their photo. The write-up's own sentence + detail render small and gray beneath, like a caption. */
  highScorerPodium(data: HighScorerGraphicData) {
    this.card((paint, inner) => {
      let h = 0;
      const ordered = [...data.runnersUp].reverse(); // [2nd, 3rd] -> [3rd, 2nd]
      ordered.push({ team: data.team, points: data.points }); // -> [3rd, 2nd, 1st]

      const colWidth = inner.width / 3;
      const avatarR = 38;
      const rowY = inner.y + h;
      const heights = ordered.map((entry, i) => {
        const isWinner = i === ordered.length - 1;
        const cx = inner.x + i * colWidth + colWidth / 2;
        return this.teamColumn(paint, cx, rowY, colWidth, isWinner ? avatarR + 6 : avatarR, entry.team, {
          alpha: isWinner ? 1 : 0.85,
          nameColor: isWinner ? COLOR.primary : COLOR.secondary,
          ring: isWinner,
        });
      });
      h += Math.max(...heights);
      h += 30;

      // The winner's top 3 players, triangled: highest on top, 2nd bottom-left, 3rd bottom-right.
      const players = [0, 1, 2].map((i) => data.topPlayers[i] ?? { name: "?", points: "–", photoUrl: null });
      const centerX = inner.x + inner.width / 2;
      const topR = 44;
      const botR = 38;
      const scoreH = 22;

      const topY = inner.y + h;
      if (paint) this.playerPhoto(centerX, topY, topR, scoreH, players[0]);
      const topBlockH = scoreH + topR * 2;

      const botOffsetX = inner.width * 0.2;
      const botY = topY + topBlockH + 22;
      if (paint) {
        this.playerPhoto(centerX - botOffsetX, botY, botR, scoreH, players[1]);
        this.playerPhoto(centerX + botOffsetX, botY, botR, scoreH, players[2]);
      }
      h += topBlockH + 22 + scoreH + botR * 2;

      for (const line of data.captionLines) {
        if (!line.trim()) continue;
        h += 14;
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

  /** One player photo with their score in accent color directly above it. */
  private playerPhoto(cx: number, y: number, r: number, scoreH: number, player: { name: string; points: string; photoUrl: string | null }) {
    this.ctx.font = `800 15px ${FONT_STACK}`;
    this.ctx.fillStyle = neonGradient(this.ctx, cx - 40, y, cx + 40, y);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "alphabetic";
    this.ctx.fillText(player.points, cx, y + scoreH - 4);
    const img = player.photoUrl ? (this.gctx.images.get(player.photoUrl) ?? null) : null;
    drawAvatarCircle(this.ctx, cx, y + scoreH + r, r, img, player.name);
  }

  /** Usernames with how much they won their matchup by, highest scorer first — no bars, just who and by how much. */
  winnersRow(header: string, rows: WinnerGraphicRow[]) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = drawText(this.ctx, paint, inner.x, inner.y, inner.width, header, {
        size: 15,
        weight: "700",
        color: COLOR.accent,
        lineHeight: 20,
      });
      h += 20;
      const n = rows.length;
      const colW = inner.width / n;
      const avatarR = 34;
      const rowY = inner.y + h;

      if (paint) {
        for (let i = 0; i < n; i++) {
          const row = rows[i];
          const cx = inner.x + i * colW + colW / 2;
          const img = row.avatarUrl ? (this.gctx.images.get(row.avatarUrl) ?? null) : null;
          drawAvatarCircle(this.ctx, cx, rowY + avatarR, avatarR, img, row.name, { ring: row.highlight });

          this.ctx.font = `${row.highlight ? "700" : "400"} 14px ${FONT_STACK}`;
          this.ctx.fillStyle = row.highlight ? COLOR.primary : COLOR.secondary;
          this.ctx.textAlign = "center";
          this.ctx.textBaseline = "alphabetic";
          const label = truncateToWidth(this.ctx, row.name, colW - 10);
          this.ctx.fillText(label, cx, rowY + avatarR * 2 + 22);

          if (row.marginLabel) {
            this.ctx.font = `700 13px ${FONT_STACK}`;
            this.ctx.fillStyle = COLOR.win;
            this.ctx.fillText(row.marginLabel, cx, rowY + avatarR * 2 + 42);
          }
        }
      }
      h += avatarR * 2 + 56;
      return h;
    });
  }

  /** A stack of bills per team, taller than a bar chart on purpose — quantized so each bill is worth at least $5 — the dollar total above the stack, the username below it. */
  standingsCashStacks(header: string, rows: StandingsGraphicRow[]) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = drawText(this.ctx, paint, inner.x, inner.y, inner.width, header, {
        size: 15,
        weight: "700",
        color: COLOR.accent,
        lineHeight: 20,
      });
      h += 24;

      const BILL_W = 46;
      const BILL_H = 14;
      const BILL_GAP = 3;
      const MAX_BILLS = 16;
      const maxAmount = Math.max(...rows.map((r) => r.amount), 0);
      const unit = Math.max(5, Math.ceil(maxAmount / MAX_BILLS / 5) * 5);
      const billCounts = rows.map((r) => (r.amount > 0 ? Math.max(1, Math.round(r.amount / unit)) : 0));
      const stackH = Math.max(...billCounts, 1) * (BILL_H + BILL_GAP);
      const amountLabelH = 24;

      const n = rows.length;
      const colW = inner.width / n;
      const baselineY = inner.y + h + amountLabelH + stackH;

      if (paint) {
        for (let i = 0; i < n; i++) {
          const row = rows[i];
          const cx = inner.x + i * colW + colW / 2;
          const count = billCounts[i];
          const thisStackH = count * (BILL_H + BILL_GAP);

          this.ctx.font = "800 16px " + FONT_STACK;
          this.ctx.fillStyle = COLOR.primary;
          this.ctx.textAlign = "center";
          this.ctx.textBaseline = "alphabetic";
          this.ctx.fillText(row.amountLabel, cx, baselineY - thisStackH - 12);

          for (let b = 0; b < count; b++) {
            const by = baselineY - (b + 1) * (BILL_H + BILL_GAP);
            roundRectPath(this.ctx, cx - BILL_W / 2, by, BILL_W, BILL_H, 3);
            this.ctx.fillStyle = neonGradient(this.ctx, cx - BILL_W / 2, by, cx + BILL_W / 2, by + BILL_H, 0.9);
            this.ctx.fill();
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
            this.ctx.stroke();
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            this.ctx.font = "700 9px " + FONT_STACK;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText("$", cx, by + BILL_H / 2 + 1);
          }

          this.ctx.font = "400 13px " + FONT_STACK;
          this.ctx.fillStyle = COLOR.secondary;
          this.ctx.textAlign = "center";
          this.ctx.textBaseline = "alphabetic";
          const label = truncateToWidth(this.ctx, row.name, colW - 10);
          this.ctx.fillText(label, cx, baselineY + 22);
        }
      }
      h += amountLabelH + stackH + 40;
      return h;
    });
  }

  /** Name on the left, score in the middle with a faint bar behind the row scaled to that score, a green "W"/red "L" on the right — one row per team. `barFloorPx` is the minimum bar width (at least the longest username in the Winners section, so even the lowest scorer's bar isn't a sliver) and `barCeilingPx` the most any bar can reach (short of the W/L column). */
  lastWeekTable(header: string, rows: { name: string; pointsLabel: string; points: number; won: boolean; resolved: boolean }[], barFloorPx: number) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = drawText(this.ctx, paint, inner.x, inner.y, inner.width, header, {
        size: 15,
        weight: "700",
        color: COLOR.accent,
        lineHeight: 20,
      });
      h += 14;
      const rowH = 34;
      const iconX = inner.x + inner.width - 6;
      const barCeilingPx = inner.width - 46; // stop short of the W/L column
      const floor = Math.min(barFloorPx, barCeilingPx);

      const resolvedPoints = rows.filter((r) => r.resolved).map((r) => r.points);
      const maxPoints = Math.max(...resolvedPoints, 0);
      const minPoints = Math.min(...resolvedPoints, maxPoints);

      if (paint) {
        const ctx = this.ctx;
        for (const row of rows) {
          const rowY = inner.y + h;
          const barW = row.resolved
            ? maxPoints === minPoints
              ? barCeilingPx
              : floor + ((row.points - minPoints) / (maxPoints - minPoints)) * (barCeilingPx - floor)
            : floor;

          roundRectPath(ctx, inner.x - 4, rowY + 2, barW + 4, rowH - 6, 8);
          ctx.fillStyle = neonGradient(ctx, inner.x, rowY, inner.x + barW, rowY, 0.12);
          ctx.fill();

          const baseline = rowY + 22;
          ctx.font = `400 18px ${FONT_STACK}`;
          ctx.fillStyle = COLOR.secondary;
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          const name = truncateToWidth(ctx, row.name, barCeilingPx * 0.5);
          ctx.fillText(name, inner.x, baseline);

          ctx.font = `700 18px ${FONT_STACK}`;
          ctx.fillStyle = COLOR.primary;
          ctx.textAlign = "right";
          ctx.fillText(row.pointsLabel, iconX - 46, baseline);

          ctx.font = `900 16px ${FONT_STACK}`;
          ctx.fillStyle = row.resolved ? (row.won ? COLOR.win : COLOR.loss) : COLOR.muted;
          ctx.textAlign = "right";
          ctx.fillText(row.resolved ? (row.won ? "W" : "L") : "–", iconX, baseline);

          h += rowH;
        }
      } else {
        h += rowH * rows.length;
      }
      return h;
    });
  }

  /** A circular logo (or an initials fallback, when there's no avatar or it failed to load) with the team's name centered beneath it — always the same height for a given avatar radius, so measure and paint passes can never disagree. */
  private teamColumn(paint: boolean, cx: number, y: number, colWidth: number, avatarR: number, team: MatchupTeam, opts: TeamColumnOpts): number {
    if (paint) {
      const img = team.avatarUrl ? (this.gctx.images.get(team.avatarUrl) ?? null) : null;
      drawAvatarCircle(this.ctx, cx, y + avatarR, avatarR, img, team.name, { ring: opts.ring, alpha: opts.alpha, result: opts.result });
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
      grad.addColorStop(0, hexToRgba(NEON.pink, 0.14));
      grad.addColorStop(0.5, hexToRgba(NEON.blue, 0.1));
      grad.addColorStop(1, hexToRgba(NEON.green, 0.06));
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

const PLACEHOLDER_HIGH_SCORER: Omit<HighScorerGraphicData, "captionLines"> = {
  team: { name: "[highest scoring team]", avatarUrl: null },
  points: "[points]",
  runnersUp: [
    { team: { name: "[2nd]", avatarUrl: null }, points: "[points]" },
    { team: { name: "[3rd]", avatarUrl: null }, points: "[points]" },
  ],
  topPlayers: [
    { name: "?", points: "–", photoUrl: null },
    { name: "?", points: "–", photoUrl: null },
    { name: "?", points: "–", photoUrl: null },
  ],
};

function winnerRowsFromModel(model: RecapModel, avatarByName: Record<string, string | null> | undefined): WinnerGraphicRow[] {
  return parseWinners(model.winners).map((w) => ({
    name: w.name,
    avatarUrl: lookupAvatar(avatarByName, w.name),
    marginLabel: "",
    highlight: w.highlight,
  }));
}

function standingsRowsFromModel(model: RecapModel, avatarByName: Record<string, string | null> | undefined): StandingsGraphicRow[] {
  return parseStandingsRows(model.standings).map((s) => ({
    name: s.name,
    avatarUrl: lookupAvatar(avatarByName, s.name),
    amount: s.amount,
    amountLabel: s.amountLabel,
  }));
}

/** The longest of `names`, measured in the same font winnersRow renders usernames in — the floor for Last Week Results' score bars, so even the lowest scorer's bar reads as a bar and not a sliver. */
function measureLongestUsername(ctx: CanvasRenderingContext2D, names: string[]): number {
  ctx.font = `700 14px ${FONT_STACK}`;
  return names.reduce((max, name) => Math.max(max, ctx.measureText(name).width), 0);
}

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
    ctx.fillStyle = neonGradient(ctx, PADDING, l.y, PADDING + badgeW, l.y);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 15px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BUFF", PADDING + badgeW / 2, l.y + badgeH / 2 + 1);
  }
  l.space(badgeH + 24);

  l.text(header, { size: 38, weight: "800", color: COLOR.primary, lineHeight: 46 });
  l.space(14);
  if (paint) {
    ctx.fillStyle = neonGradient(ctx, PADDING, l.y, PADDING + 64, l.y);
    ctx.fillRect(PADDING, l.y, 64, 5);
  }
  l.space(34);

  const included = (key: RecapSectionKey) => isSectionIncluded({ include: matchups.include ?? {} }, key);

  if (model) {
    if (included("bowl")) l.decidedMatchup(matchups.bowl ?? PLACEHOLDER_MATCHUP);
    if (included("honorable")) l.decidedMatchup(matchups.honorable ?? PLACEHOLDER_MATCHUP);
    if (included("highScorer")) {
      l.highScorerPodium(matchups.highScorer ?? { ...PLACEHOLDER_HIGH_SCORER, captionLines: [model.highScorer, model.highScorerDetail] });
    }

    const winnerRows = matchups.winners ?? winnerRowsFromModel(model, matchups.avatarByName);
    if (included("winners")) l.winnersRow(RECAP_HEADERS.winners, winnerRows);

    if (included("lastWeek")) {
      const barFloorPx = measureLongestUsername(
        ctx,
        winnerRows.map((w) => w.name)
      );
      l.lastWeekTable(RECAP_HEADERS.lastWeek, parseScoreboardRows(model.lastWeek), barFloorPx);
    }

    if (included("standings")) {
      l.standingsCashStacks(RECAP_HEADERS.standings, matchups.standings ?? standingsRowsFromModel(model, matchups.avatarByName));
    }

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
 * (RECAP_HEADERS, for the podium/table/stacks sections and the upcoming
 * matchup). `model` renders every structured section; a league without the
 * structured house style falls back to the rest of `body` as a single block
 * of text. `matchups` supplies the poster-card data (team names, logos, and
 * — for a decided game — which team won), the High Scorer/Winners/Standings
 * structured data, and the name -> logo lookup sections without their own
 * structured data fall back to; anything missing renders as bracketed
 * placeholders rather than being skipped, so the graphic can be previewed
 * before there's real data to show. Async because it has to wait for the
 * display font and any team logos/player photos to finish loading before it
 * can lay anything out.
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
    matchups.highScorer?.team.avatarUrl,
    ...(matchups.highScorer?.runnersUp.map((r) => r.team.avatarUrl) ?? []),
    ...(matchups.highScorer?.topPlayers.map((p) => p.photoUrl) ?? []),
    ...(matchups.winners?.map((w) => w.avatarUrl) ?? []),
    ...(matchups.standings?.map((s) => s.avatarUrl) ?? []),
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
