"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlateCard } from "@/components/ui/PlateCard";
import { useConfig } from "@/hooks/useConfig";
import { visibleLeagues } from "@/lib/localStore";
import { avatarUrl, getLeague } from "@/lib/sleeper";

/**
 * The leagues to pick from on a page opened without one (from the phone's
 * tab bar): every league you show — or, for write-ups, the ones you commish.
 * With just one, it's opened straight away.
 */
export function LeaguePicker({ title, commishOnly = false, href }: { title: string; commishOnly?: boolean; href: (leagueId: string) => string }) {
  const { config, loaded } = useConfig();
  const router = useRouter();
  const ids = visibleLeagues(config.leagues)
    .filter((l) => !commishOnly || l.isCommish)
    .map((l) => l.leagueId)
    .join(",");
  const [leagues, setLeagues] = useState<{ id: string; name: string; logo: string | null }[] | null>(null);

  useEffect(() => {
    if (!loaded) return;
    const list = ids ? ids.split(",") : [];
    if (list.length === 1) {
      router.replace(href(list[0]));
      return;
    }
    let cancelled = false;
    void Promise.all(list.map((id) => getLeague(id).then((l) => ({ id, name: l?.name ?? id, logo: avatarUrl(l?.avatar) })))).then((rows) => {
      if (!cancelled) setLeagues(rows);
    });
    return () => {
      cancelled = true;
    };
    // `href` is a fresh function each render; the leagues alone decide what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, ids, router]);

  return (
    <PlateCard title={title} bodyClassName="p-2">
      {leagues === null ? (
        <p className="p-2 text-sm text-ink-secondary">Loading…</p>
      ) : leagues.length === 0 ? (
        <p className="p-2 text-sm text-ink-secondary">{commishOnly ? "No league you commish." : "No leagues."}</p>
      ) : (
        <ul className="flex flex-col">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link
                href={href(l.id)}
                className="flex items-center gap-3 px-2 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-[var(--map-tag)] hover:text-[var(--map-tag-ink)]"
              >
                {l.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Sleeper's avatar CDN on a static export
                  <img src={l.logo} alt="" className="h-6 w-6 shrink-0 object-cover" />
                ) : (
                  <span className="h-6 w-6 shrink-0 bg-grid" aria-hidden />
                )}
                <span className="min-w-0 truncate">{l.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PlateCard>
  );
}
