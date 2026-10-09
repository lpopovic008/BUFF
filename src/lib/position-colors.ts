// The colors designated for each fantasy position/roster slot, reused
// everywhere one needs to read at a glance: QB red, RB green, WR blue,
// TE yellow.

export const POSITION_TEXT_COLOR: Record<string, string> = {
  QB: "text-series-8",
  RB: "text-series-6",
  WR: "text-series-1",
  TE: "text-series-4",
};

/** The same colors as CSS values, for drawing (SVG fills and strokes). */
export const POSITION_COLOR_VAR: Record<string, string> = {
  QB: "var(--series-8)",
  RB: "var(--series-6)",
  WR: "var(--series-1)",
  TE: "var(--series-4)",
};
