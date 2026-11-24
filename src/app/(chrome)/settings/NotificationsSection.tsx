"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth";
import { getPushState, PUSH_KINDS, PushPrefs, setPushPrefs, turnPushOff, turnPushOn } from "@/lib/push";

/**
 * Push notifications (in the app only, see lib/push): on or off for this device, and which kinds. They follow your
 * account's leagues, so they need you signed in.
 */
export function NotificationsSection() {
  const { session, loaded } = useSession();
  const [state, setState] = useState(getPushState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loaded) return <p className="text-sm text-ink-secondary">Loading…</p>;
  if (!session) return <p className="text-sm text-ink-secondary">Sign in under Account to get notifications about your leagues.</p>;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    if (state.on) await turnPushOff();
    else setError(await turnPushOn(state.prefs));
    setState(getPushState());
    setBusy(false);
  };
  const choose = async (prefs: PushPrefs) => {
    setState({ ...state, prefs });
    setError(await setPushPrefs(prefs));
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink-primary">Notifications on this device</span>
        <input type="checkbox" checked={state.on} disabled={busy} onChange={toggle} className="h-5 w-5 accent-[var(--map-tag)]" />
      </label>
      <ul className={`flex flex-col divide-y divide-grid border-t border-grid ${state.on ? "" : "opacity-50"}`}>
        {PUSH_KINDS.map(({ kind, label, note }) => (
          <li key={kind} className="py-2">
            <label className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm text-ink-primary">{label}</span>
                <span className="text-xs text-ink-muted">{note}</span>
              </span>
              <input
                type="checkbox"
                checked={state.prefs[kind]}
                disabled={!state.on}
                onChange={(e) => void choose({ ...state.prefs, [kind]: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--map-tag)]"
              />
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">For your Sleeper leagues, for now.</p>
      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
    </div>
  );
}
