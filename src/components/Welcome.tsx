"use client";

import Link from "next/link";
import { DiscoverForm } from "@/app/(chrome)/settings/DiscoverForm";
import { defaultSeason } from "@/lib/app-defaults";

const FEATURES: { title: string; text: string }[] = [
  { title: "Live", text: "Your starters across every league, game by game, and the Red Zone's scoring plays as they happen." },
  { title: "Leagues", text: "Matchups, standings, the playoff picture, history and payouts." },
  { title: "Trades", text: "Every trade in your leagues, how each side's done since, and a trade calculator." },
  { title: "Values", text: "Dynasty and redraft player values, with their stats." },
  { title: "Write-ups", text: "The week's results, standings and matchups written up for the group chat." },
];

/**
 * What someone sees before they've added a league: what the site is, and where to start — their Sleeper username
 * right here, any other site's leagues in Settings, and the player values, which need no league at all. `onReady`:
 * told once their Sleeper leagues are found.
 */
export function Welcome({ onReady }: { onReady: () => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-4 md:py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold leading-tight text-ink-primary md:text-4xl">Every fantasy league you play in, on one screen.</h1>
        <p className="text-sm leading-relaxed text-ink-secondary md:text-base">
          Commi$h brings your leagues together — Sleeper, ESPN, Yahoo, MyFantasyLeague and Fleaflicker. Free, and nothing to
          install.
        </p>
      </header>

      <section className="flex flex-col gap-3 border border-border bg-surface p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-primary">Start with your Sleeper username</h2>
        <DiscoverForm defaultUsername="" defaultSeason={defaultSeason()} onDiscovered={onReady} />
        <p className="text-xs text-ink-muted">
          Leagues on ESPN, Yahoo, MyFantasyLeague or Fleaflicker?{" "}
          <Link href="/settings" className="text-ink-secondary underline decoration-dotted hover:text-ink-primary">
            Add them by their link in Settings
          </Link>
          .
        </p>
      </section>

      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <li key={f.title} className="flex flex-col gap-1 border-l border-border pl-3">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-primary">{f.title}</span>
            <span className="text-sm text-ink-secondary">{f.text}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-muted">
        No league yet?{" "}
        <Link href="/values" className="text-ink-secondary underline decoration-dotted hover:text-ink-primary">
          Browse player values
        </Link>
        . Everything&rsquo;s kept in your browser unless you sign in to sync it.{" "}
        <Link href="/privacy" className="underline decoration-dotted hover:text-ink-secondary">
          Privacy
        </Link>
      </p>
    </div>
  );
}
