// Structured form of the commish weekly recap — the same house-style write-up
// `format-recap.ts` has always produced, just held as named fields instead of
// one flat block of text. This is what lets the editor give every header its
// own box on screen: each field here maps to exactly one editable box, and
// `joinRecapModel` is the single place that knows how to flatten them back
// into the literal text that gets saved, copied, and posted — so what the
// editor shows is always exactly what gets copied, headers included. Every
// section can also be individually excluded (`RecapModel.include`) — dropped
// from both the flattened text and the exported graphic — rather than the
// code deciding what's relevant for a given week; the same structure covers
// the preseason write-up and every regular week identically.

// The header/anchor lines that appear verbatim in the flattened text — shared
// between the joiner and the parser (and the editor's on-screen labels) so
// they can never drift out of sync with each other.
export const RECAP_HEADERS = {
  aiRecap: "✨ AI Recap:",
  winners: "🤑 Winners this week who will receive commission:",
  lastWeek: "🗓️Last week Results:",
  standings: "💰 Updated Standings:",
  records: "📋 Season Standings:",
  upcomingBowl: "🥇 Matchup of the Week:",
  upcomingHonorable: "🥈Honorable Mention:",
} as const;

export const WHO_WILL_PREVAIL = "WHO WILL PREVAIL?!";
export const GOOD_LUCK_TO_ALL = "Good Luck to All!";

export function upcomingWeekLabel(week: number): string {
  return `UPCOMING WEEK ${week}:`;
}

/**
 * The sections added on top of the house style's own — each one a single
 * editable block of text under its own header, written from the week's data
 * (see format-recap.ts's buildExtraSections) or, for Commish Notes, left for
 * the commish to fill. They only appear once added to the layout (see
 * `RecapModel.layout`).
 */
export const EXTRA_SECTIONS = {
  playerOfWeek: { emoji: "⭐", label: "Player of the Week" },
  lowScorer: { emoji: "📉", label: "Low Scorer" },
  closestGame: { emoji: "😬", label: "Nail-Biter" },
  blowout: { emoji: "💥", label: "Blowout of the Week" },
  luck: { emoji: "🍀", label: "Lucky & Unlucky" },
  movers: { emoji: "🧗", label: "Standings Movers" },
  transactions: { emoji: "🔄", label: "Waivers & Trades" },
  commishNotes: { emoji: "📝", label: "Commish Notes" },
} as const;

export type ExtraSectionKey = keyof typeof EXTRA_SECTIONS;

export function isExtraSection(key: string): key is ExtraSectionKey {
  return key in EXTRA_SECTIONS;
}

/** Every section the write-up/graphic can show, the house style's own in the order they appear by default — the single source of truth the include/exclude checkboxes (and the graphic's own section toggles) are built from, so the two can never drift apart. */
export const RECAP_SECTIONS = [
  { key: "aiRecap", label: "✨ AI Recap" },
  { key: "bowl", label: "👑 Bowl of the Week" },
  { key: "honorable", label: "🏆 Honorable Mention" },
  { key: "highScorer", label: "📈 High Scorer" },
  { key: "winners", label: "🤑 Winners Podium" },
  { key: "lastWeek", label: "🗓️ Last Week Results" },
  { key: "standings", label: "💰 Updated Standings" },
  { key: "records", label: "📋 Season Standings" },
  { key: "upcomingBowl", label: "🥇 Matchup of the Week" },
  { key: "upcomingHonorable", label: "🥈 Honorable Mention Preview" },
  { key: "playerOfWeek", label: "⭐ Player of the Week" },
  { key: "lowScorer", label: "📉 Low Scorer" },
  { key: "closestGame", label: "😬 Nail-Biter" },
  { key: "blowout", label: "💥 Blowout of the Week" },
  { key: "luck", label: "🍀 Lucky & Unlucky" },
  { key: "movers", label: "🧗 Standings Movers" },
  { key: "transactions", label: "🔄 Waivers & Trades" },
  { key: "commishNotes", label: "📝 Commish Notes" },
] as const;

