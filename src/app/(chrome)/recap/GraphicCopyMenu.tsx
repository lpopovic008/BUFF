"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, ImageIcon } from "@/components/ui/Icon";

type GraphicStatus = "idle" | "copying" | "copied" | "error";
type SplitStatus = "idle" | "generating" | "copied" | "needs-parts" | "error";

interface GraphicCopyMenuProps {
  graphicStatus: GraphicStatus;
  graphicError: string | null;
  splitStatus: SplitStatus;
  splitError: string | null;
  /** How many parts the last split render actually produced — usually 3, fewer when the write-up doesn't have enough sections to cut that many times. */
  splitPartCount: number;
  /** Which of those parts the commish has already clicked "Copy" on, in the needs-parts fallback (see useRecapActions). */
  partCopied: boolean[];
  onCopyFull: () => void;
  onCopySplit: () => void;
  onCopySplitPart: (index: number) => void;
}

/**
 * "Copy graphic" now opens a small menu instead of copying straight away —
 * a single tall PNG is exactly what makes iMessage (and most chat apps)
 * collapse it behind a "tap to view" instead of showing it inline, so
 * there's a second option here that cuts the same picture into 3 shorter
 * images instead (see recap-graphic.ts's drawRecapGraphicParts). That split
 * tries to copy all 3 images to the clipboard in one shot first; browsers
 * that don't support a multi-item clipboard write fall back into
 * "needs-parts" here, which swaps the two top-level choices for one "Copy"
 * button per image so the commish can paste them into the chat one at a
 * time instead of the split failing outright.
 */
export function GraphicCopyMenu({
  graphicStatus,
  graphicError,
  splitStatus,
  splitError,
  splitPartCount,
  partCopied,
  onCopyFull,
  onCopySplit,
  onCopySplitPart,
}: GraphicCopyMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // A one-shot copy (the whole graphic, or all 3 split images at once)
  // closes the menu right away — there's nothing left to do here. The
  // needs-parts fallback keeps it open, since walking through 3 separate
  // copy-and-paste steps is the whole point of that state. Done during
  // render (comparing against the previous statuses, tracked in state —
  // never a ref, which isn't safe to read/write during render), not an
  // effect — React's own "adjust state when a prop changes" pattern, so it
  // can't cause the extra cascading render an effect would.
  const [prevGraphicStatus, setPrevGraphicStatus] = useState(graphicStatus);
  const [prevSplitStatus, setPrevSplitStatus] = useState(splitStatus);
  if (graphicStatus !== prevGraphicStatus) {
    setPrevGraphicStatus(graphicStatus);
    if (graphicStatus === "copied" && open) setOpen(false);
  }
  if (splitStatus !== prevSplitStatus) {
    setPrevSplitStatus(splitStatus);
    if (splitStatus === "copied" && open) setOpen(false);
  }

  const busy = graphicStatus === "copying" || splitStatus === "generating";
  const triggerCopied = graphicStatus === "copied" || splitStatus === "copied";
  const triggerLabel =
    graphicStatus === "copying"
      ? "Rendering graphic…"
      : splitStatus === "generating"
        ? "Rendering split graphic…"
        : triggerCopied
          ? "Copied graphic"
          : "Copy graphic";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={triggerLabel}
        title={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 shrink-0 items-center justify-center gap-1 border border-border px-2 text-ink-secondary transition-all duration-150 hover:bg-page hover:text-ink-primary disabled:opacity-30 disabled:hover:bg-transparent active:scale-90"
      >
        {triggerCopied ? <CheckIcon className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
      </button>
      {/* A sliver of the graphic's own neon theme along the bottom edge — ties this button to what it produces. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-[#ff2e9a] via-[#22d3ee] to-[#39ff8e]"
      />

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-64 border border-border bg-surface-raised shadow-lg">
          {splitStatus !== "needs-parts" ? (
            <div className="flex flex-col p-1">
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={onCopyFull}
                className="flex items-center justify-between px-3 py-2 text-left text-sm text-ink-primary transition-colors hover:bg-page disabled:opacity-30"
              >
                <span>Full graphic</span>
                {graphicStatus === "copying" ? <span className="text-xs text-ink-muted">Rendering…</span> : null}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={onCopySplit}
                className="flex items-center justify-between px-3 py-2 text-left text-sm text-ink-primary transition-colors hover:bg-page disabled:opacity-30"
              >
                <span>Split into 3 images</span>
                {splitStatus === "generating" ? <span className="text-xs text-ink-muted">Rendering…</span> : null}
              </button>
              <p className="px-3 pb-1.5 pt-0.5 text-[11px] text-ink-muted">
                Splits a tall graphic into shorter images so apps like iMessage show them in full, instead of collapsing one long
                image behind &ldquo;tap to view.&rdquo;
              </p>
            </div>
          ) : (
            <div className="flex flex-col p-1">
              <p className="px-3 pb-1 pt-2 text-[11px] text-ink-muted">
                This browser can only copy one image at a time — copy each below, pasting it into the chat before copying the
                next.
              </p>
              {Array.from({ length: splitPartCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  onClick={() => onCopySplitPart(i)}
                  className="flex items-center justify-between px-3 py-2 text-left text-sm text-ink-primary transition-colors hover:bg-page"
                >
                  <span>
                    Image {i + 1} of {splitPartCount}
                  </span>
                  {partCopied[i] ? <CheckIcon className="h-4 w-4 text-status-good" /> : null}
                </button>
              ))}
            </div>
          )}
          {graphicStatus === "error" && graphicError ? (
            <p className="border-t border-border px-3 py-2 text-xs text-status-critical">{graphicError}</p>
          ) : null}
          {splitStatus === "error" && splitError ? (
            <p className="border-t border-border px-3 py-2 text-xs text-status-critical">{splitError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
