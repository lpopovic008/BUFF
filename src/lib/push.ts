"use client";

// Push notifications in the app (see supabase/functions/notify for what's sent, and when). Turned on in Settings →
// Notifications: the app asks iOS for permission, iOS gives the device a token, and the token's registered with your
// account (push_devices, see supabase/push.sql) along with which kinds you want. Signed in only: what's sent is worked
// out from the leagues your account syncs. Kept in this browser: whether they're on, and the kinds.

import { supabase } from "./supabase";
import { isNativeApp } from "./native";

export type PushKind = "scoring" | "lineup" | "results" | "trades";
export type PushPrefs = Record<PushKind, boolean>;

export const PUSH_KINDS: { kind: PushKind; label: string; note: string }[] = [
  { kind: "scoring", label: "Your players score", note: "Touchdowns, field goals and turnovers by your starters." },
  { kind: "lineup", label: "Lineup problems", note: "A starter out, on a bye or questionable, before kickoff." },
  { kind: "results", label: "Matchup results", note: "Your matchups when they're final, and a heads-up when one's close late." },
  { kind: "trades", label: "League trades", note: "Every trade in your leagues." },
];

const KEY = "commish:push";

interface PushState {
  on: boolean;
  prefs: PushPrefs;
  token?: string;
}

const DEFAULT: PushState = { on: false, prefs: { scoring: true, lineup: true, results: true, trades: true } };

export function getPushState(): PushState {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PushState>) };
  } catch {
    return DEFAULT;
  }
}

function savePushState(state: PushState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // (Storage off: on for now, not remembered.)
  }
}

/** Registers this device's token with the signed-in account, with the kinds it wants. */
async function registerToken(token: string, prefs: PushPrefs): Promise<string | null> {
  const { error } = await supabase.rpc("register_push_device", { device_token: token, device_prefs: prefs });
  return error ? error.message : null;
}

/**
 * Asks iOS for this device's token (permission asked first, the first time) and registers it — resolving with an error
 * to show, or null once it's done.
 */
async function obtainToken(): Promise<{ token: string | null; error: string | null }> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return { token: null, error: "Notifications are off for Commi$h in iOS Settings → Notifications." };
  return new Promise((resolve) => {
    let done = false;
    const handles: { remove: () => Promise<void> }[] = [];
    const finish = (r: { token: string | null; error: string | null }) => {
      if (done) return;
      done = true;
      // (Just these two listeners: the one for a tapped notification stays.)
      for (const h of handles) void h.remove();
      resolve(r);
    };
    void PushNotifications.addListener("registration", (t) => finish({ token: t.value, error: null })).then((h) => (done ? void h.remove() : handles.push(h)));
    void PushNotifications.addListener("registrationError", (e) => finish({ token: null, error: e.error || "Couldn't register for notifications." })).then((h) => (done ? void h.remove() : handles.push(h)));
    void PushNotifications.register();
    setTimeout(() => finish({ token: null, error: "Couldn't reach Apple's notification service. Try again in a bit." }), 20_000);
  });
}

/** Turns notifications on (or keeps them on, with these kinds). An error to show, or null. */
export async function turnPushOn(prefs: PushPrefs): Promise<string | null> {
  if (!isNativeApp()) return "Notifications are in the iPhone and iPad app.";
  const { data } = await supabase.auth.getSession();
  if (!data.session) return "Sign in first (Settings → Account): notifications follow your account's leagues.";
  const { token, error } = await obtainToken();
  if (!token) return error;
  const failed = await registerToken(token, prefs);
  if (failed) return failed;
  savePushState({ on: true, prefs, token });
  return null;
}

/** Turns them off: this device forgotten by your account. */
export async function turnPushOff(): Promise<void> {
  const state = getPushState();
  if (state.token) await supabase.from("push_devices").delete().eq("token", state.token);
  savePushState({ ...state, on: false, token: undefined });
}

/** Changes which kinds this device gets (while they're on). */
export async function setPushPrefs(prefs: PushPrefs): Promise<string | null> {
  const state = getPushState();
  savePushState({ ...state, prefs });
  if (!state.on || !state.token) return null;
  return registerToken(state.token, prefs);
}

/**
 * At the app's start: notifications kept registered (a device's token can change, and the account signed in with
 * may have), and a tapped notification's page opened — `go` taking the app there.
 */
export async function startPush(go: (path: string) => void): Promise<() => void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const tapped = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const path = (action.notification.data as { path?: string } | undefined)?.path;
    if (typeof path === "string" && path.startsWith("/")) go(path);
  });
  const state = getPushState();
  if (state.on) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { token } = await obtainToken();
      if (token) {
        await registerToken(token, state.prefs);
        savePushState({ ...state, token });
      }
    }
  }
  return () => void tapped.remove();
}