export type RecapSectionKey = (typeof RECAP_SECTIONS)[number]["key"];

/** The two previews of next week's matchups — always kept together at the end, under the "UPCOMING WEEK N:" heading. */
const UPCOMING_SECTIONS: RecapSectionKey[] = ["upcomingBowl", "upcomingHonorable"];

export function isUpcomingSection(key: RecapSectionKey): boolean {
  return UPCOMING_SECTIONS.includes(key);
}

/** The house style's own sections, in their own order — the layout of every recap until the commish changes it. */
export const DEFAULT_LAYOUT: RecapSectionKey[] = [
  "aiRecap",
  "bowl",
  "honorable",
  "highScorer",
  "winners",
  "lastWeek",
  "standings",
  "records",
  "upcomingBowl",
  "upcomingHonorable",
];

/** A layout made sound: only known sections, each once, the upcoming previews kept together at the end. */
export function normalizeLayout(layout: readonly string[]): RecapSectionKey[] {
  const known = new Set<string>(RECAP_SECTIONS.map((s) => s.key));
  const seen = new Set<string>();
  const keys: RecapSectionKey[] = [];
  for (const k of layout) {
    if (!known.has(k) || seen.has(k)) continue;
    seen.add(k);
    keys.push(k as RecapSectionKey);
  }
  return [...keys.filter((k) => !isUpcomingSection(k)), ...keys.filter((k) => isUpcomingSection(k))];
}

/** The sections a recap has, in order — its own layout, or the house style's. */
export function recapLayout(model: Pick<RecapModel, "layout">): RecapSectionKey[] {
  return normalizeLayout(model.layout ?? DEFAULT_LAYOUT);
}

export interface RecapModel {
  title: string;
  /** One short LLM-ghostwritten paragraph — the lede above the detailed stat sections below it. Never auto-generated on load; only ever set by the "Generate with AI" button. */
  aiRecap: string;
  aiRecapDetail: string;
  bowlResult: string;
  bowlDetail: string;
  honorableResult: string;
  honorableDetail: string;
  highScorer: string;
  highScorerDetail: string;
  /** One line per team receiving commission this week. */
  winners: string;
  winnersDetail: string;
  /** Two lines per team — name, then "points ✅/❌". */
  lastWeek: string;
  lastWeekDetail: string;
  /** One line per team's running total. */
  standings: string;
  standingsDetail: string;
  /** One line per team's season win-loss record, ranked best to worst. */
  records: string;
  recordsDetail: string;
  upcomingWeek: number;
  upcomingBowlLines: string;
  upcomingBowlDetail: string;
  upcomingHonorableLines: string;
  upcomingHonorableDetail: string;
  /** A key mapped to `false` leaves that section out of both the flattened text and the graphic; anything missing (including every section on an older saved recap) defaults to included. */
  include: Partial<Record<RecapSectionKey, boolean>>;
  /** The added sections' text (see EXTRA_SECTIONS), by section. */
  extra: Partial<Record<ExtraSectionKey, string>>;
  /** Which sections this recap has, in order (see recapLayout) — the house style's own when absent, as on every recap saved before sections could be added, removed and moved. New weeks start from the league's last layout (see localStore's getRecapLayout). */
  layout?: RecapSectionKey[];
  /** Whether a section's Detail box renders on screen — see isDetailShown. Purely a UI affordance (the "+"/"–" button in SectionBox's corner); never affects the flattened text, which includes a Detail line whenever it has content regardless of whether the box happens to be open. */
  detailShown: Partial<Record<RecapSectionKey, boolean>>;
}

/** Whether a section should be shown — the one place both the text flattener and the UI check, so "excluded" always means the same thing everywhere. */
export function isSectionIncluded(model: Pick<RecapModel, "include">, key: RecapSectionKey): boolean {
  return model.include?.[key] !== false;
}

