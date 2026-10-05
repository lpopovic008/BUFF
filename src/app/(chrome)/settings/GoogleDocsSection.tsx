"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, ExternalLinkIcon } from "@/components/ui/Icon";
import { AppConfig, saveConfig } from "@/lib/localStore";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { DOCS_SCOPE } from "@/lib/google-docs";
import { resolveGoogleClientId } from "@/lib/google-config";

/**
 * Lets the recap editor's "Save to Doc" button work without anyone touching
 * the repo's GitHub Actions variables: paste a Google OAuth Client ID here,
 * saved to this browser's config, then "Connect" runs the same sign-in flow
 * Save to Doc uses — Google's own account picker/consent popup — to confirm
 * it's wired up correctly before leaving Settings.
 */
export function GoogleDocsSection({ config, onChange }: { config: AppConfig; onChange: () => void }) {
  const [draftClientId, setDraftClientId] = useState(config.googleClientId ?? "");
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const savedClientId = config.googleClientId?.trim() || "";
  const isDirty = draftClientId.trim() !== savedClientId;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveConfig({ ...config, googleClientId: draftClientId.trim() || null });
    setStatus("idle");
    setError(null);
    onChange();
  }

  async function handleConnect() {
    const clientId = resolveGoogleClientId(draftClientId);
    if (!clientId) {
      setStatus("error");
      setError("Paste a Client ID first.");
      return;
    }
    setStatus("connecting");
    setError(null);
    try {
      await getGoogleAccessToken(clientId, DOCS_SCOPE);
      setStatus("connected");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Sign-in was cancelled or failed.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSave} className="flex items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-ink-secondary">OAuth Client ID</span>
          <input
            value={draftClientId}
            onChange={(e) => {
              setDraftClientId(e.target.value);
              setStatus("idle");
            }}
            placeholder="1234567890-abc123.apps.googleusercontent.com"
            className="w-full min-w-0 border border-border bg-page px-3 py-2 font-mono text-sm text-ink-primary outline-none focus:border-series-1"
          />
        </label>
        <div className="flex gap-2">
          <IconButton icon={<CheckIcon />} label="Save" type="submit" variant="primary" disabled={!isDirty} />
          <IconButton
            icon={<CheckIcon />}
            label={
              status === "connecting" ? "Connecting…" : status === "connected" ? "Connected" : "Connect"
            }
            onClick={handleConnect}
            disabled={status === "connecting" || !draftClientId.trim()}
          />
        </div>
      </form>

      {error ? <p className="text-xs text-status-critical">{error}</p> : null}

      <a
        href="https://console.cloud.google.com/apis/credentials"
        target="_blank"
        rel="noreferrer"
        className="flex w-fit items-center gap-1 text-xs text-ink-muted underline decoration-dotted hover:text-ink-secondary"
      >
        <ExternalLinkIcon className="h-3 w-3" />
        Get a Client ID
      </a>
    </div>
  );
}
