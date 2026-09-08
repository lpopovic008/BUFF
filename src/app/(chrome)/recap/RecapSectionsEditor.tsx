"use client";

import { RecapModel, RECAP_HEADERS, WHO_WILL_PREVAIL, GOOD_LUCK_TO_ALL, upcomingWeekLabel } from "@/lib/recap-model";

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
    "w-full border border-border bg-page px-3 py-2 font-mono text-sm text-ink-primary outline-none transition-colors focus:border-series-1";
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

/** A section's on-screen heading — the literal line the header appears as once copied, so what's shown here always matches what goes out. */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-ink-primary">{children}</h3>;
}

function Section({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border border-grid bg-surface-raised p-4">
      <SectionHeader>{header}</SectionHeader>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

/** Read-only closing line — fixed text every write-up ends its preview sections with, shown so the section reads complete without being an editable box. */
function StaticFooter({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-ink-primary">{children}</p>;
}

/**
 * The commish recap, broken into one box per header instead of one flat
 * field — every header from the write-up gets its own section on screen,
 * and every free-write or fill-in-the-bracket spot gets its own box beneath
 * it. `onChange` fires with the whole updated model on every keystroke;
 * `joinRecapModel(model)` (see RecapEditor) is what actually gets saved,
 * copied, and posted, so this layout can never drift from that text.
 */
export function RecapSectionsEditor({ model, onChange }: { model: RecapModel; onChange: (model: RecapModel) => void }) {
  const set = <K extends FieldKey>(key: K, value: RecapModel[K]) => onChange({ ...model, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      <Field label="Title" value={model.title} onChange={(v) => set("title", v)} multiline={false} />

      <Section header="👑 Bowl of the Week">
        <Field
          label="Result (fill in any [bracket] left unresolved)"
          value={model.bowlResult}
          onChange={(v) => set("bowlResult", v)}
          multiline={false}
        />
        <Field label="Detail" value={model.bowlDetail} onChange={(v) => set("bowlDetail", v)} rows={2} />
      </Section>

      <Section header="🏆 Honorable Mention">
        <Field
          label="Result (fill in any [bracket] left unresolved)"
          value={model.honorableResult}
          onChange={(v) => set("honorableResult", v)}
          multiline={false}
        />
        <Field label="Detail" value={model.honorableDetail} onChange={(v) => set("honorableDetail", v)} rows={2} />
      </Section>

      <Section header="📈 High Scorer">
        <Field
          label="Callout (fill in any [bracket] left unresolved)"
          value={model.highScorer}
          onChange={(v) => set("highScorer", v)}
          rows={3}
        />
        <Field label="Detail" value={model.highScorerDetail} onChange={(v) => set("highScorerDetail", v)} rows={2} />
      </Section>

      <Section header={RECAP_HEADERS.winners}>
        <Field label="List" value={model.winners} onChange={(v) => set("winners", v)} rows={5} />
      </Section>

      <Section header={RECAP_HEADERS.lastWeek}>
        <Field label="List" value={model.lastWeek} onChange={(v) => set("lastWeek", v)} rows={6} />
      </Section>

      <Section header={RECAP_HEADERS.standings}>
        <Field label="List" value={model.standings} onChange={(v) => set("standings", v)} rows={5} />
      </Section>

      <div className="border-t border-grid pt-3">
        <SectionHeader>{upcomingWeekLabel(model.upcomingWeek)}</SectionHeader>
      </div>

      <Section header={RECAP_HEADERS.upcomingBowl}>
        <Field
          label="Matchup preview (fill in any [bracket] left unresolved)"
          value={model.upcomingBowlLines}
          onChange={(v) => set("upcomingBowlLines", v)}
          rows={7}
        />
        <Field label="Detail" value={model.upcomingBowlDetail} onChange={(v) => set("upcomingBowlDetail", v)} rows={2} />
        <StaticFooter>{WHO_WILL_PREVAIL}</StaticFooter>
      </Section>

      <Section header={RECAP_HEADERS.upcomingHonorable}>
        <Field
          label="Matchup preview (fill in any [bracket] left unresolved)"
          value={model.upcomingHonorableLines}
          onChange={(v) => set("upcomingHonorableLines", v)}
          rows={2}
        />
        <Field
          label="Detail"
          value={model.upcomingHonorableDetail}
          onChange={(v) => set("upcomingHonorableDetail", v)}
          rows={2}
        />
        <StaticFooter>{GOOD_LUCK_TO_ALL}</StaticFooter>
      </Section>
    </div>
  );
}