/** Which model field holds a given section's optional free-write commentary — the single place that maps a section to its Detail field, so the "+" toggle and the flattener can't drift apart on which field goes with which section. The added sections (EXTRA_SECTIONS) are one block of text already, so they have none. */
export const DETAIL_FIELD: Partial<Record<RecapSectionKey, keyof RecapModel>> = {
  aiRecap: "aiRecapDetail",
  bowl: "bowlDetail",
  honorable: "honorableDetail",
  highScorer: "highScorerDetail",
  winners: "winnersDetail",
  lastWeek: "lastWeekDetail",
  standings: "standingsDetail",
  records: "recordsDetail",
  upcomingBowl: "upcomingBowlDetail",
  upcomingHonorable: "upcomingHonorableDetail",
};

/**
 * Whether a section's Detail box should render on screen right now —
 * explicit once the commish has ever clicked its "+"/"–" toggle, otherwise
 * inferred from whether it already has text, so a recap with commentary
 * typed before this toggle existed doesn't suddenly hide it.
 */
export function isDetailShown(model: RecapModel, key: RecapSectionKey): boolean {
  const field = DETAIL_FIELD[key];
  if (!field) return false;
  const explicit = model.detailShown?.[key];
  if (explicit !== undefined) return explicit;
  return ((model[field] as string) ?? "").trim() !== "";
}

/** Every field defaults to this until real data or a hand-typed edit replaces it. */
export const EMPTY_RECAP_MODEL: RecapModel = {
  title: "",
  aiRecap: "",
  aiRecapDetail: "",
  bowlResult: "",
  bowlDetail: "",
  honorableResult: "",
  honorableDetail: "",
  highScorer: "",
  highScorerDetail: "",
  winners: "",
  winnersDetail: "",
  lastWeek: "",
  lastWeekDetail: "",
  standings: "",
  standingsDetail: "",
  records: "",
  recordsDetail: "",
  upcomingWeek: 1,
  upcomingBowlLines: "",
  upcomingBowlDetail: "",
  upcomingHonorableLines: "",
  upcomingHonorableDetail: "",
  extra: {},
  include: {},
  detailShown: {},
};

/** An added section's header line in the flattened text: "⭐ Player of the Week:". */
export function extraSectionHeader(key: ExtraSectionKey): string {
  return `${EXTRA_SECTIONS[key].emoji} ${EXTRA_SECTIONS[key].label}:`;
}

/** Flattens a model into the exact literal text that gets saved, copied, and posted — an excluded section (see `include`) is left out entirely, header and all. The one place that knows this layout — the parser below mirrors it exactly for a fully-included recap, the only shape older saved text can be in. */
export function joinRecapModel(model: RecapModel): string {
  const included = (key: RecapSectionKey) => isSectionIncluded(model, key);
  const lines: string[] = [];
  lines.push(model.title, "");
  let upcomingTitled = false;
  let last: RecapSectionKey | null = null;
  // Section by section in the recap's own order; the upcoming previews (always last) under their week's heading.
  for (const key of recapLayout(model)) {
    if (isUpcomingSection(key) && !upcomingTitled) {
      lines.push(upcomingWeekLabel(model.upcomingWeek), "");
      upcomingTitled = true;
    }
    if (!included(key)) continue;
    if (isExtraSection(key)) {
      const text = (model.extra?.[key] ?? "").trim();
      if (!text) continue;
      lines.push(extraSectionHeader(key), ...text.split("\n"), "");
      last = key;
      continue;
    }
    switch (key) {
      case "aiRecap":
        if (!model.aiRecap.trim()) continue;
        lines.push(RECAP_HEADERS.aiRecap, model.aiRecap);
        if (model.aiRecapDetail) lines.push("", model.aiRecapDetail);
        lines.push("");
        break;
      case "bowl":
        lines.push(model.bowlResult, model.bowlDetail, "");
        break;
      case "honorable":
        lines.push(model.honorableResult, model.honorableDetail, "");
        break;
      case "highScorer":
        lines.push(model.highScorer, model.highScorerDetail, "");
        break;
      case "winners":
      case "lastWeek":
      case "standings":
      case "records": {
        const [list, detail] = {
          winners: [model.winners, model.winnersDetail],
          lastWeek: [model.lastWeek, model.lastWeekDetail],
          standings: [model.standings, model.standingsDetail],
          records: [model.records, model.recordsDetail],
        }[key];
        lines.push(RECAP_HEADERS[key], ...list.split("\n"));
        if (detail) lines.push("", detail);
        lines.push("");
        break;
      }
      case "upcomingBowl":
        lines.push(RECAP_HEADERS.upcomingBowl, ...model.upcomingBowlLines.split("\n"), "", model.upcomingBowlDetail, WHO_WILL_PREVAIL, "");
        break;
      case "upcomingHonorable":
        lines.push(RECAP_HEADERS.upcomingHonorable, ...model.upcomingHonorableLines.split("\n"), "", model.upcomingHonorableDetail, GOOD_LUCK_TO_ALL, "");
        break;
    }
    last = key;
  }
  // The sign-off closes the write-up: nothing after it.
  if (last === "upcomingHonorable") lines.pop();
  return lines.join("\n");
}

