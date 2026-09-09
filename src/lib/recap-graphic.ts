// Draws the recap as a single shareable poster, iOS-card style — soft
// shadows and big rounded corners instead of hard borders. The header is
// always the write-up's own first line (never an invented one), and every
// list section is headed by the write-up's own literal header line
// (RECAP_HEADERS). The Bowl of the Week and Honorable Mention results get a
// poster treatment of their own: the bowl/cup name in a "college sports"
// display font, the winning team's logo and name bright, the losing team's
// dimmed — same font treatment (no winner/loser styling, since it hasn't
// been played yet) for the upcoming marquee matchup. Renders to the
// clipboard as an image (see RecapEditor's "Copy graphic" button). Pure
// canvas 2D drawing, no DOM/layout dependency beyond the canvas itself, and
// not theme-reactive — this is a fixed-look card, not a live page.

import { RecapModel, RECAP_HEADERS } from "./recap-model";

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

export interface RecapGraphicMatchups {
  bowl?: DecidedMatchup | null;
  honorable?: DecidedMatchup | null;
  upcoming?: PreviewMatchup | null;
  /** CSS font-family for the "college sports" display font (see fonts.ts) — falls back to the body font stack if omitted or it fails to load in time. */
  displayFontFamily?: string;
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

function initialsFor(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
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

interface GraphicContext {
  images: Map<string, HTMLImageElement>;
  displayFamily: string;
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

  /** A card whose only "header" is the section's own first line — no separate invented label above it. Used as the fallback for a bowl/honorable result the poster card can't render (no resolvable matchup yet). */
  statCard(resultLine: string, detailLine: string) {
    if (!resultLine.trim()) return;
    this.card((paint, inner) => {
      let h = drawText(this.ctx, paint, inner.x, inner.y, inner.width, resultLine, {
        size: 25,
        weight: "700",
        color: COLOR.primary,
        lineHeight: 32,
      });
      if (detailLine.trim()) {
        h += 8;
        h += drawText(this.ctx, paint, inner.x, inner.y + h, inner.width, detailLine, {
          size: 18,
          style: "italic",
          color: COLOR.secondary,
          lineHeight: 25,
        });
      }
      return h;
    });
  }

  /** A card headed by one of the write-up's own literal header lines (RECAP_HEADERS) — never a shortened stand-in for it. */
  listCard(header: string, body: string) {
    const rows = body.split("\n").filter((line) => line.trim() !== "");
    if (rows.length === 0) return;
    this.card((paint, inner) => {
      let h = drawText(this.ctx, paint, inner.x, inner.y, inner.width, header, {
        size: 15,
        weight: "700",
        color: COLOR.accent,
        lineHeight: 20,
      });
      h += 10;
      for (const row of rows) {
        h += drawText(this.ctx, paint, inner.x, inner.y + h, inner.width, row, {
          size: 19,
          color: COLOR.secondary,
          lineHeight: 26,
        });
      }
      return h;
    });
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

  /** A circular logo (or an initials fallback, when there's no avatar or it failed to load) with the team's name beneath it — always the same height for a given avatar radius, so measure and paint passes can never disagree. */
  private teamColumn(paint: boolean, cx: number, y: number, colWidth: number, avatarR: number, team: MatchupTeam, opts: TeamColumnOpts): number {
    if (paint) {
      const ctx = this.ctx;
      const img = team.avatarUrl ? (this.gctx.images.get(team.avatarUrl) ?? null) : null;
      ctx.save();
      ctx.globalAlpha = opts.alpha;
      if (opts.ring) {
        ctx.beginPath();
        ctx.arc(cx, y + avatarR, avatarR + 5, 0, Math.PI * 2);
        ctx.fillStyle = COLOR.accent;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, y + avatarR, avatarR, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (img) {
        ctx.drawImage(img, cx - avatarR, y, avatarR * 2, avatarR * 2);
      } else {
        ctx.fillStyle = "#2c261c";
        ctx.fillRect(cx - avatarR, y, avatarR * 2, avatarR * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.font = `800 ${Math.round(avatarR)}px ${FONT_STACK}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initialsFor(team.name), cx, y + avatarR + 2);
      }
      ctx.restore();
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

function runLayout(
  ctx: CanvasRenderingContext2D,
  header: string,
  model: RecapModel | null,
  restBody: string,
  matchups: RecapGraphicMatchups,
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

  if (model) {
    if (matchups.bowl) l.decidedMatchup(matchups.bowl);
    else l.statCard(model.bowlResult, model.bowlDetail);

    if (matchups.honorable) l.decidedMatchup(matchups.honorable);
    else l.statCard(model.honorableResult, model.honorableDetail);

    l.statCard(model.highScorer, model.highScorerDetail);
    l.listCard(RECAP_HEADERS.winners, model.winners);
    l.listCard(RECAP_HEADERS.lastWeek, model.lastWeek);
    l.listCard(RECAP_HEADERS.standings, model.standings);

    if (matchups.upcoming) l.previewMatchup(RECAP_HEADERS.upcomingBowl, matchups.upcoming);
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
 * every list section header is one of the write-up's own literal header
 * lines (RECAP_HEADERS). `model` renders every structured section; a league
 * without the structured house style falls back to the rest of `body` as a
 * single block of text. `matchups` supplies the poster-card data (team
 * names, logos, and — for a decided game — which team won); a matchup left
 * out or null falls back to the plain result card. Async because it has to
 * wait for the display font and any team logos to finish loading before it
 * can lay anything out.
 */
export async function drawRecapGraphic(
  canvas: HTMLCanvasElement,
  body: string,
  model: RecapModel | null,
  matchups: RecapGraphicMatchups = {}
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
  ];
  const [images, displayFamily] = await Promise.all([preloadImages(avatarUrls), ensureDisplayFont(matchups.displayFontFamily)]);
  const gctx: GraphicContext = { images, displayFamily };

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
