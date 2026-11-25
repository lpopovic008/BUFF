"use client";

import { useIsNativeApp } from "@/lib/native";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, CopyIcon, UploadIcon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { CloseButton } from "@/components/LeagueRoomFloor";
import { recapDisplayFont } from "@/lib/fonts";
import { GraphicCopyMenu } from "@/app/(chrome)/recap/GraphicCopyMenu";
import { recapWeekFor } from "@/lib/sleeper";
import { ScrollThumb } from "@/components/ScrollThumb";
import { useListScroll } from "@/hooks/useListScroll";
import { useRecapWriteup } from "@/app/(chrome)/recap/useRecapWriteup";
import { RecapEditor } from "@/app/(chrome)/recap/RecapEditor";
import { RecapContents } from "@/app/(chrome)/recap/RecapContents";
import { FloorFolder, FloorFolders } from "@/components/FloorFolders";

/** The weeks there's a write-up for to pick from (the preseason's, 0, and the NFL's 18 — more if the league runs on). */
const RECAP_WEEKS = 18;

/** How long the panel takes to come up out of the floor, or go back down into it (ms). */
const RISE_MS = 450;
/** How far its header's dragged before it's a drag, not a tap (px); and how fast and far a drag down puts it away. */
const DRAG_START_PX = 6;
const FLING_PX_PER_MS = 0.8;
const FLING_WINDOW_MS = 100;
const FLING_MIN_PX = 24;

interface PanelProps {
  open: boolean;
  leagueId: string;
  /** The NFL's week now (see recapWeekFor): which write-up's open at first. */
  currentWeek: number | null;
  /** Where its top stands (screen y): under the matchups — and its bottom. */
  top: number;
  bottom: number;
  /** Across the screen: its left edge and width (px) — else `className` places it. */
  left?: number;
  width?: number;
  className?: string;
  /** Puts it away: flung down by its header, or (`back`, from laptop width up) its own back button. */
  onClose: () => void;
  back?: boolean;
  /** Where the write-up's contents go (from laptop width up, the right-hand column): none, no contents. */
  contentsSlot?: HTMLElement | null;
  /**
   * On a phone: one section at a time, picked from tabs standing on the room's floor (see FloorFolders) — the room it's in,
   * its horizon `share` of the way down and the floor's front at `bottom`. The panel goes down to `bottom` above.
   */
  folders?: { width: number; height: number; share: number; bottom: number };
  /**
   * On a phone (`folders`), told as its header's dragged up from `top` toward the page's header: how far (px, up
   * negative), that share of the way, and whether it's being dragged now — for what's over it to go up with it.
   */
  onLift?: (lift: { by: number; share: number; moving: boolean }) => void;
}

/**
 * The League Room's write-ups: the league's write-up for the week (as the Write-ups page edits it, auto-saved) in a
 * panel up out of the floor (on a phone to just under the week's matchups, from laptop width up the whole middle
 * column), see-through as the home page's Red Zone is — its sections one over another, every one the same size,
 * scrolling within it, a section to add at the bottom. Dragged up or down by its header (flung down, put away). From
 * laptop width up, the write-up's contents go in `contentsSlot`. On a phone (`folders`), it shows a section at a
 * time, each picked from a row of tabs standing on the floor, and its header snaps between under the matchups and
 * under the page's header (the matchups going up with it). Sinks back down when it's closed, then leaves.
 */
export function WriteupsPanel(props: PanelProps) {
  const { open } = props;
  // Up (or on its way), and drawn at all: kept drawn while it sinks.
  const [up, setUp] = useState(false);
  const [drawn, setDrawn] = useState(open);
  useEffect(() => {
    if (open) {
      const show = requestAnimationFrame(() => {
        setDrawn(true);
        requestAnimationFrame(() => setUp(true));
      });
      return () => cancelAnimationFrame(show);
    }
    const sink = requestAnimationFrame(() => setUp(false));
    const gone = window.setTimeout(() => setDrawn(false), RISE_MS);
    return () => {
      cancelAnimationFrame(sink);
      window.clearTimeout(gone);
    };
  }, [open]);
  if (!drawn && !open) return null;
  return <PanelBody {...props} up={up} />;
}

