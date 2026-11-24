"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, UploadIcon } from "@/components/ui/Icon";
import { useSession, signUpWithEmail, signInWithEmail, signInWithProvider, signOut, deleteAccount, OAuthProvider } from "@/lib/auth";
import { reconcile, SyncAction } from "@/lib/supabase-sync";
import { getSyncState } from "@/lib/localStore";
import { supabaseConfigured } from "@/lib/supabase";
import { useIsNativeApp } from "@/lib/native";

const ACTION_MESSAGE: Record<SyncAction, string> = {
  pull: "Pulled from your account.",
  push: "Saved to your account.",
  noop: "Up to date.",
};

/**
 * Signing in here syncs everything this browser has saved — tracked
 * leagues, settings, the recap archive, bowl picks — to a real account, so
 * signing in with the same account on another device picks up right where
 * this one left off. This is entirely optional: without an account, the app
 * keeps working exactly as it does today, per-browser, no data leaving this
 * device.
 */
export function AccountSection() {
  const { session, loaded } = useSession();

  if (!supabaseConfigured) {
    return <p className="text-sm text-ink-secondary">Accounts aren&rsquo;t configured for this build.</p>;
  }
  if (!loaded) {
    return <p className="text-sm text-ink-secondary">Loading…</p>;
  }
  return session ? <SignedInView email={session.user.email ?? ""} userId={session.user.id} /> : <SignedOutView />;
}

