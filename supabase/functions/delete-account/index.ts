// delete-account: deletes the signed-in caller's account for good (Settings → Account → Delete account…; Apple requires
// an app that makes accounts to let them be deleted from in it). A Supabase Edge Function (Deno) — set up once by hand,
// see docs/app-store.md.
//
// POST, with the caller's own session token (supabase-js's functions.invoke sends it). The token's checked here, and
// only that one user's deleted — with the service role key, which Supabase gives every Edge Function itself and which
// never leaves here. Their synced data (public.app_data) goes with them: its rows are deleted on cascade.
//
// "Verify JWT" can stay on: the caller sends a signed-in user's token.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [/^https:\/\/lpopovic008\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^capacitor:\/\/localhost$/];

function cors(origin: string | null): Record<string, string> {
  const ok = origin && ALLOWED_ORIGINS.some((o) => o.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin : "https://lpopovic008.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers });

  const { error: deleting } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleting) return new Response(JSON.stringify({ error: deleting.message }), { status: 500, headers });
  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers });
});
