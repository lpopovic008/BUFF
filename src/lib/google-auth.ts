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

let cachedToken: CachedToken | null = null;

/**
 * Resolves to a valid OAuth access token for `scope`, reusing a cached one
 * if it's not about to expire. Otherwise triggers Google's account-picker/
 * consent popup — must be called from a user gesture (e.g. a click handler)
 * or the browser may block the popup.
 */
export async function getGoogleAccessToken(clientId: string, scope: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
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
        cachedToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        };
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });
}
