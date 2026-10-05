// The colors designated for each fantasy position/roster slot, reused
// everywhere one needs to read at a glance: QB red, RB green, WR blue,
// TE yellow. The flex slots are made of the positions they take: FLEX blends
// RB, WR and TE; SUPER_FLEX blends QB with those.

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
  FLEX: "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--series-6)_30%,transparent),color-mix(in_srgb,var(--series-1)_30%,transparent),color-mix(in_srgb,var(--series-4)_30%,transparent))] text-ink-primary",
  SUPER_FLEX:
    "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--series-8)_30%,transparent),color-mix(in_srgb,var(--series-6)_30%,transparent),color-mix(in_srgb,var(--series-1)_30%,transparent),color-mix(in_srgb,var(--series-4)_30%,transparent))] text-ink-primary",
};
