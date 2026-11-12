"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { FloorGrid } from "@/components/FloorGrid";
import { FloorReflection } from "@/components/FloorReflection";
import { ScrollThumb } from "@/components/ScrollThumb";
import { useListScroll } from "@/hooks/useListScroll";

// A room whose columns stand on its back wall, as the League Room's do (see .grid-room): its horizon low, the back
// wall most of the screen — the floor in front of it a strip for what stands on it to be reflected in.
const WALL_SHARE = 0.8;
// From laptop width up, three columns stand in the room; narrower, one.
const WIDE = "(min-width: 1280px)";
const onWideChange = (listener: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
// Where the columns' first rows sit: under the header, and a gap; and how far above the horizon they end.
const UNDER_HEADER = "var(--header-h, 0px) + 0.625rem";
const OVER_HORIZON = "0.5rem";

/** Whether the room is wide enough for three columns (from laptop width up). */
export function useWideRoom(): boolean {
  return useSyncExternalStore(onWideChange, () => window.matchMedia(WIDE).matches, () => false);
}

/** A column standing in the room: on the back wall down to just over the horizon, scrolling on its own, reflected in the floor. */
export function RoomColumn({
  label,
  className = "",
  style,
  children,
}: {
  label: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [list, setList] = useState<HTMLDivElement | null>(null);
  // Scrolled as an iPhone scrolls, by the page, so its reflection moves with it exactly (see useListScroll).
  useListScroll(list);
  const pad = { paddingTop: `calc(${UNDER_HEADER})` };
  return (
    <section aria-label={label} className={`relative min-w-0 ${className}`} style={style}>
      <div
        ref={setList}
        data-scroll-list
        className="absolute inset-0 touch-none overflow-y-auto overscroll-none pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={pad}
      >
        <div>{children}</div>
      </div>
      <ScrollThumb source={list} />
      {/* What's at its foot, in the floor. */}
      <FloorReflection source={list} className="pb-2" style={pad} />
    </section>
  );
}

/**
 * A page as a room: the page itself never scrolls; its columns (`children`, RoomColumns) stand side by side on the
 * back wall, each scrolling on its own and reflected in the floor in front of them.
 */
export function WallRoom({ title, children }: { title: string; children: React.ReactNode }) {
  // The room fits the screen: the page itself never scrolls (only its columns do).
  useEffect(() => {
    const [html, body] = [document.documentElement.style, document.body.style];
    const was = [html.overflow, html.overscrollBehavior, body.overflow, body.overscrollBehavior];
    html.overflow = body.overflow = "hidden";
    html.overscrollBehavior = body.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    return () => {
      [html.overflow, html.overscrollBehavior, body.overflow, body.overscrollBehavior] = was;
    };
  }, []);
  // The room's height as it's drawn (not 100vh, which a browser's toolbars can make taller than the screen).
  const [room, setRoom] = useState<HTMLDivElement | null>(null);
  const [roomHeight, setRoomHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!room) return;
    const measure = () => setRoomHeight(room.clientHeight || window.innerHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, [room]);

  // Every column down to just over the horizon.
  const columnHeight = { height: `calc(var(--room-h, 100vh) * ${WALL_SHARE} - ${OVER_HORIZON})` };
  return (
    <div style={roomHeight ? { ["--room-h" as string]: `${roomHeight}px` } : undefined}>
      <h1 className="sr-only">{title}</h1>
      <div ref={setRoom} aria-hidden className="grid-room" style={{ ["--horizon" as string]: `${WALL_SHARE * 100}%` }}>
        <FloorGrid share={WALL_SHARE} />
      </div>
      <div className="fixed inset-x-0 top-0 flex gap-4 px-4" style={columnHeight}>
        {children}
      </div>
    </div>
  );
}
