"use client";

import { useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { SUGGESTION_MAX, supportLinks } from "@/lib/support";

const noChange = () => () => {};

/**
 * A suggestion for the app, sent to its developer (saved where only they can read it, see supabase/schema.sql) — and,
 * for anyone who'd like to, a tip for them, straight to their own account (see support.ts). Tips aren't offered in the
 * iPhone app, where the App Store doesn't allow paying the developer outside it.
 */
export function SupportSection() {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const native = useSyncExternalStore(noChange, () => Capacitor.isNativePlatform(), () => false);
  const links = native ? [] : supportLinks();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || state === "sending") return;
    setState("sending");
    const { error } = await supabase.from("suggestions").insert({ body: body.slice(0, SUGGESTION_MAX) });
    if (error) return setState("failed");
    setText("");
    setState("sent");
  }

  return (
    <div className="flex flex-col gap-4">
      {supabaseConfigured ? (
        <form onSubmit={send} className="flex flex-col gap-2">
          <label htmlFor="suggestion" className="text-sm text-ink-secondary">
            What would make the app better?
          </label>
          <textarea
            id="suggestion"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (state !== "sending") setState("idle");
            }}
            maxLength={SUGGESTION_MAX}
            rows={4}
            placeholder="An idea, something that bugs you, a feature you'd use…"
            className="w-full resize-y border border-border bg-page px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted"
          />
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs ${state === "failed" ? "text-status-critical" : "text-ink-muted"}`} aria-live="polite">
              {state === "sent" ? "Sent. Thank you!" : state === "failed" ? "Couldn't send it. Try again in a bit." : ""}
            </span>
            <button
              type="submit"
              disabled={!text.trim() || state === "sending"}
              className="border border-[var(--map-tag)] bg-[var(--map-tag)] px-4 py-1.5 text-sm font-medium text-[var(--map-tag-ink)] transition-opacity disabled:opacity-40"
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      ) : null}

      {links.length > 0 ? (
        <div className={`flex flex-col gap-2 ${supabaseConfigured ? "border-t border-grid pt-4" : ""}`}>
          <span className="text-sm text-ink-secondary">Like the app? Tips go straight to its developer.</span>
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border px-4 py-1.5 text-sm font-medium text-ink-primary transition-colors hover:bg-page"
                >
                  {link.label}
                </a>
                <span className="text-xs text-ink-muted">{link.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
