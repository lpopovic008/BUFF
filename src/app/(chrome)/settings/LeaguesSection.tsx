"use client";

import { useIsNativeApp } from "@/lib/native";
import { useEffect, useState, useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronUpIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, TrashIcon, WalkieTalkieIcon, ExternalLinkIcon, PlusCircleIcon } from "@/components/ui/Icon";
import { AppConfig, TrackedLeague, addSiteLeague, moveLeague, nameLeague, removeLeague, setMyTeam, toggleLeagueHidden } from "@/lib/localStore";
import { getLeague, getLeagueRosters, getLeagueUsers } from "@/lib/sleeper";
import { SITE_LABEL, siteOf } from "@/lib/sites/ids";
import { parseLeagueLink } from "@/lib/sites/urls";
import { leagueReadable } from "@/lib/sites/readable";
import { getLogins, onLoginsChange, setLogin } from "@/lib/sites/logins";
import { forgetKept, relayConfigured } from "@/lib/sites/fetch";
import { myId } from "@/lib/sites/teams";
import { yahooClientId, yahooSignInUrl } from "@/lib/sites/yahoo";
import { DiscoverForm } from "./DiscoverForm";

const FIELD = "w-full min-w-0 border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-ink-primary";
const LINK_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center border border-border text-ink-secondary transition-all duration-150 hover:bg-page hover:text-ink-primary active:scale-90";

/** The site logins kept in this browser (see sites/logins), as they change. */
function useLogins() {
  return useSyncExternalStore(
    onLoginsChange,
    () => JSON.stringify(getLogins()),
    () => "{}"
  );
}

/**
 * Every league you've added, from every site, in one list — each marked with its site, in your order. Sleeper's
 * found by your username; any other's added by pasting its link (or, Yahoo's, by signing in to Yahoo). One that can't
 * be read here yet is marked link only: it opens on its site, and isn't on the rest of the app's pages.
 */
