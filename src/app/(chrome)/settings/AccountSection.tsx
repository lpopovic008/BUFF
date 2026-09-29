"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, UploadIcon } from "@/components/ui/Icon";
import { useSession, signUpWithEmail, signInWithEmail, signInWithGoogle, signOut } from "@/lib/auth";
import { reconcile, SyncAction } from "@/lib/supabase-sync";
import { getSyncState } from "@/lib/localStore";
import { supabaseConfigured } from "@/lib/supabase";

const ACTION_MESSAGE: Record<SyncAction, string> = {
  pull: "Pulled the newer copy from your account into this browser.",
  push: "Pushed this browser's data to your account.",
  noop: "Already up to date.",
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
      <p className="text-sm text-ink-secondary">
        Signed in as <span className="font-medium text-ink-primary">{email}</span>.
      </p>
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
          <span className="text-xs text-ink-muted">Last synced {new Date(lastSyncedAt).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-ink-muted">Never synced</span>
        )}
      </div>
      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
      {status === "synced" && result ? <p className="text-xs text-status-good">{ACTION_MESSAGE[result]}</p> : null}
    </div>
  );
}

function SignedOutView() {
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
      <p className="text-sm text-ink-secondary">
        Sign in to sync tracked leagues, settings, the recap archive, and bowl picks across every device
        signed into the same account. Without an account, everything still works exactly as it does now —
        saved only in this browser.
      </p>

      <button
        type="button"
        onClick={() => signInWithGoogle()}
        className="self-start border border-border bg-page px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-border/20"
      >
        Sign in with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <div className="h-px flex-1 bg-border" />
        or with email
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-ink-secondary">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-ink-secondary">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="border border-border bg-page px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
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
        className="self-start text-xs font-medium text-series-1 underline decoration-dotted hover:text-series-1/80"
      >
        {mode === "signUp" ? "Already have an account? Sign in instead" : "New here? Create an account instead"}
      </button>

      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
      {signedUp ? (
        <p className="text-xs text-status-good">
          Check your email to confirm the account, then sign in.
        </p>
      ) : null}
    </div>
  );
}