function PanelBody({ leagueId, currentWeek, top, bottom, left, width, className = "", onClose, back, contentsSlot, folders, onLift, up }: PanelProps & { up: boolean }) {
  // The week written up — its own, picked in the header, apart from the week the room's showing. At first, last
  // week's until Thursday, then this week's (see recapWeekFor).
  const [picked, setPicked] = useState<number | null>(null);
  const [today] = useState(() => new Date().getDay());
  const week = picked ?? (currentWeek === null ? null : recapWeekFor(currentWeek, today));
  const { ready, error, actions, editorProps, contentsProps, money, googleClientId } = useRecapWriteup(leagueId, week);
  // The write-up's to be saved to a Google Doc (one's set up for it, and Google Docs connected), not copied as text.
  // (Google's sign-in for Docs only works in a web browser: in the app, the plain text's copied instead.)
  const native = useIsNativeApp();
  const toDoc = !!money?.profile.writeupDocId && !!googleClientId && !native;
  const exportError =
    actions.graphicStatus === "error" && actions.graphicError
      ? `Copy graphic failed: ${actions.graphicError}`
      : actions.docStatus === "error" && actions.docError
        ? `Google Doc save failed: ${actions.docError}`
        : null;
  const [list, setList] = useState<HTMLDivElement | null>(null);
  // Scrolled as an iPhone scrolls (see useListScroll).
  useListScroll(list);

  // On a phone, its parts as tabs on the floor — the title, each section (not the upcoming week's heading, which
  // isn't one), and a section to add — the one picked shown, from its top.
  const folderList: FloorFolder[] = contentsProps
    ? [
        ...contentsProps.entries.filter((e) => e.key !== "upcoming").map((e) => ({ key: e.key, label: e.label, emoji: e.emoji })),
        ...(contentsProps.toAdd.length > 0 ? [{ key: "add", label: "Add a section", emoji: "+" }] : []),
      ]
    : [];
  const [pickedFolder, setPickedFolder] = useState(0);
  const shownFolder = Math.min(pickedFolder, Math.max(0, folderList.length - 1));
  useEffect(() => {
    list?.scrollTo({ top: 0 });
  }, [shownFolder, list]);

  // Its header dragged: its top where it's dragged to — as high as under the page's header, as low as leaves its own.
  const [dragTop, setDragTop] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const head = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const limits = useRef({ top, bottom, onClose });
  useEffect(() => {
    limits.current = { top, bottom, onClose };
  });
  // On a phone, its header's dragged only between where it starts, under the matchups, and the page's header — and
  // let go, it settles at whichever's nearer: the matchups in sight, or not.
  const snaps = !!folders;
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    let drag: { id: number; y0: number; top0: number; moved: boolean; trail: [number, number][] } | null = null;
    const highest = () => {
      const css = getComputedStyle(document.documentElement);
      return (parseFloat(css.getPropertyValue("--header-h")) || 0) + 0.5 * (parseFloat(css.fontSize) || 16);
    };
    const down = (e: PointerEvent) => {
      if (e.button > 0 || (e.target as Element).closest("button, select, label")) return;
      drag = { id: e.pointerId, y0: e.clientY, top0: box.current?.getBoundingClientRect().top ?? 0, moved: false, trail: [[e.timeStamp, e.clientY]] };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) < DRAG_START_PX) return;
      if (!drag.moved) {
        drag.moved = true;
        setDragging(true);
      }
      drag.trail = [...drag.trail.filter(([t]) => e.timeStamp - t < FLING_WINDOW_MS), [e.timeStamp, e.clientY]];
      const lowest = snaps ? limits.current.top : limits.current.bottom - el.offsetHeight - 8;
      setDragTop(Math.min(lowest, Math.max(highest(), drag.top0 + dy)));
    };
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const done = drag;
      drag = null;
      if (!done.moved) return;
      setDragging(false);
      if (snaps) {
        const at = Math.min(limits.current.top, Math.max(highest(), done.top0 + e.clientY - done.y0));
        setDragTop(at - highest() < limits.current.top - at ? highest() : null);
        return;
      }
      // Flung down: put away.
      const [t0, y0] = done.trail[0];
      const speed = (e.clientY - y0) / Math.max(1, e.timeStamp - t0);
      if (e.type === "pointerup" && speed > FLING_PX_PER_MS && e.clientY - done.y0 > FLING_MIN_PX) limits.current.onClose();
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [snaps]);

  const shownTop = dragTop ?? top;
  // How far it's up from where it starts, for what's over it to go up with it — back down when it goes.
  useEffect(() => {
    if (!onLift) return;
    const css = getComputedStyle(document.documentElement);
    const highest = (parseFloat(css.getPropertyValue("--header-h")) || 0) + 0.5 * (parseFloat(css.fontSize) || 16);
    // (Going away, it's down again.)
    const by = up ? shownTop - top : 0;
    onLift({ by, share: top > highest ? Math.min(1, -by / (top - highest)) : 0, moving: dragging });
  }, [onLift, shownTop, top, dragging, up]);
  useEffect(() => (onLift ? () => onLift({ by: 0, share: 0, moving: false }) : undefined), [onLift]);
  return (
    <>
      <div
        ref={box}
        data-floor-ui
        className={`fixed z-[6] overflow-hidden ${dragging ? "" : "transition-[top,height] duration-300 ease-out"} ${className}`}
        style={{ top: shownTop, height: Math.max(0, bottom - shownTop), left, width }}
      >
        <section
          aria-label="Write-ups"
          className="flex h-full flex-col transition-transform ease-out"
          style={{ transform: up ? "translateY(0)" : "translateY(100%)", transitionDuration: `${RISE_MS}ms` }}
        >
          {/* Its header: what it is, whether it's saved — and grabbed, it moves the panel. */}
          <div ref={head} className={`flex shrink-0 touch-none select-none items-center gap-1 py-1.5 cursor-ns-resize`}>
            {back ? (
              <button type="button" onClick={onClose} aria-label="Back" title="Back" className="-ml-1 flex h-6 w-6 items-center justify-center text-ink-secondary transition-colors hover:text-ink-primary">
                <ChevronLeftIcon width={16} height={16} />
              </button>
            ) : null}
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-primary">Write-ups</h2>
            {/* Which week's write-up — its own, apart from the week shown above. */}
            {week !== null ? (
              <label className="relative ml-1 flex items-center">
                <span className="sr-only">Week written up</span>
                <select
                  value={week}
                  onChange={(e) => setPicked(Number(e.target.value))}
                  className="cursor-pointer appearance-none border border-ink-primary bg-transparent py-0.5 pl-1.5 pr-5 text-xs font-bold uppercase tracking-wide text-ink-primary outline-none"
                >
                  {Array.from({ length: Math.max(RECAP_WEEKS, week) + 1 }, (_, w) => (
                    <option key={w} value={w} className="bg-page text-ink-primary">
                      {w === 0 ? "Preseason" : `Week ${w}`}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon width={12} height={12} className="pointer-events-none absolute right-1 text-ink-primary" aria-hidden />
              </label>
            ) : null}
            <span className="ml-auto text-[0.625rem] text-ink-muted">
              {actions.lastSavedAt ? `Saved ${new Date(actions.lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ready ? "Not saved yet" : ""}
            </span>
            {/* Its exports, as on the Write-ups page: the graphic (whole, or cut into parts), and the write-up saved to
                its Google Doc — or, with none, copied as plain text. */}
            {ready && !error ? (
              <span className="ml-1 flex items-center gap-1">
                <GraphicCopyMenu
                  small
                  graphicStatus={actions.graphicStatus}
                  graphicError={actions.graphicError}
                  splitStatus={actions.splitStatus}
                  splitError={actions.splitError}
                  splitPartCount={actions.splitPartCount}
                  partCopied={actions.partCopied}
                  onCopyFull={actions.handleCopyGraphic}
                  onCopySplit={actions.handleCopySplitGraphic}
                  onCopySplitPart={actions.handleCopySplitPart}
                />
                {toDoc ? (
                  <IconButton
                    size="sm"
                    icon={actions.docStatus === "saved" ? <CheckIcon className="h-3.5 w-3.5" /> : <UploadIcon className="h-3.5 w-3.5" />}
                    label={actions.docStatus === "saving" ? "Saving to Doc…" : actions.docStatus === "saved" ? "Saved to Doc" : "Save to Doc"}
                    variant="primary"
                    onClick={actions.handleSaveToDoc}
                    disabled={actions.docStatus === "saving"}
                  />
                ) : (
                  <IconButton
                    size="sm"
                    icon={actions.copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                    label={actions.copied ? "Copied plain text" : "Copy plain text"}
                    onClick={actions.handleCopy}
                  />
                )}
              </span>
            ) : null}
            <span className="ml-1 flex">
              <CloseButton onClose={onClose} label="Close the write-ups" />
            </span>
          </div>
          {exportError ? <p className="shrink-0 pb-1 text-[0.625rem] text-status-critical">{exportError}</p> : null}
          {/* A live use of the graphic's display font, so it's loaded before the graphic's drawn with it (see
              recap-graphic.ts). */}
          <span aria-hidden className={`${recapDisplayFont.className} absolute h-0 w-0 overflow-hidden`}>
            .
          </span>
          <div className="relative min-h-0 flex-1">
            <div ref={setList} data-scroll-list className="h-full touch-none overflow-y-auto overscroll-none pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div>
                {error ? (
                  <p className="text-sm text-status-critical">{error}</p>
                ) : !ready ? (
                  <p className="text-sm text-ink-secondary">Loading the write-up…</p>
                ) : (
                  <RecapEditor
                    {...editorProps}
                    room
                    // (Each section's buttons are its row's in the contents beside it, where there is one.)
                    controls={!contentsSlot}
                    only={folders && folderList[shownFolder] ? folderList[shownFolder].key : undefined}
                  />
                )}
              </div>
            </div>
            <ScrollThumb source={list} />
          </div>
        </section>
      </div>
      {contentsSlot && contentsProps && ready ? createPortal(<RecapContents {...contentsProps} room scroller={list} />, contentsSlot) : null}
      {/* On a phone, its parts as tabs standing on the floor, the one shown jumped up. */}
      {folders && ready && !error && folderList.length > 0 ? (
        <div className={`transition-opacity ease-out ${up ? "opacity-100" : "pointer-events-none opacity-0"}`} style={{ transitionDuration: `${RISE_MS}ms` }}>
          <FloorFolders folders={folderList} picked={shownFolder} onPick={setPickedFolder} room={folders} label="Write-up sections" />
        </div>
      ) : null}
    </>
  );
}
