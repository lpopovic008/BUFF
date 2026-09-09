// Draws the current week's recap — the write-up and every stat in it — as a
// single shareable graphic, so it can be copied to the clipboard as an image
// (see RecapEditor's "Copy graphic" button) instead of only as text. Pure
// canvas 2D drawing, no DOM/layout dependency beyond the canvas itself, so
// it renders the same regardless of the viewer's own theme — this is a
// fixed-look card, not a reactive page.

import { RecapModel } from "./recap-model";

const WIDTH = 1080;
const PADDING = 64;
const CONTENT_WIDTH = WIDTH - PADDING * 2;

const COLOR = {
  bg: "#0d0d0d",
  hairline: "rgba(255, 255, 255, 0.12)",
  primary: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781",
  accent: "#eb6834",
  good: "#0ca30c",
};

const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

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

/** One block of drawing work, always measured and only actually painted when `paint` is true — keeps the two passes (measure the total height, then draw at that height) from ever disagreeing. */
class Layout {
  y = PADDING;
  constructor(
    private ctx: CanvasRenderingContext2D,
    private paint: boolean
  ) {}

  space(px: number) {
    this.y += px;
  }

  rule() {
    if (this.paint) {
      this.ctx.strokeStyle = COLOR.hairline;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(PADDING, this.y);
      this.ctx.lineTo(WIDTH - PADDING, this.y);
      this.ctx.stroke();
    }
    this.space(32);
  }

  text(value: string, opts: { size: number; color: string; weight?: string; style?: string; lineHeight?: number }) {
    if (!value) return;
    const { size, color, weight = "400", style = "normal" } = opts;
    const lineHeight = opts.lineHeight ?? size * 1.35;
    this.ctx.font = `${style} ${weight} ${size}px ${FONT_STACK}`;
    const lines = wrapText(this.ctx, value, CONTENT_WIDTH);
    if (this.paint) {
      this.ctx.fillStyle = color;
      this.ctx.textBaseline = "alphabetic";
      for (const line of lines) {
        this.ctx.fillText(line, PADDING, this.y + size);
        this.y += lineHeight;
      }
    } else {
      this.y += lineHeight * lines.length;
    }
  }

  sectionHeader(label: string) {
    this.text(label, { size: 22, weight: "700", color: COLOR.accent });
    this.space(6);
  }
}

function drawSection(l: Layout, header: string, result: string, detail: string) {
  if (!result.trim()) return;
  l.sectionHeader(header);
  l.text(result, { size: 30, weight: "700", color: COLOR.primary, lineHeight: 38 });
  l.space(4);
  l.text(detail, { size: 20, style: "italic", color: COLOR.secondary, lineHeight: 27 });
  l.space(32);
}

function drawList(l: Layout, header: string, body: string) {
  const rows = body.split("\n").filter((line) => line.trim() !== "");
  if (rows.length === 0) return;
  l.sectionHeader(header);
  for (const row of rows) {
    l.text(row, { size: 20, color: COLOR.secondary, lineHeight: 28 });
  }
  l.space(32);
}

function runLayout(ctx: CanvasRenderingContext2D, title: string, model: RecapModel | null, plainBody: string, paint: boolean): number {
  const l = new Layout(ctx, paint);

  l.text(title, { size: 40, weight: "700", color: COLOR.primary, lineHeight: 50 });
  l.space(28);
  l.rule();

  if (model) {
    drawSection(l, "👑 BOWL OF THE WEEK", model.bowlResult, model.bowlDetail);
    drawSection(l, "🏆 HONORABLE MENTION", model.honorableResult, model.honorableDetail);
    drawSection(l, "📈 HIGH SCORER", model.highScorer, model.highScorerDetail);
    drawList(l, "🤑 WINNERS THIS WEEK", model.winners);
    drawList(l, "🗓️ LAST WEEK RESULTS", model.lastWeek);
    drawList(l, "💰 UPDATED STANDINGS", model.standings);
  } else {
    l.text(plainBody, { size: 20, color: COLOR.secondary, lineHeight: 28 });
    l.space(32);
  }

  l.rule();
  l.text("BUFF", { size: 16, weight: "700", color: COLOR.muted });

  return l.y + PADDING;
}

/**
 * Renders the recap onto `canvas` (sized to fit the content, so the caller
 * should create it fresh and not assume a fixed height). `model` renders
 * every structured stat section; a league without the structured house
 * style falls back to `plainBody` as a single block of text.
 */
export function drawRecapGraphic(canvas: HTMLCanvasElement, title: string, model: RecapModel | null, plainBody: string): void {
  const measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) throw new Error("Couldn't measure the graphic — canvas isn't supported here.");
  const height = runLayout(measureCtx, title, model, plainBody, false);

  const scale = 2; // draw at 2x for a crisp image on high-density screens
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the graphic — canvas isn't supported here.");
  ctx.scale(scale, scale);

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  runLayout(ctx, title, model, plainBody, true);
}
