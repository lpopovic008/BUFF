"use client";

import "./recap-neon.css";
import {
  RecapModel,
  RECAP_SECTIONS,
  RecapSectionKey,
  isSectionIncluded,
  isDetailShown,
  WHO_WILL_PREVAIL,
  GOOD_LUCK_TO_ALL,
  upcomingWeekLabel,
} from "@/lib/recap-model";
import { BowlMatchupResult, BowlMatchupPreview } from "@/lib/bowl-narrative";
import { LeagueTeamOption } from "@/hooks/useLeagueTeams";
import { WeekRecapData } from "@/lib/league-data";
import { PayoutLedger } from "@/lib/payouts";
import { recapDisplayFont } from "@/lib/fonts";
import {
  GraphicTeam,
  decidedMatchupFor,
  winnersForGraphic,
  highScorerForGraphic,
  lastWeekForGraphic,
  standingsForGraphic,
} from "@/lib/recap-graphic-data";

type FieldKey = keyof RecapModel;

/** Initials fallback — same rule the canvas graphic uses (recap-graphic.ts's initialsFor): a bracket placeholder has nothing sensible to take a letter from. */
function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.startsWith("[")) return "?";
  return trimmed.charAt(0).toUpperCase();
}

/** A team/player logo or photo — a real `<img>` when there's a URL (no canvas/CORS concerns here, this never gets exported as a bitmap), initials otherwise. `ring` matches the graphic's gradient-ring winner treatment; `dim` its 50%-alpha loser treatment. */
function Avatar({
  url,
  name,
  ring = false,
  dim = false,
  small = false,
}: {
  url: string | null;
  name: string;
  ring?: boolean;
  dim?: boolean;
  small?: boolean;
}) {
  const cls = ["rn-avatar", ring ? "rn-ring" : "", dim ? "rn-dim" : "", small ? "rn-avatar-sm" : ""].filter(Boolean).join(" ");
  return <div className={cls}>{url ? <img src={url} alt="" /> : initialsFor(name)}</div>;
}

/** The write-up's own title — always a visible input box, not a plain heading, matching every other editable field's affordance. */
function TitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Give this write-up a title…"
      className="rn-title-input"
    />
  );
}

/** A section card's title: emoji bookending a solid-cyan label, matching recap-graphic.ts's sectionHeader(). */
function SectionHeader({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="rn-section-header">
      <span>{emoji}</span>
      <span className="rn-label">{label}</span>
      <span>{emoji}</span>
    </div>
  );
}

/** Freeform commentary — always a visible textarea, sized/weighted/colored exactly like the graphic's own Detail text (bright bold white), so what you type here is what the picture will show. */
function DetailField({ value, onChange, placeholder = "Add a detail…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="rn-detail-textarea"
    />
  );
}

/** The bowl/cup a matchup is named after — always a visible input box (not hidden behind a double-click), styled in the same display font/size the graphic's own poster title uses. Writes back to the shared pick this box's data came from (see recap/page.tsx), so every other box built from that same pick — this week's result, or a future week's preview of it — picks up the new name too. */
function BowlNameInput({ value, placeholder, onRename }: { value: string; placeholder: string; onRename: (name: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onRename(e.target.value)}
      placeholder={placeholder}
      className={`${recapDisplayFont.className} rn-bowl-name-input`}
    />
  );
}