/** Collects lines from `start` up to (not including) the next blank line. `next` points past that blank line (or at lines.length if there wasn't one). */
function readBlockUntilBlank(lines: string[], start: number): { block: string[]; next: number } {
  let i = start;
  const block: string[] = [];
  while (i < lines.length && lines[i].trim() !== "") {
    block.push(lines[i]);
    i++;
  }
  return { block, next: Math.min(i + 1, lines.length) };
}

/**
 * Finds `marker` starting from `start` and walks backward from it collecting
 * contiguous non-blank lines as the trailing "detail" block, then requires
 * exactly one blank line (the separator `joinRecapModel` always inserts)
 * immediately before that. Everything between `start` and the separator is
 * returned untouched as `lines` — deliberately not blank-scanned itself,
 * since a block like the upcoming-matchup preview can contain its own
 * internal blank line (see formatUpcomingBowlBlock) that would otherwise be
 * mistaken for this boundary. Returns null if `marker` isn't found, or if the
 * line right before the detail isn't the expected blank separator (e.g. the
 * detail itself contains a blank line — the one shape this can't recover).
 */
function splitOnTrailingMarker(
  lines: string[],
  start: number,
  marker: string
): { lines: string[]; detail: string[]; next: number } | null {
  const markerIndex = lines.indexOf(marker, start);
  if (markerIndex === -1) return null;

  let detailStart = markerIndex - 1;
  const detail: string[] = [];
  while (detailStart >= start && lines[detailStart].trim() !== "") {
    detail.unshift(lines[detailStart]);
    detailStart--;
  }
  if (detailStart < start || lines[detailStart] !== "") return null;

  return { lines: lines.slice(start, detailStart), detail, next: markerIndex + 1 };
}

/**
 * The inverse of `joinRecapModel` — recovers a structured model from
 * previously-saved flat text, so a recap saved before the header boxes stay
 * fully editable rather than collapsing to one flat field. Returns null the
 * moment any expected anchor line is missing or out of order (a body that's
 * been hand-edited past what this shape can represent) — callers should fall
 * back to a plain text box for that recap rather than guessing.
 */
