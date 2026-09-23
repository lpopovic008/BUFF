// Talks to the separately-deployed FastAPI backend's POST /recap/generate —
// the one feature in this static-export site that needs a real server, since
// the Claude API key it calls with can't live in client-side code. The base
// URL is baked in at build time (see .github/workflows/deploy.yml's
// NEXT_PUBLIC_API_BASE_URL) the same way NEXT_PUBLIC_GOOGLE_CLIENT_ID is.

export interface RecapAiFacts {
  leagueName: string;
  week: number;
  /** One line per matchup, e.g. "Gary's Boys def. Danger Zone 128.4-101.2". */
  matchups: string[];
  highScorer?: string;
  standingsLeader?: string;
}

export async function generateAiRecap(facts: RecapAiFacts): Promise<string> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) {
    throw new Error("The recap-writer backend isn't configured yet.");
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/recap/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      league_name: facts.leagueName,
      week: facts.week,
      matchups: facts.matchups,
      high_scorer: facts.highScorer || undefined,
      standings_leader: facts.standingsLeader || undefined,
    }),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `The recap writer is unavailable right now (${res.status}).`);
  }

  const data = (await res.json()) as { text: string };
  return data.text;
}
