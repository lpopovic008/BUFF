"use client";

import { useEffect, useState } from "react";
import { consumeRedirectSignIn, JUST_SIGNED_IN_SCOPE_KEY } from "@/lib/google-auth";

/**
 * Where Google sends the browser back to after a redirect-based sign-in
 * (see google-auth.ts's beginRedirectSignIn) — the fallback used in
 * standalone/home-screen mode, where a sign-in popup can't complete the
 * flow at all. Grabs the access token Google appended to the URL fragment,
 * caches it the same way a popup-obtained token would be, and immediately
 * sends the browser back to wherever sign-in was started from.
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const result = consumeRedirectSignIn();
      if (!result) {
        setError("This page is only reached after signing in with Google — go back and try again from Settings.");
        return;
      }
      if (!result.ok) {
        setError(`Google sign-in didn't complete: ${result.error}`);
        return;
      }
      try {
        window.sessionStorage.setItem(JUST_SIGNED_IN_SCOPE_KEY, result.scope);
      } catch {
        // Best-effort nicety — worst case the commish taps "Sync now" once more.
      }
      window.location.replace(result.returnTo || "/");
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-ink-secondary">
      {error ?? "Finishing sign-in…"}
    </div>
  );
}