export function parseRecapModel(body: string): RecapModel | null {
  const lines = body.split("\n");
  let i = 0;

  if (!lines[i] || !lines[i].startsWith("🚨📋")) return null;
  const title = lines[i];
  i++;
  if (lines[i] !== "") return null;
  i++;

  // Optional: absent on every recap saved before this section existed, and
  // on any recap where the commish never clicked "Generate with AI" — unlike
  // every other header below, its absence is not a parse failure.
  let aiRecap = "";
  if (lines[i] === RECAP_HEADERS.aiRecap) {
    i++;
    const aiRecapBlock = readBlockUntilBlank(lines, i);
    aiRecap = aiRecapBlock.block.join("\n");
    i = aiRecapBlock.next;
  }

  const bowl = readBlockUntilBlank(lines, i);
  if (bowl.block.length === 0) return null;
  i = bowl.next;

  const honorable = readBlockUntilBlank(lines, i);
  if (honorable.block.length === 0) return null;
  i = honorable.next;

  const highScorer = readBlockUntilBlank(lines, i);
  if (highScorer.block.length === 0) return null;
  i = highScorer.next;

  if (lines[i] !== RECAP_HEADERS.winners) return null;
  i++;
  const winners = readBlockUntilBlank(lines, i);
  i = winners.next;

  if (lines[i] !== RECAP_HEADERS.lastWeek) return null;
  i++;
  const lastWeek = readBlockUntilBlank(lines, i);
  i = lastWeek.next;

  if (lines[i] !== RECAP_HEADERS.standings) return null;
  i++;
  const standings = readBlockUntilBlank(lines, i);
  i = standings.next;

  if (lines[i] !== RECAP_HEADERS.records) return null;
  i++;
  const records = readBlockUntilBlank(lines, i);
  i = records.next;

  const upcomingMatch = lines[i]?.match(/^UPCOMING WEEK (\d+):$/);
  if (!upcomingMatch) return null;
  const upcomingWeek = Number(upcomingMatch[1]);
  i++;
  if (lines[i] !== "") return null;
  i++;

  if (lines[i] !== RECAP_HEADERS.upcomingBowl) return null;
  i++;
  const upcomingBowl = splitOnTrailingMarker(lines, i, WHO_WILL_PREVAIL);
  if (!upcomingBowl) return null;
  i = upcomingBowl.next;
  if (lines[i] === "") i++;

  if (lines[i] !== RECAP_HEADERS.upcomingHonorable) return null;
  i++;
  const upcomingHonorable = splitOnTrailingMarker(lines, i, GOOD_LUCK_TO_ALL);
  if (!upcomingHonorable) return null;

  return {
    title,
    aiRecap,
    aiRecapDetail: "",
    bowlResult: bowl.block[0],
    bowlDetail: bowl.block.slice(1).join("\n"),
    honorableResult: honorable.block[0],
    honorableDetail: honorable.block.slice(1).join("\n"),
    highScorer: highScorer.block[0],
    highScorerDetail: highScorer.block.slice(1).join("\n"),
    winners: winners.block.join("\n"),
    // winners/lastWeek/standings never had a Detail line before this toggle
    // existed, and readBlockUntilBlank has no way to tell new detail text
    // apart from the list content it follows (unlike bowl/honorable/
    // highScorer, there's no fixed single "result" line to split on) — text
    // saved with one of these populated fails this parse entirely and falls
    // back to a plain text box, which is fine: saved.model is always
    // preferred over recovering from flat text once a recap has ever been
    // saved with the structured model (see resolveHouseStyleState).
    winnersDetail: "",
    lastWeek: lastWeek.block.join("\n"),
    lastWeekDetail: "",
    standings: standings.block.join("\n"),
    standingsDetail: "",
    records: records.block.join("\n"),
    recordsDetail: "",
    upcomingWeek,
    upcomingBowlLines: upcomingBowl.lines.join("\n"),
    upcomingBowlDetail: upcomingBowl.detail.join("\n"),
    upcomingHonorableLines: upcomingHonorable.lines.join("\n"),
    upcomingHonorableDetail: upcomingHonorable.detail.join("\n"),
    // Old flat text never had exclusion or a detail-visibility toggle — a
    // recap recovered from it always starts with everything included and
    // every Detail box collapsed (or open, if it already has text — see
    // isDetailShown), same as `joinRecapModel` would need to reproduce this
    // exact text — and the house style's own sections, nothing added.
    extra: {},
    include: {},
    detailShown: {},
  };
}
