"use client";

import { useState } from "react";
import {
  RecapModel,
  RECAP_HEADERS,
  RECAP_SECTIONS,
  RecapSectionKey,
  isSectionIncluded,
  isDetailShown,
  WHO_WILL_PREVAIL,
  GOOD_LUCK_TO_ALL,
  upcomingWeekLabel,
} from "@/lib/recap-model";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { formatPoints } from "@/lib/format";
import { LeagueTeamOption } from "@/hooks/useLeagueTeams";
import { WeekRecapData } from "@/lib/league-data";
import { PayoutLedger, summarizeWeek, standingsThroughWeek } from "@/lib/payouts";
import { findWeekTopStarters } from "@/lib/format-recap";

type FieldKey = keyof RecapModel;

/** One labeled, independently-editable box — this is the "own box to write in" the header-by-header layout is built from. */
function Field({
  label,
  value,
  onChange,
  multiline = true,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const sharedClass =
    "w-full border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none transition-colors focus:border-series-1";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={sharedClass}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={sharedClass}
        />
      )}
    </label>
  );
}

/** A dynamically-substituted value inside an otherwise-fixed line of house-style prose — colored apart from the surrounding fixed wording so it reads at a glance as "this part is live data," not something hand-typed. */
function Variable({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-series-1">{children}</span>;
}

/** The small caption every computed (non-editable) section shows, matching DecidedMatchupBody's own — one place so the wording can't drift between them. */
function LiveCaption({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{children}</span>;
}

/** Read-only closing line — fixed text every write-up ends its preview sections with, shown so the section reads complete without being an editable box. */
function StaticFooter({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-ink-primary">{children}</p>;
}

/** A section's own name (the bowl/cup a matchup is named after) — double-click to rename. Renaming writes back to the shared pick this box's data came from (see recap/page.tsx), so every other box built from that same pick — this week's result, or a future week's preview of it — picks up the new name too, never just this one box. */
function EditableHeader({ value, placeholder, onRename }: { value: string; placeholder: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEditing() {
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onRename(trimmed);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        className="w-full border-b-2 border-series-1 bg-transparent text-base font-bold text-ink-primary outline-none"
      />
    );
  }

  return (
    <h3
      onDoubleClick={startEditing}
      title="Double-click to rename — renames this matchup everywhere it appears"
      className="w-fit cursor-text text-base font-bold text-ink-primary decoration-dotted decoration-1 underline-offset-4 hover:underline"
    >
      {value.trim() || <span className="italic text-ink-muted">{placeholder}</span>}
    </h3>
  );
}

/** A fixed (non-renameable) header — for the sections that don't correspond to any other box, so there's nothing for a rename to stay in sync with. */
function FixedHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-ink-primary">{children}</h3>;
}

/** One statistic pulled out of the matchup data — a label, the team's name, and (once there's a score to show) their points. */
function StatColumn({ label, name, points, muted = false }: { label: string; name: string | null; points: string | null; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`font-semibold ${muted ? "text-ink-secondary" : "text-ink-primary"}`}>{name ?? "—"}</div>
      {points ? <div className="text-xs text-ink-secondary">{points}</div> : null}
    </div>
  );
}

/** Winner/loser for a decided matchup — computed from whatever the live score currently says (even mid-game, the team ahead right now), never hand-typed, so it's shown as read-only with a small label saying so rather than as another text box. */
function DecidedMatchupBody({
  matchup,
  teams,
}: {
  matchup: BowlMatchupResult | null;
  teams: Record<number, { name: string; avatar: string | null }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <LiveCaption>Calculated from live scores — not editable</LiveCaption>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <StatColumn
          label="Winner"
          name={matchup ? (teams[matchup.winnerRosterId]?.name ?? "?") : null}
          points={matchup ? formatPoints(matchup.winnerPoints) : null}
        />
        <StatColumn
          label="Loser"
          name={matchup ? (teams[matchup.loserRosterId]?.name ?? "?") : null}
          points={matchup ? formatPoints(matchup.loserPoints) : null}
          muted
        />
      </div>
    </div>
  );
}

/** Picks which team fills one slot of an upcoming matchup — the same picker BowlPicksEditor used to own, now living right on the section it fills in. */
function TeamSelect({
  value,
  onChange,
  options,
}: {
  value: number | "";
  onChange: (rosterId: number | "") => void;
  options: LeagueTeamOption[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
      className="w-full border border-border bg-page px-2 py-1.5 text-sm text-ink-primary outline-none focus:border-series-1"
    >
      <option value="">— Select a team —</option>
      {options.map((t) => (
        <option key={t.rosterId} value={t.rosterId}>
          {t.teamName}
        </option>
      ))}
    </select>
  );
}

/** The two teams playing an upcoming matchup — not decided yet, so no winner/loser, just who's in it. Picking a team here writes straight back to the shared bowl pick (see recap/page.tsx), same as renaming the header above it. */
function PreviewMatchupBody({
  preview,
  teamOptions,
  onChangeTeam,
}: {
  preview: BowlMatchupPreview | null;
  teamOptions: LeagueTeamOption[] | null;
  onChangeTeam: (slot: 0 | 1, rosterId: number | "") => void;
}) {
  if (!teamOptions) {
    return <p className="text-xs text-ink-muted">Loading teams…</p>;
  }
  const rosterIds = preview?.rosterIds ?? [];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <TeamSelect value={rosterIds[0] ?? ""} options={teamOptions} onChange={(id) => onChangeTeam(0, id)} />
      <TeamSelect value={rosterIds[1] ?? ""} options={teamOptions} onChange={(id) => onChangeTeam(1, id)} />
    </div>
  );
}

/**
 * Live data shared by the four computed, never-hand-edited sections below —
 * whatever `computeWeekRecap`/`loadLeagueMoney` last fetched for this
 * write-up's own week (see recap/page.tsx), the same source the recap
 * graphic draws from. `summarizeWeek`/`standingsThroughWeek` both take
 * `week` as a hard ceiling — reopening an old week's write-up recomputes
 * from just that week's data, never anything past it, so week 1's numbers
 * can't include week 3's results just because more weeks have been played
 * since.
 */
interface LiveWeekData {
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  week: number;
}

const HIGH_SCORER_PLACEHOLDER = {
  name: "[highest scoring team]",
  points: "[points of the highest scoring team]",
  leader1: "[player]",
  leader2: "[player]",
  leader3: "[player]",
};

/** The "📈 ... outperformed the league" callout — same wording format-recap.ts has always generated, but rendered live with every substituted value picked out in blue instead of frozen into an editable text box. */
function HighScorerCallout({ recapData, ledger, week, playerNames }: LiveWeekData & { playerNames: Record<string, string> }) {
  const summary = recapData && ledger ? summarizeWeek(ledger, week) : null;
  const hs = summary?.highScorer;

  let name = HIGH_SCORER_PLACEHOLDER.name;
  let points = HIGH_SCORER_PLACEHOLDER.points;
  let leader1 = HIGH_SCORER_PLACEHOLDER.leader1;
  let leader2 = HIGH_SCORER_PLACEHOLDER.leader2;
  let leader3 = HIGH_SCORER_PLACEHOLDER.leader3;
  if (hs) {
    const leaders = findWeekTopStarters(hs.rosterId, recapData!.games, 3).map((l) => playerNames[l.playerId] ?? "[player]");
    name = hs.name;
    points = formatPoints(hs.points);
    leader1 = leaders[0] ?? "[player]";
    leader2 = leaders[1] ?? "[player]";
    leader3 = leaders[2] ?? "[player]";
  }

  return (
    <div className="flex flex-col gap-2">
      <LiveCaption>Calculated from live scores — not editable</LiveCaption>
      <p className="text-sm leading-relaxed text-ink-secondary">
        📈 <Variable>{name}</Variable> outperformed the league this week! He scored a whopping <Variable>{points}</Variable>! The
        team was led by <Variable>{leader1}</Variable>, <Variable>{leader2}</Variable> and <Variable>{leader3}</Variable>! Congrats
        to <Variable>{name}</Variable>!
      </p>
    </div>
  );
}

const WINNERS_PLACEHOLDER: { name: string; highlight: boolean }[] = [
  { name: "[highest scoring team]", highlight: true },
  { name: "[2nd highest scoring winning team]", highlight: false },
  { name: "[3rd highest scoring winning team]", highlight: false },
  { name: "[4th highest scoring winning team]", highlight: false },
  { name: "[5th highest scoring winning team]", highlight: false },
];

/** Who'd be getting paid if this week's games ended right now — every team that's currently winning its matchup, richest scorer first. A week with no resolved winner yet (nothing played, or every matchup still tied) falls back to the same bracket placeholders the flat text has always used. */
function WinnersList({ recapData, ledger, week }: LiveWeekData) {
  const summary = recapData && ledger ? summarizeWeek(ledger, week) : null;
  const rows =
    summary && summary.winners.length > 0
      ? summary.winners.map((w) => ({ name: w.name, highlight: summary.highScorer?.rosterId === w.rosterId }))
      : WINNERS_PLACEHOLDER;
  return (
    <div className="flex flex-col gap-2">
      <LiveCaption>Calculated from live scores — not editable</LiveCaption>
      <ul className="flex flex-col gap-1 text-sm text-ink-secondary">
        {rows.map((r, i) => (
          <li key={i}>
            {r.highlight ? "🔹" : "▫️"}
            <Variable>{r.name}</Variable>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every team's result this week — name, score, win/loss — one row per team, laid out the same way the recap graphic's own last-week table reads: name left, score front and center, result icon on the right. */
function LastWeekTable({ recapData, ledger, week }: LiveWeekData) {
  const summary = recapData && ledger ? summarizeWeek(ledger, week) : null;
  return (
    <div className="flex flex-col gap-2">
      <LiveCaption>Calculated from live scores — not editable</LiveCaption>
      {summary ? (
        <div className="flex flex-col divide-y divide-grid text-sm">
          {summary.scoreboard.map((row) => (
            <div key={row.rosterId} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-ink-secondary">{row.name}</span>
              <Variable>{formatPoints(row.points)}</Variable>
              <span className="text-ink-muted">{row.won ? "✅" : "❌"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-secondary">
          <Variable>[team 1]</Variable>
          <Variable>[team 1 points]</Variable>
          <span className="text-xs text-ink-muted">[✅ for a win, ❌ for a loss]</span>
        </div>
      )}
    </div>
  );
}

/** Running earnings through this write-up's own week — richest first. `standingsThroughWeek` sums only weeks up to `week`, so week 1's write-up always shows week 1's money, never a later week's, no matter when it's reopened. */
function StandingsList({ recapData, ledger, week }: LiveWeekData) {
  const rows = recapData && ledger ? standingsThroughWeek(ledger, week) : [];
  return (
    <div className="flex flex-col gap-2">
      <LiveCaption>Calculated from live earnings through this week — not editable</LiveCaption>
      {rows.length > 0 ? (
        <div className="flex flex-col divide-y divide-grid text-sm">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-ink-secondary">{r.name}</span>
              <Variable>${r.amount}</Variable>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-secondary">
          <Variable>[most profitable team profit so far]</Variable>
          <span>[most profitable team name]</span>
        </div>
      )}
    </div>
  );
}

// A distinct background tint per section so each box stands out from the
// page instead of blending into a wall of white — same accent palette the
// map already uses for its per-league colors, at low opacity.
const SECTION_TINT: Record<RecapSectionKey, string> = {
  bowl: "var(--color-series-2)",
  honorable: "var(--color-series-4)",
  highScorer: "var(--color-series-3)",
  winners: "var(--color-series-8)",
  lastWeek: "var(--color-series-1)",
  standings: "var(--color-series-6)",
  upcomingBowl: "var(--color-series-7)",
  upcomingHonorable: "var(--color-series-5)",
};

/**
 * Every section's shared shell: a tinted card so it stands out from the
 * page's white background, an include/exclude checkbox pinned to the
 * top-right corner (unchecked greys the whole box out and leaves it out of
 * both the copied text and the graphic), and a "+"/"–" button pinned to the
 * bottom-right that shows or hides `detail` — an optional free-write box
 * every section can opt into without it cluttering the ones that don't need
 * it.
 */
function SectionBox({
  sectionKey,
  included,
  onToggleIncluded,
  header,
  children,
  detail,
  detailShown,
  onToggleDetail,
}: {
  sectionKey: RecapSectionKey;
  included: boolean;
  onToggleIncluded: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  detail: React.ReactNode;
  detailShown: boolean;
  onToggleDetail: () => void;
}) {
  return (
    <div
      className="relative flex flex-col gap-3 border border-grid p-4 pb-10 pr-9 transition-[opacity,background-color]"
      style={{
        backgroundColor: included
          ? `color-mix(in srgb, ${SECTION_TINT[sectionKey]} 12%, var(--color-surface-raised))`
          : "var(--color-surface)",
        opacity: included ? 1 : 0.55,
      }}
    >
      <label
        className="absolute right-3 top-3 flex cursor-pointer items-center"
        title={included ? "Included — click to leave this out" : "Excluded — click to include it"}
      >
        <input
          type="checkbox"
          checked={included}
          onChange={onToggleIncluded}
          className="h-4 w-4 cursor-pointer accent-series-1"
        />
      </label>
      <div className={`flex flex-col gap-3 ${included ? "" : "pointer-events-none grayscale"}`}>
        {header}
        {children}
        {detailShown ? detail : null}
      </div>
      <button
        type="button"
        onClick={onToggleDetail}
        title={detailShown ? "Remove the detail box" : "Add a detail box"}
        aria-label={detailShown ? "Remove the detail box" : "Add a detail box"}
        className="absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center border border-border bg-page text-sm font-bold leading-none text-ink-secondary transition-colors hover:border-series-1 hover:text-series-1"
      >
        {detailShown ? "–" : "+"}
      </button>
    </div>
  );
}

/**
 * The commish recap, broken into one box per header instead of one flat
 * field — every header from the write-up gets its own section on screen.
 * `onChange` fires with the whole updated model on every keystroke;
 * `joinRecapModel(model)` (see RecapEditor) is what actually gets saved,
 * copied, and posted, so this layout can never drift from that text.
 *
 * Four sections are entirely computed, never hand-typed: High Scorer,
 * Winners Podium, Last Week Results, and Updated Standings all render live
 * from this week's own Sleeper/ledger data (see LiveWeekData above), with
 * every substituted value picked out in blue — same "calculated, not
 * editable" treatment Bowl of the Week/Honorable Mention already get, just
 * without needing a bowl pick behind it. Every section (computed or
 * free-write) can still carry an optional Detail box, toggled by its own
 * "+"/"–" button rather than always taking up space.
 */
export function RecapSectionsEditor({
  model,
  onChange,
  bowlMatchup,
  honorableMatchup,
  upcomingMatchup,
  upcomingHonorableMatchup,
  teams,
  teamOptions,
  recapData,
  ledger,
  week,
  playerNames,
  onRenameBowl,
  onRenameHonorable,
  onRenameUpcomingBowl,
  onRenameUpcomingHonorable,
  onChangeUpcomingBowlTeam,
  onChangeUpcomingHonorableTeam,
}: {
  model: RecapModel;
  onChange: (model: RecapModel) => void;
  bowlMatchup: BowlMatchupResult | null;
  honorableMatchup: BowlMatchupResult | null;
  upcomingMatchup: BowlMatchupPreview | null;
  upcomingHonorableMatchup: BowlMatchupPreview | null;
  teams: Record<number, { name: string; avatar: string | null }>;
  /** The league's roster pool for the upcoming-matchup team pickers below — null until useLeagueTeams finishes loading. */
  teamOptions: LeagueTeamOption[] | null;
  /** This write-up's own week's matchup data — null in preseason, or before it's loaded — and the money ledger it's scored against, feeding the four computed sections below. */
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  week: number;
  /** Player id -> display name, for the High Scorer callout's "led by" names. */
  playerNames: Record<string, string>;
  onRenameBowl: (name: string) => void;
  onRenameHonorable: (name: string) => void;
  onRenameUpcomingBowl: (name: string) => void;
  onRenameUpcomingHonorable: (name: string) => void;
  onChangeUpcomingBowlTeam: (slot: 0 | 1, rosterId: number | "") => void;
  onChangeUpcomingHonorableTeam: (slot: 0 | 1, rosterId: number | "") => void;
}) {
  const set = <K extends FieldKey>(key: K, value: RecapModel[K]) => onChange({ ...model, [key]: value });
  const toggleIncluded = (key: RecapSectionKey) =>
    onChange({ ...model, include: { ...model.include, [key]: !isSectionIncluded(model, key) } });
  const included = (key: RecapSectionKey) => isSectionIncluded(model, key);
  const detailShown = (key: RecapSectionKey) => isDetailShown(model, key);
  const toggleDetail = (key: RecapSectionKey) =>
    onChange({ ...model, detailShown: { ...model.detailShown, [key]: !isDetailShown(model, key) } });
  const live: LiveWeekData = { recapData, ledger, week };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Title" value={model.title} onChange={(v) => set("title", v)} multiline={false} />

      <SectionBox
        sectionKey="bowl"
        included={included("bowl")}
        onToggleIncluded={() => toggleIncluded("bowl")}
        header={<EditableHeader value={bowlMatchup?.bowlName ?? ""} placeholder="Name the Bowl of the Week…" onRename={onRenameBowl} />}
        detailShown={detailShown("bowl")}
        onToggleDetail={() => toggleDetail("bowl")}
        detail={<Field label="Detail" value={model.bowlDetail} onChange={(v) => set("bowlDetail", v)} rows={2} placeholder="Add a detail…" />}
      >
        <DecidedMatchupBody matchup={bowlMatchup} teams={teams} />
      </SectionBox>

      <SectionBox
        sectionKey="honorable"
        included={included("honorable")}
        onToggleIncluded={() => toggleIncluded("honorable")}
        header={
          <EditableHeader
            value={honorableMatchup?.bowlName ?? ""}
            placeholder="Name the Honorable Mention…"
            onRename={onRenameHonorable}
          />
        }
        detailShown={detailShown("honorable")}
        onToggleDetail={() => toggleDetail("honorable")}
        detail={
          <Field label="Detail" value={model.honorableDetail} onChange={(v) => set("honorableDetail", v)} rows={2} placeholder="Add a detail…" />
        }
      >
        <DecidedMatchupBody matchup={honorableMatchup} teams={teams} />
      </SectionBox>

      <SectionBox
        sectionKey="highScorer"
        included={included("highScorer")}
        onToggleIncluded={() => toggleIncluded("highScorer")}
        header={<FixedHeader>📈 High Scorer</FixedHeader>}
        detailShown={detailShown("highScorer")}
        onToggleDetail={() => toggleDetail("highScorer")}
        detail={
          <Field label="Detail" value={model.highScorerDetail} onChange={(v) => set("highScorerDetail", v)} rows={2} placeholder="Add a detail…" />
        }
      >
        <HighScorerCallout {...live} playerNames={playerNames} />
      </SectionBox>

      <SectionBox
        sectionKey="winners"
        included={included("winners")}
        onToggleIncluded={() => toggleIncluded("winners")}
        header={<FixedHeader>{RECAP_HEADERS.winners}</FixedHeader>}
        detailShown={detailShown("winners")}
        onToggleDetail={() => toggleDetail("winners")}
        detail={<Field label="Detail" value={model.winnersDetail} onChange={(v) => set("winnersDetail", v)} rows={2} placeholder="Add a detail…" />}
      >
        <WinnersList {...live} />
      </SectionBox>

      <SectionBox
        sectionKey="lastWeek"
        included={included("lastWeek")}
        onToggleIncluded={() => toggleIncluded("lastWeek")}
        header={<FixedHeader>{RECAP_HEADERS.lastWeek}</FixedHeader>}
        detailShown={detailShown("lastWeek")}
        onToggleDetail={() => toggleDetail("lastWeek")}
        detail={
          <Field label="Detail" value={model.lastWeekDetail} onChange={(v) => set("lastWeekDetail", v)} rows={2} placeholder="Add a detail…" />
        }
      >
        <LastWeekTable {...live} />
      </SectionBox>

      <SectionBox
        sectionKey="standings"
        included={included("standings")}
        onToggleIncluded={() => toggleIncluded("standings")}
        header={<FixedHeader>{RECAP_HEADERS.standings}</FixedHeader>}
        detailShown={detailShown("standings")}
        onToggleDetail={() => toggleDetail("standings")}
        detail={
          <Field label="Detail" value={model.standingsDetail} onChange={(v) => set("standingsDetail", v)} rows={2} placeholder="Add a detail…" />
        }
      >
        <StandingsList {...live} />
      </SectionBox>

      <div className="border-t border-grid pt-3">
        <FixedHeader>{upcomingWeekLabel(model.upcomingWeek)}</FixedHeader>
      </div>

      <SectionBox
        sectionKey="upcomingBowl"
        included={included("upcomingBowl")}
        onToggleIncluded={() => toggleIncluded("upcomingBowl")}
        header={
          <EditableHeader
            value={upcomingMatchup?.bowlName ?? ""}
            placeholder="Name next week's Matchup of the Week…"
            onRename={onRenameUpcomingBowl}
          />
        }
        detailShown={detailShown("upcomingBowl")}
        onToggleDetail={() => toggleDetail("upcomingBowl")}
        detail={
          <Field
            label="Detail"
            value={model.upcomingBowlDetail}
            onChange={(v) => set("upcomingBowlDetail", v)}
            rows={2}
            placeholder="Add a detail…"
          />
        }
      >
        <PreviewMatchupBody preview={upcomingMatchup} teamOptions={teamOptions} onChangeTeam={onChangeUpcomingBowlTeam} />
        <StaticFooter>{WHO_WILL_PREVAIL}</StaticFooter>
      </SectionBox>

      <SectionBox
        sectionKey="upcomingHonorable"
        included={included("upcomingHonorable")}
        onToggleIncluded={() => toggleIncluded("upcomingHonorable")}
        header={
          <EditableHeader
            value={upcomingHonorableMatchup?.bowlName ?? ""}
            placeholder="Name next week's Honorable Mention…"
            onRename={onRenameUpcomingHonorable}
          />
        }
        detailShown={detailShown("upcomingHonorable")}
        onToggleDetail={() => toggleDetail("upcomingHonorable")}
        detail={
          <Field
            label="Detail"
            value={model.upcomingHonorableDetail}
            onChange={(v) => set("upcomingHonorableDetail", v)}
            rows={2}
            placeholder="Add a detail…"
          />
        }
      >
        <PreviewMatchupBody
          preview={upcomingHonorableMatchup}
          teamOptions={teamOptions}
          onChangeTeam={onChangeUpcomingHonorableTeam}
        />
        <StaticFooter>{GOOD_LUCK_TO_ALL}</StaticFooter>
      </SectionBox>
    </div>
  );
}

export { RECAP_SECTIONS };
