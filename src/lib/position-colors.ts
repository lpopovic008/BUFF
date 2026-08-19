// The colors designated for each fantasy position, reused everywhere a
// position needs to read at a glance: QB red, RB green, WR blue, TE yellow.

export const POSITION_TEXT_COLOR: Record<string, string> = {
  QB: "text-series-8",
  RB: "text-series-6",
  WR: "text-series-1",
  TE: "text-series-4",
};

export const POSITION_SOFT_BG: Record<string, string> = {
  QB: "bg-series-8/10 text-series-8",
  RB: "bg-series-6/10 text-series-6",
  WR: "bg-series-1/10 text-series-1",
  TE: "bg-series-4/10 text-series-4",
};
