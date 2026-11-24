"use client";

// Account sign-up/sign-in, backed by Supabase Auth — email/password, and
// Google or Apple (OAuth). This is the one thing in this app that involves real user
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
import { AUTH_RETURN_URL, isNativeApp } from "./native";

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

export type OAuthProvider = "google" | "apple";

/**
 * Signs in with Google or Apple. In a browser, the whole page goes to the provider's sign-in and comes back to
 * accountRedirectUrl(), where Supabase's client picks the session up from the URL on its own. In the app, the
 * provider's sign-in opens in a Safari sheet over the app (Google won't sign anyone in inside an app's own web view),
 * and comes back into the app by its own link (AUTH_RETURN_URL), where finishAppSignIn takes it in.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<{ error: string | null }> {
  if (!isNativeApp()) {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: accountRedirectUrl() } });
    return { error: error?.message ?? null };
  }
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: AUTH_RETURN_URL, skipBrowserRedirect: true } });
  if (error || !data?.url) return { error: error?.message ?? "Couldn't start signing in." };
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url, presentationStyle: "popover" });
  return { error: null };
}

/** Kept for what already signs in with Google by name. */
export async function signInWithGoogle(): Promise<void> {
  await signInWithProvider("google");
}

/**
 * A sign-in come back into the app (AUTH_RETURN_URL, opened by the Safari sheet): its session taken in — from the code
 * it brings (the PKCE flow) or the tokens (the implicit one) — and the sheet closed. Whether it was one.
 */
export async function finishAppSignIn(url: string): Promise<boolean> {
  if (!url.startsWith(AUTH_RETURN_URL)) return false;
  const parsed = new URL(url.replace(/^[^:]+:\/\//, "https://app/"));
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const code = parsed.searchParams.get("code");
  if (code) await supabase.auth.exchangeCodeForSession(code);
  else if (params.get("access_token") && params.get("refresh_token")) {
    await supabase.auth.setSession({ access_token: params.get("access_token")!, refresh_token: params.get("refresh_token")! });
  }
  const { Browser } = await import("@capacitor/browser");
  await Browser.close().catch(() => {});
  return true;
}

/**
 * Deletes your account, and everything kept with it (your synced data), for good — by way of the app's
 * delete-account function (supabase/functions/delete-account), which alone may; then signs out here. What this
 * device keeps for itself (its leagues, its write-ups) stays on it.
 */
export async function deleteAccount(): Promise<{ error: string | null }> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { error: "Not signed in." };
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST", body: {} });
  if (error) return { error: error.message || "Couldn't delete the account." };
  await supabase.auth.signOut().catch(() => {});
  return { error: null };
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
