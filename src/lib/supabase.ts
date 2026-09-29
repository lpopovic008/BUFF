// The Supabase project this app talks to for accounts + cross-device sync
// (see docs/architecture.md). Public URL and publishable key — the new,
// safe-to-expose-client-side replacement for the old "anon" key (same
// privilege level; every real access rule lives in Postgres Row Level
// Security, not in keeping this key secret). Both are inlined at build
// time via the NEXT_PUBLIC_ prefix, the same mechanism every other public
// config value in this app already uses (see google-config.ts).

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** True once real project config is baked in — lets callers no-op cleanly in a dev checkout that hasn't set the env vars, instead of crashing on an empty URL. */
export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabasePublishableKey || "placeholder");
