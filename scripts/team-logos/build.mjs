// Redraws each team logo in pure black and white — see README.md for the
// rules. Usage: node scripts/team-logos/build.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "source");
const OUT = join(here, "../../public/team-logos");

// At or above this perceived lightness (CIE L*, 0–100) a color turns white.
const WHITE_FROM_L = 55;
// A color this light was already white (or near enough) — no outline needed.
const ALREADY_WHITE_L = 92;
// The outline on a color that has newly turned white: a fixed width in
// on-screen pixels however the logo is scaled, drawn under the fill so only
// its outer half shows.
const OUTLINE =
  "stroke:#000000;stroke-width:1.5px;paint-order:stroke;stroke-linejoin:round;vector-effect:non-scaling-stroke";

function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** CIE L* (perceived lightness, 0–100) of a hex color. */
export function lightness(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

// Colors that fall just dark of the line but are the light part of their
// own logo — where turning black would merge them into a neighbor of a
// darker color and lose the logo's shape: the Bengals' orange around its
// black stripes, the Giants' red outline around navy letters.
const FORCE_WHITE = {
  CIN: ["#D32F1E"],
  NYG: ["#A30D2D"],
};

let forced = new Set();

/** How a color is redrawn: its tone, and whether it newly turned white (and so gets outlined). */
function redraw(l, hex) {
  const white = l >= WHITE_FROM_L || (hex !== undefined && forced.has(hex.toUpperCase()));
  return { tone: white ? "#FFFFFF" : "#000000", outline: white && l < ALREADY_WHITE_L };
}

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

function convert(svg, team) {
  forced = new Set((FORCE_WHITE[team] ?? []).map((c) => c.toUpperCase()));
  // Gradients collapse to one tone: the average lightness of their stops
  // (following xlink:href to an inherited set of stops).
  const gradients = new Map();
  for (const m of svg.matchAll(/<(linear|radial)Gradient\b([^>]*)>([\s\S]*?)<\/\1Gradient>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[2])?.[1];
    const href = /xlink:href="#([^"]+)"/.exec(m[2])?.[1];
    const stops = [...m[3].matchAll(/stop-color:\s*(#[0-9a-fA-F]{3,6})|stop-color="(#[0-9a-fA-F]{3,6})"/g)].map((s) => s[1] ?? s[2]);
    if (id) gradients.set(id, { stops, href });
  }
  const gradientL = (id, depth = 0) => {
    const g = gradients.get(id);
    if (!g || depth > 4) return null;
    if (g.stops.length === 0) return g.href ? gradientL(g.href, depth + 1) : null;
    return g.stops.reduce((sum, c) => sum + lightness(c), 0) / g.stops.length;
  };

  let out = svg;
  // Gradient fills -> solid tones (in CSS rules, style attributes and fill attributes).
  out = out.replace(/fill:\s*url\(#([^)]+)\)/g, (_, id) => {
    const l = gradientL(id);
    if (l === null) return "fill:#000000";
    const { tone, outline } = redraw(l);
    return `fill:${tone}${outline ? ";" + OUTLINE : ""}`;
  });
  out = out.replace(/fill="url\(#([^)]+)\)"/g, (_, id) => {
    const l = gradientL(id);
    const { tone, outline } = l === null ? { tone: "#000000", outline: false } : redraw(l);
    return `fill="${tone}"${outline ? ` style="${OUTLINE}"` : ""}`;
  });
  // Solid fills in CSS (style blocks and style attributes): recolor, outlining newly-white ones.
  out = out.replace(/fill:\s*(#[0-9a-fA-F]{3,6})\b/g, (_, hex) => {
    const { tone, outline } = redraw(lightness(hex), hex);
    return `fill:${tone}${outline ? ";" + OUTLINE : ""}`;
  });
  // Solid fill attributes.
  out = out.replace(/fill="(#[0-9a-fA-F]{3,6})"/g, (_, hex) => {
    const { tone, outline } = redraw(lightness(hex), hex);
    return `fill="${tone}"${outline ? ` stroke="#000000" stroke-width="1.5" paint-order="stroke" stroke-linejoin="round" vector-effect="non-scaling-stroke"` : ""}`;
  });
  // Anything else colored (strokes, gradient stops) just takes its tone.
  out = out.replace(HEX, (hex) => (hex.toUpperCase() === "#000000" || hex.toUpperCase() === "#FFFFFF" ? hex : redraw(lightness(hex), hex).tone));
  // Illustrator's export comment and XML prolog aren't needed on the page.
  out = out.replace(/<\?xml[^>]*\?>\s*/, "").replace(/<!--[\s\S]*?-->\s*/g, "");
  return out;
}

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SOURCE).filter((f) => f.endsWith(".svg"));
for (const file of files) {
  writeFileSync(join(OUT, file), convert(readFileSync(join(SOURCE, file), "utf8"), file.replace(".svg", "")));
}
console.log(`Redrew ${files.length} logos into public/team-logos/`);
