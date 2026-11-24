import type { Metadata } from "next";
import Link from "next/link";
import { PlateCard } from "@/components/ui/PlateCard";

export const metadata: Metadata = { title: "Support — Commi$h" };

/** Help getting started, and how to reach the developer — the support page the App Store listing links to. */
export default function SupportPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 text-sm leading-relaxed text-ink-secondary">
      <h1 className="text-2xl font-semibold text-ink-primary">Support</h1>

      <PlateCard title="Getting started">
        <ol className="list-decimal pl-5">
          <li>Open Settings and enter your Sleeper username to find your Sleeper leagues.</li>
          <li>Leagues on ESPN, Yahoo, MyFantasyLeague or Fleaflicker: paste the league&rsquo;s link under Leagues.</li>
          <li>Pick which team is yours in each, and you&rsquo;re set: live scores on Home, your leagues on League.</li>
        </ol>
      </PlateCard>

      <PlateCard title="Syncing between devices">
        <p>Sign in under Settings → Account, with the same account on each device.</p>
      </PlateCard>

      <PlateCard title="Deleting your account">
        <p>Settings → Account → Delete account. Your account and everything synced to it are deleted for good.</p>
      </PlateCard>

      <PlateCard title="Something wrong, or an idea?">
        <p>
          Send it from Settings → Suggest an improvement — it goes straight to the developer. Privacy questions too: see{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
          .
        </p>
      </PlateCard>
    </article>
  );
}
