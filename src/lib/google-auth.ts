"use client";

// Minimal wrapper around Google Identity Services' token client — enough to
// get a short-lived OAuth access token for the Docs API from the browser,
// with no server and no client secret (this is a static site). The consent
// popup only appears when there's no valid cached token.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
          }): { requestAccessToken: () => void };
        };
      };
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let gisReady: Promise<void> | null = null;

/**
 * Fetches and initializes the Google Identity Services script ahead of any
 * click, if it isn't already loading — call this as early as possible (see
 * AutoSync.tsx) so that by the time someone clicks Connect Google Sync or
 * Save to Doc, getGoogleAccessToken below only has to call
 * requestAccessToken() with no network round-trip first. Some browsers
 * (mobile Safari and Chrome-on-iOS in particular, both WebKit) treat a
 * sign-in popup opened after an intervening await as no longer "from a user
 * gesture" and silently swallow it — the click appears to do nothing at
 * all, with no error, because the popup that would have shown the actual
 * consent screen never opens.
 */
export function preloadGoogleIdentityServices(): Promise<void> {
  return loadGoogleIdentityServices();
}

function loadGoogleIdentityServices(): Promise<void> {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return gisReady;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// Keyed by scope (Docs and Drive are requested independently) — a single
// cached slot would wrongly hand back a Docs-scope token for a Drive
// request, or vice versa, since GIS issues a distinct token per scope.
const cachedTokens = new Map<string, CachedToken>();

/**
 * Resolves to a valid OAuth access token for `scope`, reusing a cached one
 * if it's not about to expire. Otherwise triggers Google's account-picker/
 * consent popup — must be called from a user gesture (e.g. a click handler)
 * or the browser may block the popup.
 */
export async function getGoogleAccessToken(clientId: string, scope: string): Promise<string> {
  const cached = cachedTokens.get(scope);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }
  await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Google sign-in was cancelled or failed."));
          return;
        }
        cachedTokens.set(scope, {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        });
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });
}