function SignedInView({ email, userId }: { email: string; userId: string }) {
  const [status, setStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncAction | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => getSyncState().lastSyncedAt);

  async function handleSync() {
    setStatus("syncing");
    setError(null);
    try {
      const action = await reconcile(userId);
      setResult(action);
      setLastSyncedAt(getSyncState().lastSyncedAt);
      setStatus("synced");
      if (action === "pull") {
        window.location.reload();
        return;
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Sync failed.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-ink-primary">{email}</p>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          icon={status === "synced" ? <CheckIcon /> : <UploadIcon />}
          label={status === "syncing" ? "Syncing…" : "Sync now"}
          onClick={handleSync}
          disabled={status === "syncing"}
          variant="primary"
        />
        <button
          type="button"
          onClick={() => signOut()}
          className="border border-border px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-page hover:text-ink-primary"
        >
          Sign out
        </button>
        {lastSyncedAt ? (
          <span className="text-xs text-ink-muted">Synced {new Date(lastSyncedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
      {status === "synced" && result ? <p className="text-xs text-status-good">{ACTION_MESSAGE[result]}</p> : null}
      <DeleteAccount />
    </div>
  );
}

/**
 * Deleting your account, for good — it and everything synced to it — asked twice, the second time with the word
 * typed, so it's never done by a slip. What's kept on this device itself stays.
 */
function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-xs font-medium text-status-critical underline decoration-dotted">
        Delete account…
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 border border-status-critical/50 p-3">
      <p className="text-xs text-ink-secondary">
        This deletes your account and everything synced to it, for good. What&rsquo;s saved on this device stays on it. Type <span className="font-bold text-ink-primary">DELETE</span> to confirm.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-label="Type DELETE to confirm"
        autoCapitalize="characters"
        className="w-full min-w-0 border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-ink-primary"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={typed.trim() !== "DELETE" || state === "deleting"}
          onClick={async () => {
            setState("deleting");
            const { error } = await deleteAccount();
            if (error) {
              setState("error");
              setError(error);
            }
          }}
          className="border border-status-critical px-3 py-2 text-sm font-bold text-status-critical transition-colors hover:bg-status-critical/10 disabled:opacity-40"
        >
          {state === "deleting" ? "Deleting…" : "Delete my account"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-muted underline">
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
    </div>
  );
}

/** Apple's logo, as its sign-in button has to show it (Apple's own rules for the button). */
function AppleLogo() {
  return (
    <svg viewBox="0 0 170 170" aria-hidden className="h-[1.1em] w-[1.1em] fill-current">
      <path d="M150.4 130.3c-2.7 6.3-6 12.1-9.7 17.4-5.1 7.3-9.3 12.3-12.6 15.1-5 4.6-10.4 7-16.2 7.1-4.2 0-9.2-1.2-15-3.6-5.9-2.4-11.2-3.6-16.1-3.6-5.1 0-10.6 1.2-16.5 3.6-5.9 2.4-10.7 3.7-14.3 3.8-5.5.2-11.1-2.2-16.6-7.3-3.6-3.1-8-8.3-13.4-15.8-5.7-8-10.4-17.3-14.1-27.9C1.9 108.1 0 97 0 86.3c0-12.3 2.7-22.9 8-31.8 4.2-7.2 9.8-12.8 16.7-17 7-4.1 14.5-6.3 22.6-6.4 4.4 0 10.3 1.4 17.5 4.1 7.2 2.7 11.8 4.1 13.8 4.1 1.5 0 6.6-1.6 15.3-4.8 8.2-3 15.1-4.2 20.8-3.7 15.4 1.2 26.9 7.3 34.6 18.2-13.7 8.3-20.5 20-20.4 35 .1 11.7 4.4 21.4 12.8 29.1 3.8 3.6 8.1 6.4 12.8 8.4-1 3-2.1 5.8-3.2 8.6zM119 3.4c0 9.2-3.4 17.8-10 25.7-8 9.4-17.8 14.8-28.3 14-.1-1.1-.2-2.3-.2-3.5 0-8.8 3.8-18.2 10.6-25.9 3.4-3.9 7.7-7.1 12.9-9.7 5.2-2.5 10.1-3.9 14.7-4.2.2 1.2.3 2.4.3 3.6z" />
    </svg>
  );
}

/** Whether Sign in with Apple's set up (in Supabase, see docs/app-store.md): until it is, its button's left out. */
const APPLE_SIGN_IN = process.env.NEXT_PUBLIC_APPLE_SIGN_IN === "1";

const PROVIDERS: { id: OAuthProvider; label: string; className: string; logo?: () => React.ReactElement }[] = [
  // In Apple's own look: black (white in the dark), its logo first.
  ...(APPLE_SIGN_IN
    ? [{ id: "apple" as const, label: "Sign in with Apple", className: "flex items-center gap-2 bg-ink-primary px-4 py-2 text-sm font-semibold text-page", logo: AppleLogo }]
    : []),
  { id: "google", label: "Sign in with Google", className: "border border-border bg-page px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-border/20" },
];

function SignedOutView() {
  // In the app, Google's offered only beside Apple (the App Store's rule): without Apple set up, email alone.
  const native = useIsNativeApp();
  const providers = native && !APPLE_SIGN_IN ? [] : PROVIDERS;
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    setSignedUp(false);
    if (mode === "signUp") {
      const { error, needsEmailConfirmation } = await signUpWithEmail(email, password);
      setIsPending(false);
      if (error) {
        setError(error);
        return;
      }
      // If confirmation isn't required, signUp already started a session —
      // useSession picks it up on its own and this component unmounts in
      // favor of SignedInView, so there's nothing else to do here.
      if (needsEmailConfirmation) setSignedUp(true);
      return;
    }
    const { error } = await signInWithEmail(email, password);
    setIsPending(false);
    if (error) setError(error);
  }

  return (
    <div className="flex flex-col gap-4">
      {providers.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={async () => {
                  const { error } = await signInWithProvider(p.id);
                  if (error) setError(error);
                }}
                className={p.className}
              >
                {p.logo ? <p.logo /> : null}
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 basis-full flex-col gap-1 sm:basis-auto sm:flex-1">
          <span className="text-sm font-medium text-ink-secondary">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full min-w-0 border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-ink-primary"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-ink-secondary">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full min-w-0 border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-ink-primary"
          />
        </label>
        <IconButton
          icon={<UploadIcon />}
          label={isPending ? "Working…" : mode === "signUp" ? "Sign up" : "Sign in"}
          type="submit"
          disabled={isPending}
          variant="primary"
        />
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signUp" ? "signIn" : "signUp");
          setError(null);
          setSignedUp(false);
        }}
        className="self-start text-xs font-medium text-ink-secondary underline decoration-dotted hover:text-ink-primary"
      >
        {mode === "signUp" ? "Sign in" : "Create account"}
      </button>

      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
      {signedUp ? (
        <p className="text-xs text-status-good">
          Check your email to confirm, then sign in.
        </p>
      ) : null}
    </div>
  );
}
