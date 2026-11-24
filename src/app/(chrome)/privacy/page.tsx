import type { Metadata } from "next";
import { PlateCard } from "@/components/ui/PlateCard";

export const metadata: Metadata = { title: "Privacy — Commi$h" };

/** What the app keeps, where, and what's sent where — the policy the App Store listing links to. */
export default function PrivacyPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 text-sm leading-relaxed text-ink-secondary">
      <h1 className="text-2xl font-semibold text-ink-primary">Privacy</h1>
      <p>Last updated November 24, 2026.</p>

      <PlateCard title="In short">
        <p>
          Commi$h tracks your fantasy football leagues. It shows no ads, tracks no one, and sells nothing. Without an
          account, everything it keeps stays on your device. With one, what you&rsquo;ve saved is kept with your account so
          your other devices have it too, and you can delete it all at any time.
        </p>
      </PlateCard>

      <PlateCard title="What's kept on your device">
        <p>
          Your Sleeper username, the leagues you&rsquo;ve added, your settings, the write-ups you&rsquo;ve written, your
          picks and notes — kept in the app&rsquo;s own storage on your device. Logins for other fantasy sites (ESPN&rsquo;s
          cookies, a Yahoo sign-in) are kept only on the device they were entered on, and never in your account.
        </p>
      </PlateCard>

      <PlateCard title="Your account (optional)">
        <p>
          Signing in — with email, Apple or Google — keeps your email address and a copy of what&rsquo;s on your device
          (leagues, settings, write-ups) with your account, on Supabase, so it syncs between your devices. Only you can read
          it. Delete your account in Settings → Account → Delete account, and it and everything kept with it are deleted
          for good.
        </p>
      </PlateCard>

      <PlateCard title="What's fetched from where">
        <p>
          League data comes from the sites your leagues are on — Sleeper, ESPN, Yahoo, MyFantasyLeague, Fleaflicker — asked
          for straight from your device, or for some, by way of the app&rsquo;s own server function, which passes the
          request on and keeps nothing. NFL scores and plays come from ESPN; player photos from Sleeper. Those sites see an
          ordinary request from your device, as when you visit them.
        </p>
        <p className="mt-2">
          If you ask for an AI-written recap, the week&rsquo;s results (team names and scores) are sent to Google&rsquo;s
          Gemini to write it. If you save a write-up to Google Docs (on the website), it&rsquo;s sent to your own Google
          Doc. Suggestions you send from Settings are kept for the developer to read, with nothing to say who sent them.
        </p>
      </PlateCard>

      <PlateCard title="Children">
        <p>Commi$h isn&rsquo;t meant for children under 13 and doesn&rsquo;t knowingly keep anything about them.</p>
      </PlateCard>

      <PlateCard title="Questions">
        <p>Send them from Settings → Suggest an improvement, or see the Support page.</p>
      </PlateCard>
    </article>
  );
}