/** Picks which team fills one slot of an upcoming matchup — a real dropdown (already a proper editable control), with a small logo preview matching the graphic's team columns. */
function TeamSelect({
  value,
  onChange,
  options,
}: {
  value: number | "";
  onChange: (rosterId: number | "") => void;
  options: LeagueTeamOption[];
}) {
  const picked = typeof value === "number" ? options.find((o) => o.rosterId === value) : undefined;
  return (
    <div className="rn-team-col">
      <Avatar url={picked?.avatar ?? null} name={picked?.teamName ?? "?"} />
      <select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} className="rn-team-select">
        <option value="">— Select a team —</option>
        {options.map((t) => (
          <option key={t.rosterId} value={t.rosterId}>
            {t.teamName}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Bowl of the Week / Honorable Mention as decided — winner bright with a ring, loser dimmed, the same "W  defeated  L" wording the graphic draws, computed live from whoever's actually ahead right now rather than hand-typed. */
function DecidedMatchupBody({ matchup, teams }: { matchup: BowlMatchupResult | null; teams: Record<number, GraphicTeam> }) {
  const winner = matchup ? teams[matchup.winnerRosterId] : undefined;
  const loser = matchup ? teams[matchup.loserRosterId] : undefined;
  return (
    <div className="rn-team-row">
      <div className="rn-team-col">
        <Avatar url={winner?.avatar ?? null} name={winner?.name ?? "?"} ring />
        <span className="rn-team-name">{winner?.name ?? "[Team 1]"}</span>
      </div>
      <div className="rn-result-line" style={{ alignSelf: "center", marginTop: 0 }}>
        <span className="rn-w">W</span>
        <span className="rn-vs-text">defeated</span>
        <span className="rn-l">L</span>
      </div>
      <div className="rn-team-col">
        <Avatar url={loser?.avatar ?? null} name={loser?.name ?? "?"} dim />
        <span className="rn-team-name rn-muted">{loser?.name ?? "[Team 2]"}</span>
      </div>
    </div>
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
    return <p className="rn-caption">Loading teams…</p>;
  }
  const rosterIds = preview?.rosterIds ?? [];
  return (
    <div className="rn-team-row">
      <TeamSelect value={rosterIds[0] ?? ""} options={teamOptions} onChange={(id) => onChangeTeam(0, id)} />
      <span className="rn-vs">VS</span>
      <TeamSelect value={rosterIds[1] ?? ""} options={teamOptions} onChange={(id) => onChangeTeam(1, id)} />
    </div>
  );
}

/** Live data shared by the four computed, never-hand-edited sections below — the same source (recap-graphic-data.ts) the exported graphic itself draws from, so this on-screen preview and the picture you copy can never quietly disagree. */
interface LiveWeekData {
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  week: number;
  teams: Record<number, GraphicTeam>;
}

/** "🏆 High Scorer 🏆": the top-3 teams staggered into a podium on the left (1st highest, 2nd a step lower, 3rd lower still, gold/silver/bronze rank labels, points instead of name beneath each logo) and the winning team's top-3 players triangled on the right — the same layout and the same live data as the graphic's own podium. */
function HighScorerBody({ recapData, ledger, week, teams, playerNames }: LiveWeekData & { playerNames: Record<string, string> }) {
  const data = highScorerForGraphic(recapData, ledger, week, teams, playerNames, "");
  if (!data) {
    return <p className="rn-caption">Calculated from live scores once games are underway — not editable.</p>;
  }
  const ordered = [...data.runnersUp].reverse();
  ordered.push({ team: data.team, points: data.points });
  const rankClass = ["rn-bronze", "rn-silver", "rn-gold"];
  const rankLabel = ["3RD", "2ND", "1ST"];
  const rankRow = ["rn-rank-3", "rn-rank-2", ""];
  const players = [0, 1, 2].map((i) => data.topPlayers[i] ?? { name: "?", points: "–", photoUrl: null });
  return (
    <div className="rn-podium">
      <div className="rn-podium-teams">
        {ordered.map((entry, i) => (
          <div key={i} className={`rn-podium-team ${rankRow[i]}`}>
            <span className={`rn-rank-label ${rankClass[i]}`}>{rankLabel[i]}</span>
            <Avatar url={entry.team.avatarUrl} name={entry.team.name} ring={i === 2} small={i !== 2} dim={i !== 2} />
            <span className={i === 2 ? "rn-points-label rn-top" : "rn-points-label"}>{entry.points}</span>
          </div>
        ))}
      </div>
      <div className="rn-player-triangle">
        <div className="rn-player">
          <span className="rn-player-score">{players[0].points}</span>
          <Avatar url={players[0].photoUrl} name={players[0].name} />
        </div>
        <div className="rn-player-bottom-row">
          <div className="rn-player">
            <span className="rn-player-score">{players[1].points}</span>
            <Avatar url={players[1].photoUrl} name={players[1].name} small />
          </div>
          <div className="rn-player">
            <span className="rn-player-score">{players[2].points}</span>
            <Avatar url={players[2].photoUrl} name={players[2].name} small />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The auto-generated "X outperformed the league..." sentence — computed live (see recap-graphic-data.ts), same bright bold treatment as Detail text, never hand-typed. */
function HighScorerSentence({ recapData, ledger, week, teams, playerNames }: LiveWeekData & { playerNames: Record<string, string> }) {
  const data = highScorerForGraphic(recapData, ledger, week, teams, playerNames, "");
  if (!data) return null;
  return <p className="rn-sentence">{data.sentence}</p>;
}

/** Who's getting paid this week — avatar, dollar amount, username, margin of victory — same data and layout as the graphic's Winners row. */
function WinnersBody({ recapData, ledger, week, teams }: LiveWeekData) {
  const rows = winnersForGraphic(recapData, ledger, week, teams);
  if (!rows || rows.length === 0) {
    return <p className="rn-caption">Calculated from live scores once a matchup resolves — not editable.</p>;
  }
  return (
    <div className="rn-winners-row">
      {rows.map((r, i) => (
        <div key={i} className="rn-winner">
          <span className="rn-winner-amount">{r.amountLabel}</span>
          <Avatar url={r.avatarUrl} name={r.name} ring={r.highlight} />
          <span className="rn-team-name">{r.name}</span>
          {r.marginLabel ? <span className="rn-winner-margin">{r.marginLabel}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Every team's result this week — name, score, a proportional background bar (the bar's own "0" always starts past the longest name shown here, same fix as the graphic), win/loss — same data as the graphic's Last Week table. */
function LastWeekBody({ recapData, ledger, week, teams }: LiveWeekData) {
  const rows = lastWeekForGraphic(recapData, ledger, week, teams);
  if (!rows || rows.length === 0) {
    return <p className="rn-caption">Calculated from live scores once games are underway — not editable.</p>;
  }
  const points = rows.map((r) => r.points);
  const max = Math.max(...points);
  const min = Math.min(...points);
  return (
    <div className="rn-lastweek-rows">
      {rows.map((r, i) => {
        const pct = max === min ? 100 : 30 + ((r.points - min) / (max - min)) * 70;
        return (
          <div key={i} className="rn-lastweek-row">
            <div className="rn-lastweek-bar" style={{ width: `${pct}%` }} />
            <span className="rn-lastweek-name">{r.name}</span>
            <span className="rn-lastweek-points">{r.pointsLabel}</span>
            <span className={`rn-lastweek-result ${r.won ? "rn-w" : "rn-l"}`}>{r.won ? "W" : "L"}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Running earnings through this write-up's own week — a stack of bills per team, taller for whoever's made more, same as the graphic's Standings section. */
function StandingsBody({ recapData, ledger, week, teams }: LiveWeekData) {
  const rows = standingsForGraphic(recapData, ledger, week, teams);
  if (!rows || rows.length === 0) {
    return <p className="rn-caption">Calculated from live earnings once there&rsquo;s payout data — not editable.</p>;
  }
  const maxAmount = Math.max(...rows.map((r) => r.amount), 0);
  const unit = Math.max(15, Math.ceil(maxAmount / 16 / 15) * 15);
  return (
    <div className="rn-standings-row">
      {rows.map((r, i) => {
        const count = r.amount > 0 ? Math.max(1, Math.round(r.amount / unit)) : 0;
        return (
          <div key={i} className="rn-standing">
            <span className="rn-standing-amount">{r.amountLabel}</span>
            <div className="rn-bill-stack">
              {Array.from({ length: count }).map((_, b) => (
                <div key={b} className="rn-bill">
                  $
                </div>
              ))}
            </div>
            <span className="rn-standing-name">{r.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// Matches SECTION_TINT's old per-section variety, but every card in this
// theme shares the same translucent-white surface (see recap-graphic.ts's
// COLOR.card) — the graphic doesn't tint cards per section, so neither does
// this.
const SECTION_TITLE: Record<Exclude<RecapSectionKey, "bowl" | "honorable">, { emoji: string; label: string }> = {
  highScorer: { emoji: "🏆", label: "High Scorer" },
  winners: { emoji: "💵", label: "Winners" },
  lastWeek: { emoji: "📊", label: "Last Week" },
  standings: { emoji: "💰", label: "Standings" },
  upcomingBowl: { emoji: "🏈", label: "Matchup of the Week" },
  upcomingHonorable: { emoji: "🥈", label: "Honorable Mention" },
};

/** Every section's shared shell: a translucent card matching the graphic's own, an include/exclude checkbox pinned to the top-right corner (unchecked greys the whole box out and leaves it out of both the copied text and the graphic), and a "+"/"–" button pinned to the bottom-right that shows or hides `detail`. `poster` switches to the wider-padded gradient-tinted card the two decided/preview matchups use in the graphic. */
function SectionBox({
  included,
  onToggleIncluded,
  header,
  children,
  detail,
  detailShown,
  onToggleDetail,
  poster = false,
}: {
  included: boolean;
  onToggleIncluded: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  detail: React.ReactNode;
  detailShown: boolean;
  onToggleDetail: () => void;
  poster?: boolean;
}) {
  return (
    <div className={`rn-card ${poster ? "rn-poster-card" : ""} ${included ? "" : "rn-excluded"}`}>
      <label
        className="rn-include-toggle-wrap"
        title={included ? "Included — click to leave this out" : "Excluded — click to include it"}
      >
        <input type="checkbox" checked={included} onChange={onToggleIncluded} className="rn-include-toggle" />
      </label>
      <div className="rn-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {header}
        {children}
        {detailShown ? detail : null}
      </div>
      <button
        type="button"
        onClick={onToggleDetail}
        title={detailShown ? "Remove the detail box" : "Add a detail box"}
        aria-label={detailShown ? "Remove the detail box" : "Add a detail box"}
        className="rn-detail-toggle"
      >
        {detailShown ? "–" : "+"}
      </button>
    </div>
  );
}

/**
 * The commish recap, styled as a live HTML replica of the exported graphic
 * (see recap-graphic.ts) — same dark neon theme, same layout per section —
 * so editing here is a true preview of what "Copy graphic" produces, not a
 * generic form floating apart from it. Every genuinely editable field
 * (title, bowl/matchup names, team pickers, Detail boxes) renders as an
 * always-visible input/textarea/select styled to match its surrounding
 * text; every computed field (winner/loser, the High Scorer podium, Winners
 * row, Last Week table, Standings stacks) renders read-only, sourced live
 * from recap-graphic-data.ts — the exact same functions the graphic itself
 * calls, so the two can never quietly disagree.
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
  teams: Record<number, GraphicTeam>;
  /** The league's roster pool for the upcoming-matchup team pickers below — null until useLeagueTeams finishes loading. */
  teamOptions: LeagueTeamOption[] | null;
  /** This write-up's own week's matchup data — null in preseason, or before it's loaded — and the money ledger it's scored against, feeding the four computed sections below. */
  recapData: WeekRecapData | null;
  ledger: PayoutLedger | null;
  week: number;
  /** Player id -> display name, for the High Scorer podium's top-3-player photos. */
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
  const live: LiveWeekData = { recapData, ledger, week, teams };
  const decidedBowl = decidedMatchupFor(teams, bowlMatchup);
  const decidedHonorable = decidedMatchupFor(teams, honorableMatchup);

  return (
    <div className="recap-neon">
      <span className="rn-badge">BUFF</span>
      <div className="rn-title-row">
        <TitleField value={model.title} onChange={(v) => set("title", v)} />
        <div className="rn-underline" />
      </div>

      <SectionBox
        poster
        included={included("bowl")}
        onToggleIncluded={() => toggleIncluded("bowl")}
        header={
          <BowlNameInput value={bowlMatchup?.bowlName ?? ""} placeholder="Name the Bowl of the Week…" onRename={onRenameBowl} />
        }
        detailShown={detailShown("bowl")}
        onToggleDetail={() => toggleDetail("bowl")}
        detail={<DetailField value={model.bowlDetail} onChange={(v) => set("bowlDetail", v)} />}
      >
        {decidedBowl ? (
          <DecidedMatchupBody matchup={bowlMatchup} teams={teams} />
        ) : (
          <p className="rn-caption">Calculated from live scores — not editable.</p>
        )}
      </SectionBox>

      <SectionBox
        poster
        included={included("honorable")}
        onToggleIncluded={() => toggleIncluded("honorable")}
        header={
          <BowlNameInput
            value={honorableMatchup?.bowlName ?? ""}
            placeholder="Name the Honorable Mention…"
            onRename={onRenameHonorable}
          />
        }
        detailShown={detailShown("honorable")}
        onToggleDetail={() => toggleDetail("honorable")}
        detail={<DetailField value={model.honorableDetail} onChange={(v) => set("honorableDetail", v)} />}
      >
        {decidedHonorable ? (
          <DecidedMatchupBody matchup={honorableMatchup} teams={teams} />
        ) : (
          <p className="rn-caption">Calculated from live scores — not editable.</p>
        )}
      </SectionBox>

      <SectionBox
        included={included("highScorer")}
        onToggleIncluded={() => toggleIncluded("highScorer")}
        header={<SectionHeader emoji="🏆" label="High Scorer" />}
        detailShown={detailShown("highScorer")}
        onToggleDetail={() => toggleDetail("highScorer")}
        detail={<DetailField value={model.highScorerDetail} onChange={(v) => set("highScorerDetail", v)} />}
      >
        <HighScorerBody {...live} playerNames={playerNames} />
        <HighScorerSentence {...live} playerNames={playerNames} />
      </SectionBox>

      <SectionBox
        included={included("winners")}
        onToggleIncluded={() => toggleIncluded("winners")}
        header={<SectionHeader emoji={SECTION_TITLE.winners.emoji} label={SECTION_TITLE.winners.label} />}
        detailShown={detailShown("winners")}
        onToggleDetail={() => toggleDetail("winners")}
        detail={<DetailField value={model.winnersDetail} onChange={(v) => set("winnersDetail", v)} />}
      >
        <WinnersBody {...live} />
      </SectionBox>

      <SectionBox
        included={included("lastWeek")}
        onToggleIncluded={() => toggleIncluded("lastWeek")}
        header={<SectionHeader emoji={SECTION_TITLE.lastWeek.emoji} label={SECTION_TITLE.lastWeek.label} />}
        detailShown={detailShown("lastWeek")}
        onToggleDetail={() => toggleDetail("lastWeek")}
        detail={<DetailField value={model.lastWeekDetail} onChange={(v) => set("lastWeekDetail", v)} />}
      >
        <LastWeekBody {...live} />
      </SectionBox>

      <SectionBox
        included={included("standings")}
        onToggleIncluded={() => toggleIncluded("standings")}
        header={<SectionHeader emoji={SECTION_TITLE.standings.emoji} label={SECTION_TITLE.standings.label} />}
        detailShown={detailShown("standings")}
        onToggleDetail={() => toggleDetail("standings")}
        detail={<DetailField value={model.standingsDetail} onChange={(v) => set("standingsDetail", v)} />}
      >
        <StandingsBody {...live} />
      </SectionBox>

      <div className="rn-divider" />
      <p className={`${recapDisplayFont.className} rn-upcoming-title`}>{upcomingWeekLabel(model.upcomingWeek)}</p>

      <SectionBox
        poster
        included={included("upcomingBowl")}
        onToggleIncluded={() => toggleIncluded("upcomingBowl")}
        header={
          <>
            <SectionHeader emoji={SECTION_TITLE.upcomingBowl.emoji} label={SECTION_TITLE.upcomingBowl.label} />
            <BowlNameInput
              value={upcomingMatchup?.bowlName ?? ""}
              placeholder="Name next week's Matchup of the Week…"
              onRename={onRenameUpcomingBowl}
            />
          </>
        }
        detailShown={detailShown("upcomingBowl")}
        onToggleDetail={() => toggleDetail("upcomingBowl")}
        detail={<DetailField value={model.upcomingBowlDetail} onChange={(v) => set("upcomingBowlDetail", v)} />}
      >
        <PreviewMatchupBody preview={upcomingMatchup} teamOptions={teamOptions} onChangeTeam={onChangeUpcomingBowlTeam} />
        <p className="rn-trailer">{WHO_WILL_PREVAIL}</p>
      </SectionBox>

      <SectionBox
        poster
        included={included("upcomingHonorable")}
        onToggleIncluded={() => toggleIncluded("upcomingHonorable")}
        header={
          <>
            <SectionHeader emoji={SECTION_TITLE.upcomingHonorable.emoji} label={SECTION_TITLE.upcomingHonorable.label} />
            <BowlNameInput
              value={upcomingHonorableMatchup?.bowlName ?? ""}
              placeholder="Name next week's Honorable Mention…"
              onRename={onRenameUpcomingHonorable}
            />
          </>
        }
        detailShown={detailShown("upcomingHonorable")}
        onToggleDetail={() => toggleDetail("upcomingHonorable")}
        detail={<DetailField value={model.upcomingHonorableDetail} onChange={(v) => set("upcomingHonorableDetail", v)} />}
      >
        <PreviewMatchupBody
          preview={upcomingHonorableMatchup}
          teamOptions={teamOptions}
          onChangeTeam={onChangeUpcomingHonorableTeam}
        />
        <p className="rn-trailer">{GOOD_LUCK_TO_ALL}</p>
      </SectionBox>
    </div>
  );
}

export { RECAP_SECTIONS };
