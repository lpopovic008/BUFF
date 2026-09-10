"use client";

import { useState } from "react";
import {
  RecapModel,
  RECAP_HEADERS,
  RECAP_SECTIONS,
  RecapSectionKey,
  isSectionIncluded,
  WHO_WILL_PREVAIL,
  GOOD_LUCK_TO_ALL,
  upcomingWeekLabel,
} from "@/lib/recap-model";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { formatPoints } from "@/lib/format";

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

/** A fixed (non-renameable) header — for the four sections that don't correspond to any other box, so there's nothing for a rename to stay in sync with. */
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
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        Calculated from live scores — not editable
      </span>
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

/** The two picked teams for an upcoming matchup — not decided yet, so no winner/loser, just who's playing. Who's playing is changed with the team pickers below, not here. */
function PreviewMatchupBody({
  preview,
  teams,
}: {
  preview: BowlMatchupPreview | null;
  teams: Record<number, { name: string; avatar: string | null }>;
}) {
  const teamAName = preview ? (teams[preview.rosterIds[0]]?.name ?? "?") : null;
  const teamBName = preview ? (teams[preview.rosterIds[1]]?.name ?? "?") : null;
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <StatColumn label="Team" name={teamAName} points={null} />
      <StatColumn label="Team" name={teamBName} points={null} />
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

/** Every section's shared shell: a tinted card so it stands out from the page's white background, and an include/exclude checkbox pinned to the top-right corner — unchecked greys the whole box out and leaves it out of both the copied text and the graphic. */
function SectionBox({
  sectionKey,
  included,
  onToggleIncluded,
  header,
  children,
}: {
  sectionKey: RecapSectionKey;
  included: boolean;
  onToggleIncluded: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex flex-col gap-3 border border-grid p-4 pr-9 transition-[opacity,background-color]"
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
      </div>
    </div>
  );
}

/**
 * The commish recap, broken into one box per header instead of one flat
 * field — every header from the write-up gets its own section on screen,
 * and every free-write or fill-in-the-bracket spot gets its own box beneath
 * it. `onChange` fires with the whole updated model on every keystroke;
 * `joinRecapModel(model)` (see RecapEditor) is what actually gets saved,
 * copied, and posted, so this layout can never drift from that text.
 * Bowl of the Week / Honorable Mention and their upcoming previews show a
 * renameable header plus computed (Bowl/Honorable) or picked (the previews)
 * team data instead of a free-text result line — see DecidedMatchupBody /
 * PreviewMatchupBody. The same structure applies to every week, preseason
 * included.
 */
export function RecapSectionsEditor({
  model,
  onChange,
  bowlMatchup,
  honorableMatchup,
  upcomingMatchup,
  upcomingHonorableMatchup,
  teams,
  onRenameBowl,
  onRenameHonorable,
  onRenameUpcomingBowl,
  onRenameUpcomingHonorable,
}: {
  model: RecapModel;
  onChange: (model: RecapModel) => void;
  bowlMatchup: BowlMatchupResult | null;
  honorableMatchup: BowlMatchupResult | null;
  upcomingMatchup: BowlMatchupPreview | null;
  upcomingHonorableMatchup: BowlMatchupPreview | null;
  teams: Record<number, { name: string; avatar: string | null }>;
  onRenameBowl: (name: string) => void;
  onRenameHonorable: (name: string) => void;
  onRenameUpcomingBowl: (name: string) => void;
  onRenameUpcomingHonorable: (name: string) => void;
}) {
  const set = <K extends FieldKey>(key: K, value: RecapModel[K]) => onChange({ ...model, [key]: value });
  const toggleIncluded = (key: RecapSectionKey) =>
    onChange({ ...model, include: { ...model.include, [key]: !isSectionIncluded(model, key) } });
  const included = (key: RecapSectionKey) => isSectionIncluded(model, key);

  return (
    <div className="flex flex-col gap-4">
      <Field label="Title" value={model.title} onChange={(v) => set("title", v)} multiline={false} />

      <SectionBox sectionKey="bowl" included={included("bowl")} onToggleIncluded={() => toggleIncluded("bowl")} header={
        <EditableHeader value={bowlMatchup?.bowlName ?? ""} placeholder="Name the Bowl of the Week…" onRename={onRenameBowl} />
      }>
        <DecidedMatchupBody matchup={bowlMatchup} teams={teams} />
        <Field label="Detail" value={model.bowlDetail} onChange={(v) => set("bowlDetail", v)} rows={2} placeholder="Add a detail…" />
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
      >
        <DecidedMatchupBody matchup={honorableMatchup} teams={teams} />
        <Field label="Detail" value={model.honorableDetail} onChange={(v) => set("honorableDetail", v)} rows={2} placeholder="Add a detail…" />
      </SectionBox>

      <SectionBox
        sectionKey="highScorer"
        included={included("highScorer")}
        onToggleIncluded={() => toggleIncluded("highScorer")}
        header={<FixedHeader>📈 High Scorer</FixedHeader>}
      >
        <Field
          label="Callout (fill in any [bracket] left unresolved)"
          value={model.highScorer}
          onChange={(v) => set("highScorer", v)}
          rows={3}
        />
        <Field label="Detail" value={model.highScorerDetail} onChange={(v) => set("highScorerDetail", v)} rows={2} placeholder="Add a detail…" />
      </SectionBox>

      <SectionBox
        sectionKey="winners"
        included={included("winners")}
        onToggleIncluded={() => toggleIncluded("winners")}
        header={<FixedHeader>{RECAP_HEADERS.winners}</FixedHeader>}
      >
        <Field label="List" value={model.winners} onChange={(v) => set("winners", v)} rows={5} />
      </SectionBox>

      <SectionBox
        sectionKey="lastWeek"
        included={included("lastWeek")}
        onToggleIncluded={() => toggleIncluded("lastWeek")}
        header={<FixedHeader>{RECAP_HEADERS.lastWeek}</FixedHeader>}
      >
        <Field label="List" value={model.lastWeek} onChange={(v) => set("lastWeek", v)} rows={6} />
      </SectionBox>

      <SectionBox
        sectionKey="standings"
        included={included("standings")}
        onToggleIncluded={() => toggleIncluded("standings")}
        header={<FixedHeader>{RECAP_HEADERS.standings}</FixedHeader>}
      >
        <Field label="List" value={model.standings} onChange={(v) => set("standings", v)} rows={5} />
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
      >
        <PreviewMatchupBody preview={upcomingMatchup} teams={teams} />
        <Field
          label="Detail"
          value={model.upcomingBowlDetail}
          onChange={(v) => set("upcomingBowlDetail", v)}
          rows={2}
          placeholder="Add a detail…"
        />
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
      >
        <PreviewMatchupBody preview={upcomingHonorableMatchup} teams={teams} />
        <Field
          label="Detail"
          value={model.upcomingHonorableDetail}
          onChange={(v) => set("upcomingHonorableDetail", v)}
          rows={2}
          placeholder="Add a detail…"
        />
        <StaticFooter>{GOOD_LUCK_TO_ALL}</StaticFooter>
      </SectionBox>
    </div>
  );
}

export { RECAP_SECTIONS };