export function LeaguesSection({ config, defaultSeason, onChange }: { config: AppConfig; defaultSeason: string; onChange: () => void }) {
  const logins = JSON.parse(useLogins()) as ReturnType<typeof getLogins>;
  const native = useIsNativeApp();
  const hasEspn = config.leagues.some((l) => siteOf(l.leagueId) === "espn");
  const hasYahoo = config.leagues.some((l) => siteOf(l.leagueId) === "yahoo");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Sleeper</h3>
        <DiscoverForm defaultUsername={config.sleeperUsername ?? ""} defaultSeason={config.season || defaultSeason} onDiscovered={onChange} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">ESPN, Yahoo, MFL or Fleaflicker</h3>
        <AddByLink season={config.season || defaultSeason} onAdded={onChange} />
        {/* (Yahoo sends you back to the website once you've signed in: there, not in the app.) */}
        {relayConfigured && !native ? <YahooSignIn signedIn={Boolean(logins.yahoo)} /> : null}
        {hasEspn ? <EspnLogin saved={Boolean(logins.espn)} /> : null}
        {hasYahoo && !relayConfigured ? <p className="text-xs text-ink-muted">Yahoo leagues need the app&rsquo;s league-sites function set up (see docs/league-sites.md).</p> : null}
      </div>

      {config.leagues.length > 0 ? (
        <ul className="divide-y divide-grid border-t border-grid">
          {config.leagues.map((league, i) => (
            <LeagueRow key={league.leagueId} league={league} first={i === 0} last={i === config.leagues.length - 1} onChange={onChange} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AddByLink({ season, onAdded }: { season: string; onAdded: () => void }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const found = parseLeagueLink(link, season);
        if (!found) {
          setError("That's not a league link on ESPN, Yahoo, MyFantasyLeague or Fleaflicker.");
          return;
        }
        setError(null);
        addSiteLeague(found);
        setLink("");
        onAdded();
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-ink-secondary">League link</span>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://fantasy.espn.com/football/league?leagueId=…" required className={FIELD} />
      </label>
      <IconButton icon={<PlusCircleIcon />} label="Add league" type="submit" variant="primary" />
      {error ? <p className="basis-full text-sm text-status-critical">{error}</p> : null}
    </form>
  );
}

function YahooSignIn({ signedIn }: { signedIn: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {signedIn ? (
        <>
          <span className="text-ink-secondary">Signed in to Yahoo</span>
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings/yahoo`} className="font-bold text-ink-primary underline">
            Add my Yahoo leagues
          </a>
          <button type="button" className="text-ink-muted underline" onClick={() => setLogin("yahoo", null)}>
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          className="border border-border px-3 py-1.5 font-bold text-ink-primary transition-colors hover:bg-page"
          onClick={async () => {
            const id = await yahooClientId();
            if (!id) {
              setError("Yahoo sign-in isn't set up yet (see docs/league-sites.md).");
              return;
            }
            window.location.href = yahooSignInUrl(id);
          }}
        >
          Sign in to Yahoo
        </button>
      )}
      {error ? <p className="basis-full text-sm text-status-critical">{error}</p> : null}
    </div>
  );
}

function EspnLogin({ saved }: { saved: boolean }) {
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-secondary">ESPN login{saved ? " · saved" : " · for private leagues"}</summary>
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!s2.trim() || !swid.trim()) return;
          setLogin("espn", { s2: s2.trim(), swid: swid.trim() });
          forgetKept();
          setS2("");
          setSwid("");
        }}
      >
        <p className="text-xs text-ink-muted">
          From fantasy.espn.com&rsquo;s cookies, logged in there (your browser&rsquo;s developer tools → Cookies). Kept in this browser only, and sent only to ESPN.
        </p>
        <input value={s2} onChange={(e) => setS2(e.target.value)} placeholder="espn_s2" aria-label="espn_s2" className={FIELD} />
        <input value={swid} onChange={(e) => setSwid(e.target.value)} placeholder="SWID" aria-label="SWID" className={FIELD} />
        <div className="flex gap-3">
          <button type="submit" className="border border-border px-3 py-1.5 font-bold text-ink-primary hover:bg-page">
            Save
          </button>
          {saved ? (
            <button
              type="button"
              className="text-ink-muted underline"
              onClick={() => {
                setLogin("espn", null);
                forgetKept();
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      </form>
    </details>
  );
}

function LeagueRow({ league, first, last, onChange }: { league: TrackedLeague; first: boolean; last: boolean; onChange: () => void }) {
  // (Re-read as logins come and go: a Yahoo league turns readable once you're signed in.)
  useLogins();
  const site = siteOf(league.leagueId);
  const readable = leagueReadable(league.leagueId);
  const name = league.nickname ?? (site === "sleeper" ? league.leagueId : `${SITE_LABEL[site]} league`);

  // A league on another site named as the site names it, once it's been read.
  useEffect(() => {
    if (site === "sleeper" || league.nickname || !readable) return;
    let cancelled = false;
    getLeague(league.leagueId)
      .then((l) => {
        if (!cancelled && l?.name) {
          nameLeague(league.leagueId, l.name);
          onChange();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [site, league.leagueId, league.nickname, readable, onChange]);

  const act = (f: () => void) => () => {
    f();
    onChange();
  };

  return (
    <li className="flex flex-col gap-1.5 py-2.5">
      <div className="flex flex-nowrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 flex-col">
            <IconButton icon={<ChevronUpIcon className="h-4 w-4" />} label={`Move ${name} up`} onClick={act(() => moveLeague(league.leagueId, "up"))} disabled={first} size="sm" />
            <IconButton icon={<ChevronDownIcon className="h-4 w-4" />} label={`Move ${name} down`} onClick={act(() => moveLeague(league.leagueId, "down"))} disabled={last} size="sm" />
          </div>
          <div className={`flex min-w-0 items-center gap-1.5 font-medium transition-opacity ${league.hidden ? "text-ink-muted opacity-50" : "text-ink-primary"}`}>
            <span className="shrink-0 text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">{SITE_LABEL[site]}</span>
            <span className="truncate">{name}</span>
            {league.isCommish ? <WalkieTalkieIcon className="h-[1.3em] w-[1.3em] shrink-0 text-status-good" role="img" aria-label="Commissioner" /> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {league.url ? (
            <a href={league.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} on ${SITE_LABEL[site]}`} title={`Open on ${SITE_LABEL[site]}`} className={LINK_BUTTON}>
              <ExternalLinkIcon />
            </a>
          ) : null}
          {readable ? (
            <IconButton icon={league.hidden ? <EyeOffIcon /> : <EyeIcon />} label={league.hidden ? "Show in the app" : "Hide from the app"} onClick={act(() => toggleLeagueHidden(league.leagueId))} />
          ) : null}
          <IconButton icon={<TrashIcon />} label="Remove league" onClick={act(() => removeLeague(league.leagueId))} variant="danger" />
        </div>
      </div>
      {site !== "sleeper" ? (
        <div className="flex min-w-0 items-center gap-2 pl-10 text-xs text-ink-muted">
          {readable ? <TeamPicker league={league} onChange={onChange} /> : <span className="font-bold uppercase tracking-wide">Link only{site === "yahoo" ? " · sign in to Yahoo to read it" : ""}</span>}
        </div>
      ) : null}
    </li>
  );
}

/** Which of a league's teams is yours, picked from its teams (until you pick, the one its site says is yours). */
function TeamPicker({ league, onChange }: { league: TrackedLeague; onChange: () => void }) {
  const [teams, setTeams] = useState<{ id: string; name: string; mine: boolean }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getLeagueRosters(league.leagueId), getLeagueUsers(league.leagueId)])
      .then(([rosters, users]) => {
        if (cancelled) return;
        const me = myId();
        setTeams(
          rosters.map((r) => {
            const user = users.find((u) => u.user_id === r.owner_id);
            return { id: String(r.roster_id), name: user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`, mine: r.owner_id === me };
          })
        );
      })
      .catch(() => !cancelled && setTeams([]));
    return () => {
      cancelled = true;
    };
  }, [league.leagueId, league.myTeam]);

  if (teams === null) return <span>Reading the league…</span>;
  if (teams.length === 0) return <span>Couldn&rsquo;t read this league{siteOf(league.leagueId) === "espn" ? " — if it's private, add your ESPN login above" : ""}.</span>;
  const value = league.myTeam ?? teams.find((t) => t.mine)?.id ?? "";
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="shrink-0">Your team</span>
      <select
        value={value}
        onChange={(e) => {
          setMyTeam(league.leagueId, e.target.value || null);
          onChange();
        }}
        className="min-w-0 truncate border border-border bg-page px-2 py-1 text-xs font-bold text-ink-primary outline-none focus:border-ink-primary"
      >
        <option value="">Pick yours…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
