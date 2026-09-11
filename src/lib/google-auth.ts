"use client";

// Minimal wrapper around Google Identity Services' token client — enough to
// get a short-lived OAuth access token for the Docs/Drive APIs from the
// browser, with no server and no client secret (this is a static site). The
// consent popup only appears when there's no valid cached token.
//
// A standalone/home-screen web app (added to the iOS home screen) can't
// complete that popup flow at all — window.open()-based sign-in would have
// to break out into full Safari, which Apple doesn't allow from a
// standalone context, so the popup silently does nothing. beginRedirectSignIn
// below is the fallback for that one case: a full top-level navigation to
// Google's own sign-in page and back, which iOS keeps inside the standalone
// window since it's not a popup. See src/app/auth-callback/page.tsx for the
// other half of that flow.

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
// Backed by sessionStorage too (see read/writeSessionToken), not just this
// in-memory Map — a redirect sign-in does a full page reload, which wipes
// the Map, so the token the callback page just obtained needs somewhere
// that survives the navigation to land.
const cachedTokens = new Map<string, CachedToken>();

const SESSION_TOKEN_PREFIX = "buff:oauth-token:";

function readSessionToken(scope: string): CachedToken | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_TOKEN_PREFIX + scope);
    return raw ? (JSON.parse(raw) as CachedToken) : null;
  } catch {
    return null;
  }
}

function writeSessionToken(scope: string, token: CachedToken): void {
  try {
    window.sessionStorage.setItem(SESSION_TOKEN_PREFIX + scope, JSON.stringify(token));
  } catch {
    // sessionStorage unavailable (private mode, full quota) — falls back to
    // the in-memory cache only, same as before this existed.
  }
}

/**
 * Whether this page is running as an installed/home-screen web app rather
 * than a normal browser tab. iOS Safari sets `navigator.standalone`; the
 * `display-mode` media feature is the standards-track equivalent other
 * platforms (and newer iOS versions) also honor.
 */
function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

/** Exact redirect target Google sends the browser back to — must be added verbatim to the OAuth client's Authorized redirect URIs in Google Cloud Console. */
function redirectUri(): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${basePath}/auth-callback`;
}

/**
 * Sends the browser to Google's own sign-in page instead of opening a
 * popup. Encodes which scope was requested and where to return afterward
 * directly into the OAuth `state` param — Google echoes it back verbatim on
 * the way back, so the callback page doesn't depend on anything surviving
 * the round trip to accounts.google.com besides the URL itself. Never
 * returns: the current page is navigating away.
 */
function beginRedirectSignIn(clientId: string, scope: string): never {
  const returnTo = window.location.pathname + window.location.search;
  const state = JSON.stringify({ scope, returnTo });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "token",
    scope,
    include_granted_scopes: "true",
    state,
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  throw new Error("Redirecting to Google sign-in…");
}

/**
 * Resolves to a valid OAuth access token for `scope`, reusing a cached one
 * (in-memory, or from sessionStorage if a redirect sign-in stored it there)
 * if it's not about to expire. Otherwise triggers sign-in — a popup in a
 * normal browser tab (must be called from a user gesture, e.g. a click
 * handler, or the browser may block it), or a full-page redirect in
 * standalone/home-screen mode, where a popup can't complete at all. The
 * redirect case never returns; the page navigates away instead.
 */
export async function getGoogleAccessToken(clientId: string, scope: string): Promise<string> {
  const cached = cachedTokens.get(scope) ?? readSessionToken(scope);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    cachedTokens.set(scope, cached);
    return cached.accessToken;
  }

  if (isStandaloneDisplay()) {
    beginRedirectSignIn(clientId, scope);
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
        const token: CachedToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        };
        cachedTokens.set(scope, token);
        writeSessionToken(scope, token);
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });
}

// Set by the auth-callback page right before it sends the browser back, and
// read once by GoogleSyncSection.tsx — lets Settings auto-finish the sync
// that a redirect sign-in interrupted, instead of making the commish tap
// "Sync now" a second time right after signing in.
export const JUST_SIGNED_IN_SCOPE_KEY = "buff:just-signed-in-scope";

export type RedirectSignInResult = { ok: true; scope: string; returnTo: string } | { ok: false; error: string };

/**
 * Called once, from the auth-callback page: parses the access token Google
 * appended to the URL fragment after a redirect sign-in (see
 * beginRedirectSignIn above), caches it the same way a popup-obtained token
 * would be, and reports where to send the browser back to. Null when this
 * wasn't actually reached via a sign-in redirect (e.g. the callback page
 * was opened directly, with no fragment at all).
 */
export function consumeRedirectSignIn(): RedirectSignInResult | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);

  const oauthError = params.get("error");
  if (oauthError) return { ok: false, error: oauthError };

  const accessToken = params.get("access_token");
  const stateRaw = params.get("state");
  if (!accessToken || !stateRaw) return null;

  let state: { scope?: string; returnTo?: string };
  try {
    state = JSON.parse(stateRaw) as { scope?: string; returnTo?: string };
  } catch {
    return { ok: false, error: "Couldn't read the sign-in response." };
  }
  if (!state.scope || !state.returnTo) return { ok: false, error: "Couldn't read the sign-in response." };

  const expiresIn = Number(params.get("expires_in")) || 3600;
  const token: CachedToken = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  cachedTokens.set(state.scope, token);
  writeSessionToken(state.scope, token);
  return { ok: true, scope: state.scope, returnTo: state.returnTo };
}
