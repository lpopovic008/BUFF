"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlateCard } from "@/components/ui/PlateCard";
import { useConfig } from "@/hooks/useConfig";
import { addSiteLeague } from "@/lib/localStore";
import { siteLeagueId } from "@/lib/sites/ids";
import { finishYahooSignIn, myYahooLeagues, yahooSignedIn } from "@/lib/sites/yahoo";

type YahooLeague = Awaited<ReturnType<typeof myYahooLeagues>>[number];

/**
 * Where Yahoo sends you back to once you've signed in to it for this app (see sites/yahoo): your sign-in's finished
 * here, and your Yahoo leagues listed to add — this season's ticked to begin with.
 */
export default function YahooPage() {
  const { config, refresh } = useConfig();
  const router = useRouter();
  const [state, setState] = useState<"working" | "failed" | "ready">("working");
  const [leagues, setLeagues] = useState<YahooLeague[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const ok = await finishYahooSignIn(code);
        // (The code's spent: off the address, so a reload doesn't try it again.)
        window.history.replaceState(null, "", window.location.pathname);
        if (!ok) return !cancelled && setState("failed");
      } else if (!yahooSignedIn()) return !cancelled && setState("failed");
      const found = await myYahooLeagues();
      if (cancelled) return;
      setLeagues(found);
      const newest = found[0]?.season;
      setPicked(new Set(found.filter((l) => l.season === newest).map((l) => l.key)));
      setState("ready");
    })().catch(() => !cancelled && setState("failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  const added = new Set(config.leagues.map((l) => l.leagueId));
  const idOf = (l: YahooLeague) => siteLeagueId({ site: "yahoo", season: l.season, id: l.key });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-ink-primary">Yahoo</h1>
      <PlateCard title="Your Yahoo leagues">
        {state === "working" ? <p className="text-sm text-ink-secondary">Signing in to Yahoo…</p> : null}
        {state === "failed" ? (
          <p className="text-sm text-status-critical">
            Couldn&rsquo;t sign in to Yahoo. Try again from <Link href="/settings" className="underline">Settings</Link>.
          </p>
        ) : null}
        {state === "ready" ? (
          leagues.length === 0 ? (
            <p className="text-sm text-ink-secondary">No Yahoo football leagues found for you.</p>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                for (const l of leagues) if (picked.has(l.key)) addSiteLeague({ leagueId: idOf(l), url: l.url ?? "https://football.fantasysports.yahoo.com/", nickname: l.name });
                refresh();
                router.push("/settings");
              }}
            >
              <ul className="divide-y divide-grid">
                {leagues.map((l) => (
                  <li key={l.key} className="py-2">
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={picked.has(l.key) || added.has(idOf(l))}
                        disabled={added.has(idOf(l))}
                        onChange={(e) => setPicked((p) => (e.target.checked ? new Set([...p, l.key]) : new Set([...p].filter((k) => k !== l.key))))}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink-primary">{l.name}</span>
                      <span className="shrink-0 tabular-nums text-ink-muted">{l.season}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button type="submit" className="self-start border border-border px-3 py-1.5 text-sm font-bold text-ink-primary hover:bg-page">
                Add these
              </button>
            </form>
          )
        ) : null}
      </PlateCard>
    </div>
  );
}
