"use client";

// Account sign-up/sign-in, backed by Supabase Auth — email/password and
// Google OAuth. This is the one thing in this app that involves real user
// credentials, which is exactly why it's not hand-rolled: password hashing,
// session/JWT handling, and the OAuth exchange are all Supabase's job, not
// this app's (see docs/architecture.md for why).
//
// Signing in is optional — see src/lib/supabase-sync.ts for what actually
// happens with an account once one exists (cross-device sync of the same
// data localStore.ts already keeps). This file only knows about identity,
// not app data.

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Where Supabase (and Google, on the way back from its own consent screen) sends the browser after an OAuth sign-in — same basePath-prefixing concern already solved once for the Google Docs/Drive flow's own redirect (see google-auth.ts's redirectUri). */
function accountRedirectUrl(): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${basePath}/settings`;
}

/**
 * `needsEmailConfirmation` is true when Supabase returns a user but no
 * session — the normal case when the project has "Confirm email" turned on
 * (the default for a new project). It's also what a sign-up for an
 * already-registered email looks like, by design: Supabase returns the same
 * shape either way rather than revealing whether an email is taken.
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ error: string | null; needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { error: error?.message ?? null, needsEmailConfirmation: !error && !data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

/** Redirects the whole page to Google's consent screen — there's no meaningful return value, since the browser navigates away and Supabase's client picks the session up automatically from the URL once Google sends it back to accountRedirectUrl(). */
export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: accountRedirectUrl() } });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** The signed-in session, if any — null and loaded=false until Supabase's client has checked for an existing/incoming session at least once. Updates live on sign-in, sign-out, and token refresh via onAuthStateChange. */
export function useSession(): { session: Session | null; loaded: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoaded(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  return { session, loaded };
}
