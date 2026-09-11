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

import { RecapModel, RecapSectionKey, isSectionIncluded, upcomingWeekLabel, WHO_WILL_PREVAIL, GOOD_LUCK_TO_ALL } from "./recap-model";

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
  /** An auto-generated summary sentence (e.g. "X put up the week's highest score."), computed live from the same data as the podium above it — not the write-up's own possibly-stale saved text — and rendered beneath it in the same bright bold white as Detail text. */
  sentence: string;
  /** The write-up's own freeform commentary for this section, rendered bright white and bold beneath the sentence — same treatment. */
  detail: string;
}

/** One row of the Winners section — a username and how much they won their matchup by, not a team name or a bar. */
export interface WinnerGraphicRow {
  name: string;
  avatarUrl: string | null;
  /** e.g. "$30" — how much they won this week, shown above their logo. Blank when there's no payout to show yet. */
  amountLabel: string;
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
  /** Live per-team rows for Last Week Results, by team name (not the ledger's real-person manager name, which is what the flattened text's own Last Week block uses). Null falls back to parsing that flattened text. */
  lastWeek?: { name: string; pointsLabel: string; points: number; won: boolean; resolved: boolean }[] | null;
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
  opts: { ring?: boolean; alpha?: number } = {}
) {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  if (opts.ring) {
    // A stroked ring (not a filled disk) held a few px off the logo — the
    // gap is simply never painted, so it just shows whatever's already
    // there (the card's own background), rather than relying on a
    // transparency trick that different viewers/paste targets can render
    // differently (some show real alpha as white).
    const gap = 3;
    const thickness = 7;
    const ringRadius = r + gap + thickness / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.lineWidth = thickness;
    ctx.strokeStyle = neonGradient(ctx, cx - ringRadius, cy - ringRadius, cx + ringRadius, cy + ringRadius);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    // Crop to a centered square first (like CSS object-fit: cover) instead
    // of stretching the whole source into the circle — player headshots in
    // particular are taller than they are wide, and drawing the full frame
    // into a square squeezed them horizontally, distorting every face.
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw > 0 && ih > 0) {
      const side = Math.min(iw, ih);
      ctx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    }
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
  color: string | CanvasGradient;
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
    ctx.textBaseline = "alphabetic";
    let cy = y;
    for (const line of lines) {
      // Centering by hand (measure the line, offset from x) rather than
      // ctx.textAlign="center" — team names sometimes end in emoji, and
      // this canvas's native center alignment measurably mispositions
      // strings containing them (the glyph renders off to one side of
      // where the reported width says its center should be).
      if (align === "center") {
        const lineWidth = ctx.measureText(line).width;
        ctx.textAlign = "left";
        ctx.fillText(line, x - lineWidth / 2, cy + size);
      } else {
        ctx.textAlign = align;
        ctx.fillText(line, x, cy + size);
      }
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
}

interface SectionTitle {
  emoji: string;
  label: string;
}

/**
 * Section-card titles used only by the graphic itself — shorter, and with a
 * more literal emoji, than the write-up's own RECAP_HEADERS text.
 * RECAP_HEADERS stays exactly as saved recaps already have it (it's the
 * literal line recap-model.ts's parser matches on to read an archived
 * write-up back into structured fields), so these are graphic-only and
 * never touch the flattened text that gets saved/copied/posted. Emoji and
 * label are kept separate (see sectionHeader) so the emoji can be drawn
 * with a plain fillStyle — a CanvasGradient fillStyle applied across an
 * emoji glyph can make it render tinted instead of its native color.
 */
const GRAPHIC_SECTION_TITLE: Record<
  "highScorer" | "winners" | "lastWeek" | "standings" | "upcomingBowl" | "upcomingHonorable",
  SectionTitle
> = {
  highScorer: { emoji: "🏆", label: "High Scorer" },
  winners: { emoji: "💵", label: "Winners" },
  lastWeek: { emoji: "📊", label: "Last Week" },
  standings: { emoji: "💰", label: "Standings" },
  upcomingBowl: { emoji: "🏈", label: "Matchup of the Week" },
  upcomingHonorable: { emoji: "🥈", label: "Honorable Mention" },
};

/** Gold / silver / bronze, each a light-metal-light sweep for a shiny highlight rather than a flat tint. */
const RANK_METAL: Record<1 | 2 | 3, [string, string, string]> = {
  1: ["#fff6d8", "#d4af37", "#fff6d8"],
  2: ["#f6f7f8", "#a7abb0", "#f6f7f8"],
  3: ["#f4c99a", "#a9653a", "#f4c99a"],
};

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

  /** A standalone title between Updated Standings and the upcoming matchup posters — not inside a card, same display font as the bowl names but bigger. */
  upcomingTitle(text: string) {
    const cx = PADDING + CONTENT_WIDTH / 2;
    this.y += drawText(this.ctx, this.paint, cx, this.y, CONTENT_WIDTH, text.toUpperCase(), {
      size: 44,
      weight: "800",
      color: COLOR.primary,
      lineHeight: 50,
      align: "center",
      family: this.gctx.displayFamily,
    });
    this.space(16);
  }

  /** Bowl of the Week / Honorable Mention as a poster: the name in the display font, both logos with centered names beneath, "W  defeated  L" in the middle — not on the logos themselves, which stay clear — and, when there's commentary, the write-up's own Detail text in bright white beneath it all. */
  decidedMatchup(data: DecidedMatchup, detail?: string) {
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
      const leftCx = inner.x + inner.width * 0.25;
      const rightCx = inner.x + inner.width * 0.75;
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
        this.resultLine(leftCx, rightCx, rowY + avatarR, avatarR);
      }
      h += Math.max(winnerH, loserH);

      if (detail?.trim()) {
        h += 20;
        h += drawText(this.ctx, paint, cx, inner.y + h, inner.width, detail, {
          size: 18,
          weight: "800",
          color: COLOR.primary,
          lineHeight: 24,
          align: "center",
        });
      }
      return h;
    });
  }

  /**
   * "W  defeated  L" in the space between the two logos, not on top of
   * either. "defeated" sits centered between them; W and L each sit at the
   * midpoint of the actual gap between their own logo's edge and
   * "defeated" — splitting the difference of the visible space, not the
   * distance between logo centers, which would drag them out toward the
   * logos instead of in toward the word. W/L render at half the logos'
   * diameter, so they read as a real result, not a tiny label.
   */
  private resultLine(leftCx: number, rightCx: number, y: number, avatarR: number) {
    const ctx = this.ctx;
    const cx = (leftCx + rightCx) / 2;
    // A bold sans's cap-height runs ~0.72 of its nominal font-size, so hitting
    // an actual glyph height of avatarR (half the logos' diameter, 2*avatarR)
    // needs a bigger font-size than avatarR itself.
    const letterSize = Math.round(avatarR / 0.72);
    const letterFont = `800 ${letterSize}px ${FONT_STACK}`;
    const midFont = `600 ${Math.round(letterSize * 0.24)}px ${FONT_STACK}`;
    const midText = "defeated";

    ctx.font = midFont;
    const midWidth = ctx.measureText(midText).width;
    const midLeft = cx - midWidth / 2;
    const midRight = cx + midWidth / 2;
    const leftLogoEdge = leftCx + avatarR;
    const rightLogoEdge = rightCx - avatarR;
    const wCx = (leftLogoEdge + midLeft) / 2;
    const lCx = (midRight + rightLogoEdge) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = midFont;
    ctx.fillStyle = COLOR.secondary;
    ctx.fillText(midText, cx, y);

    ctx.font = letterFont;
    ctx.fillStyle = COLOR.win;
    ctx.fillText("W", wCx, y);

    ctx.fillStyle = COLOR.loss;
    ctx.fillText("L", lCx, y);
  }

  /**
   * The upcoming marquee matchup: same poster treatment, centered names
   * beneath both logos, but neither team is bright, dimmed, or badged —
   * nobody's won yet. `detail` (the write-up's own commentary) renders
   * bright white beneath the matchup, and `trailer` (WHO_WILL_PREVAIL /
   * GOOD_LUCK_TO_ALL) renders right after it in the theme's straight
   * green (not a gradient), exactly where the flattened text has it — at
   * the end of the detail.
   */
  previewMatchup(title: SectionTitle, data: PreviewMatchup, detail?: string, trailer?: string) {
    this.posterCard((paint, inner) => {
      const cx = inner.x + inner.width / 2;
      let h = this.sectionHeader(paint, inner, title);
      h += 16;
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
      const leftCx = inner.x + inner.width * 0.25;
      const rightCx = inner.x + inner.width * 0.75;
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

      if (detail?.trim()) {
        h += 20;
        h += drawText(this.ctx, paint, cx, inner.y + h, inner.width, detail, {
          size: 18,
          weight: "800",
          color: COLOR.primary,
          lineHeight: 24,
          align: "center",
        });
      }
      if (trailer) {
        h += 14;
        if (paint) {
          const ctx = this.ctx;
          ctx.font = `800 18px ${FONT_STACK}`;
          const w = ctx.measureText(trailer).width;
          ctx.fillStyle = NEON.green;
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(trailer, cx - w / 2, inner.y + h + 18);
        }
        h += 24;
      }
      return h;
    });
  }

  /** "🏆 High Scorer": the top-3-scoring teams on the left — a shiny gold/silver/bronze rank label above each logo, staggered into a real podium (1st highest, 2nd a bit lower, 3rd lower still), 2nd/3rd dimmed, that team's points below the logo instead of its name — and the winning team's top 3 players on the right, headshots triangled: highest scorer on top, 2nd bottom-left, 3rd bottom-right, each with their score above their photo. The write-up's own sentence + detail render small and gray beneath, like a caption. */
  highScorerPodium(title: SectionTitle, data: HighScorerGraphicData) {
    this.card((paint, inner) => {
      let h = this.sectionHeader(paint, inner, title);
      h += 28;
      const rowY = inner.y + h;

      // Left half: the 3 highest-scoring teams, side by side, staggered
      // into a podium — 1st sits highest (no offset), 2nd a step lower,
      // 3rd lower still.
      const ordered = [...data.runnersUp].reverse(); // [2nd, 3rd] -> [3rd, 2nd]
      ordered.push({ team: data.team, points: data.points }); // -> [3rd, 2nd, 1st]
      const leftW = inner.width * 0.46;
      const teamColW = leftW / ordered.length;
      const labelSize = 17;
      const STAGGER_STEP = 20;
      let teamsH = 0;
      ordered.forEach((entry, i) => {
        const isTop = i === ordered.length - 1;
        const isSecond = i === ordered.length - 2;
        const rank: 1 | 2 | 3 = isTop ? 1 : isSecond ? 2 : 3;
        const rankLabel = rank === 1 ? "1ST" : rank === 2 ? "2ND" : "3RD";
        const r = isTop ? 36 : isSecond ? 30 : 26;
        const cx = inner.x + teamColW * (i + 0.5);
        const stagger = (ordered.length - 1 - i) * STAGGER_STEP;
        const colY = rowY + stagger;

        let labelColor: string | CanvasGradient = COLOR.primary;
        if (paint) {
          this.ctx.font = `800 ${labelSize}px ${FONT_STACK}`;
          const labelW = this.ctx.measureText(rankLabel).width;
          const [c0, c1, c2] = RANK_METAL[rank];
          const g = this.ctx.createLinearGradient(cx - labelW / 2, colY, cx + labelW / 2, colY);
          g.addColorStop(0, c0);
          g.addColorStop(0.5, c1);
          g.addColorStop(1, c2);
          labelColor = g;
        }
        // Extra clearance below the label (on top of its own line-height)
        // so the bigger label never crowds 1st place's outer ring.
        let rowH = drawText(this.ctx, paint, cx, colY, teamColW, rankLabel, {
          size: labelSize,
          weight: "800",
          color: labelColor,
          lineHeight: labelSize + 6,
          align: "center",
        });
        rowH += 14;
        if (paint) {
          const img = entry.team.avatarUrl ? (this.gctx.images.get(entry.team.avatarUrl) ?? null) : null;
          drawAvatarCircle(this.ctx, cx, colY + rowH + r, r, img, entry.team.name, { ring: isTop, alpha: isTop ? 1 : 0.75 });
        }
        rowH += r * 2 + 10;
        rowH += drawText(this.ctx, paint, cx, colY + rowH, teamColW, entry.points, {
          size: isTop ? 16 : 13,
          weight: isTop ? "800" : "600",
          color: isTop ? COLOR.primary : COLOR.secondary,
          lineHeight: 18,
          align: "center",
        });
        teamsH = Math.max(teamsH, stagger + rowH);
      });

      // Right half: the winner's top 3 players, triangled — highest on top, 2nd bottom-left, 3rd bottom-right.
      const players = [0, 1, 2].map((i) => data.topPlayers[i] ?? { name: "?", points: "–", photoUrl: null });
      const rightX = inner.x + inner.width * 0.56;
      const rightW = inner.width * 0.44;
      const centerX = rightX + rightW / 2;
      const offsetX = rightW * 0.3;
      const columnX = [centerX - offsetX, centerX, centerX + offsetX];
      const topR = 36;
      const botR = 30;
      const scoreH = 20;

      if (paint) this.playerPhoto(columnX[1], rowY, topR, scoreH, players[0]);
      const topBlockH = scoreH + topR * 2;
      const botY = rowY + topBlockH + 18;
      if (paint) {
        this.playerPhoto(columnX[0], botY, botR, scoreH, players[1]);
        this.playerPhoto(columnX[2], botY, botR, scoreH, players[2]);
      }
      const playersH = topBlockH + 18 + scoreH + botR * 2;

      h += Math.max(teamsH, playersH);
      h += 26;

      if (data.sentence.trim()) {
        h += 14;
        h += drawText(this.ctx, paint, inner.x, inner.y + h, inner.width, data.sentence, {
          size: 18,
          weight: "800",
          color: COLOR.primary,
          lineHeight: 24,
        });
      }
      if (data.detail.trim()) {
        h += 14;
        h += drawText(this.ctx, paint, inner.x, inner.y + h, inner.width, data.detail, {
          size: 18,
          weight: "800",
          color: COLOR.primary,
          lineHeight: 24,
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

  /** Usernames with how much they won this week (above the logo) and how much they won their matchup by (below the username), highest scorer first — no bars, just who and how much. */
  winnersRow(title: SectionTitle, rows: WinnerGraphicRow[], detail?: string) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = this.sectionHeader(paint, inner, title);
      h += 28;
      const n = rows.length;
      const colW = inner.width / n;
      const avatarR = 34;
      // The dollar amount gets its own reserved band above the avatar row,
      // so it can never climb back up into the header above it.
      const amountBaselineY = inner.y + h + 16;
      h += 34;
      const rowY = inner.y + h;

      if (paint) {
        for (let i = 0; i < n; i++) {
          const row = rows[i];
          const cx = inner.x + i * colW + colW / 2;

          if (row.amountLabel) {
            this.ctx.font = "800 16px " + FONT_STACK;
            this.ctx.fillStyle = COLOR.primary;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "alphabetic";
            this.ctx.fillText(row.amountLabel, cx, amountBaselineY);
          }

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

      if (detail?.trim()) {
        h += 6;
        h += drawText(this.ctx, paint, inner.x, inner.y + h, inner.width, detail, {
          size: 18,
          weight: "800",
          color: COLOR.primary,
          lineHeight: 24,
        });
      }
      return h;
    });
  }

  /** A stack of bills per team, taller than a bar chart on purpose — quantized so each bill is worth at least $15 — the dollar total above the stack, the username below it. */
  standingsCashStacks(title: SectionTitle, rows: StandingsGraphicRow[], detail?: string) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = this.sectionHeader(paint, inner, title);
      h += 28;

      const BILL_W = 46;
      const BILL_H = 14;
      const BILL_GAP = 3;
      const MAX_BILLS = 16;
      const maxAmount = Math.max(...rows.map((r) => r.amount), 0);
      const unit = Math.max(15, Math.ceil(maxAmount / MAX_BILLS / 15) * 15);
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

      if (detail?.trim()) {
        h += 6;
        h += drawText(this.ctx, paint, inner.x, inner.y + h, inner.width, detail, {
          size: 18,
          weight: "800",
          color: COLOR.primary,
          lineHeight: 24,
        });
      }
      return h;
    });
  }

  /** Name on the left, score in the middle with a faint bar behind the row scaled to that score, a green "W"/red "L" on the right — one row per team. `barFloorPx` is the minimum bar width (past the longest name actually shown here, so a bar never starts underneath its own row's name, and even the lowest scorer's bar isn't a sliver) and `barCeilingPx` the most any bar can reach (short of the W/L column). */
  lastWeekTable(
    title: SectionTitle,
    rows: { name: string; pointsLabel: string; points: number; won: boolean; resolved: boolean }[],
    barFloorPx: number,
    detail?: string
  ) {
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = this.sectionHeader(paint, inner, title);
      h += 28;
      const rowH = 34;
      const iconX = inner.x + inner.width - 6;
      const barCeilingPx = inner.width - 46; // stop short of the W/L column
      const floor = Math.min(barFloorPx, barCeilingPx);

      const resolvedPoints = rows.filter((r) => r.resolved).map((r) => r.points);
      const maxPoints = Math.max(...resolvedPoints, 0);
      const minPoints = Math.min(...resolvedPoints, maxPoints);

      if (paint) {
        const ctx = this.ctx;
        // One gradient spanning the full floor-to-ceiling range, reused for
        // every row's (narrower) fill — so a low scorer's bar only
        // "uncovers" the gradient's early portion, and only the highest
        // scorer's bar (at barCeilingPx) ever shows the whole pink-to-green
        // sweep, rather than every bar re-stretching its own copy across
        // whatever width it happens to be.
        const sharedBarGradient = neonGradient(ctx, inner.x, inner.y, inner.x + barCeilingPx, inner.y, 0.14);
        for (const row of rows) {
          const rowY = inner.y + h;
          const barW = row.resolved
            ? maxPoints === minPoints
              ? barCeilingPx
              : floor + ((row.points - minPoints) / (maxPoints - minPoints)) * (barCeilingPx - floor)
            : floor;

          roundRectPath(ctx, inner.x - 4, rowY + 2, barW + 4, rowH - 6, 8);
          ctx.fillStyle = sharedBarGradient;
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

      if (detail?.trim()) {
        h += 16;
        h += drawText(this.ctx, paint, inner.x, inner.y + h, inner.width, detail, {
          size: 18,
          weight: "800",
          color: COLOR.primary,
          lineHeight: 24,
        });
      }
      return h;
    });
  }

  /**
   * A section card's title: centered, bigger than the body text (though
   * still smaller than a matchup's own bowl name), the emoji bookending the
   * label on both sides — every section (including the two upcoming-matchup
   * previews) uses this. The emoji are each drawn as their own fillText
   * with a plain fillStyle, not the label's color — a CanvasGradient
   * fillStyle applied across an emoji glyph can make some renderers tint
   * it instead of leaving its native color (moot now the label itself is
   * solid, but the emoji still gets its own fillText either way). The
   * label is solid cyan, the theme's single representative neon.
   */
  private sectionHeader(paint: boolean, inner: { x: number; y: number; width: number }, title: SectionTitle): number {
    const ctx = this.ctx;
    const size = 24;
    const lineHeight = 30;
    if (paint) {
      ctx.font = `800 ${size}px ${FONT_STACK}`;
      const gap = 10;
      const emojiW = ctx.measureText(title.emoji).width;
      const labelW = ctx.measureText(title.label).width;
      const totalW = emojiW * 2 + gap * 2 + labelW;
      const cx = inner.x + inner.width / 2;
      const startX = cx - totalW / 2;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = COLOR.primary;
      ctx.fillText(title.emoji, startX, inner.y + size);
      ctx.fillStyle = NEON.blue;
      ctx.fillText(title.label, startX + emojiW + gap, inner.y + size);
      ctx.fillStyle = COLOR.primary;
      ctx.fillText(title.emoji, startX + emojiW + gap + labelW + gap, inner.y + size);
    }
    return lineHeight;
  }

  /** A circular logo (or an initials fallback, when there's no avatar or it failed to load) with the team's name centered beneath it — always the same height for a given avatar radius, so measure and paint passes can never disagree. */
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

const PLACEHOLDER_HIGH_SCORER: Omit<HighScorerGraphicData, "sentence" | "detail"> = {
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
    amountLabel: "",
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

/** The longest of `names` at the given font — the floor for Last Week Results' score bars, so a bar's start (and its "0") never lands underneath the name text instead of past the end of it, and even the lowest scorer's bar still reads as a bar rather than a sliver. `font` must match whatever the caller actually renders those names in, or this floor is measuring the wrong thing. */
function measureLongestText(ctx: CanvasRenderingContext2D, texts: string[], font: string): number {
  ctx.font = font;
  return texts.reduce((max, text) => Math.max(max, ctx.measureText(text).width), 0);
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
    if (included("bowl")) l.decidedMatchup(matchups.bowl ?? PLACEHOLDER_MATCHUP, model.bowlDetail);
    if (included("honorable")) l.decidedMatchup(matchups.honorable ?? PLACEHOLDER_MATCHUP, model.honorableDetail);
    if (included("highScorer")) {
      l.highScorerPodium(
        GRAPHIC_SECTION_TITLE.highScorer,
        matchups.highScorer ?? {
          ...PLACEHOLDER_HIGH_SCORER,
          // The header's own trophy emoji already covers this — strip the
          // leading "📈 " format-recap.ts bakes into the saved sentence text.
          sentence: model.highScorer.replace(/^📈\s*/, ""),
          detail: model.highScorerDetail,
        }
      );
    }

    const winnerRows = matchups.winners ?? winnerRowsFromModel(model, matchups.avatarByName);
    if (included("winners")) l.winnersRow(GRAPHIC_SECTION_TITLE.winners, winnerRows, model.winnersDetail);

    if (included("lastWeek")) {
      const lastWeekRows = matchups.lastWeek ?? parseScoreboardRows(model.lastWeek);
      // Measured at the exact font lastWeekTable renders these names in —
      // the floor has to fit the names actually shown here, not the
      // Winners section's (possibly shorter, possibly differently-cased)
      // usernames.
      const barFloorPx = measureLongestText(
        ctx,
        lastWeekRows.map((r) => r.name),
        `400 18px ${FONT_STACK}`
      );
      l.lastWeekTable(GRAPHIC_SECTION_TITLE.lastWeek, lastWeekRows, barFloorPx, model.lastWeekDetail);
    }

    if (included("standings")) {
      l.standingsCashStacks(
        GRAPHIC_SECTION_TITLE.standings,
        matchups.standings ?? standingsRowsFromModel(model, matchups.avatarByName),
        model.standingsDetail
      );
    }

    if (included("upcomingBowl") || included("upcomingHonorable")) {
      l.upcomingTitle(upcomingWeekLabel(model.upcomingWeek));
    }
    if (included("upcomingBowl")) {
      l.previewMatchup(GRAPHIC_SECTION_TITLE.upcomingBowl, matchups.upcoming ?? PLACEHOLDER_PREVIEW, model.upcomingBowlDetail, WHO_WILL_PREVAIL);
    }
    if (included("upcomingHonorable")) {
      l.previewMatchup(
        GRAPHIC_SECTION_TITLE.upcomingHonorable,
        matchups.upcomingHonorable ?? PLACEHOLDER_PREVIEW,
        model.upcomingHonorableDetail,
        GOOD_LUCK_TO_ALL
      );
    }
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
