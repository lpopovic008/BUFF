"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FloorGrid } from "@/components/FloorGrid";
import { FloorReflection } from "@/components/FloorReflection";
import { ScrollThumb } from "@/components/ScrollThumb";
import { LineupNumbers, PlayerCareer } from "@/components/PlayerCareer";
import { useListScroll } from "@/hooks/useListScroll";
import { HORIZON_SHARE } from "@/lib/grid-room";
import { ResolvedPlayer } from "@/lib/players";

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
// How long the horizon takes to move (ms), and how far a player's card stands in from what's around it (px).
const LOOK_MS = 500;
const STAGE_GAP_PX = 8;

/** A player whose card is up in the room (see PlayerCareer), as the League Room's: out of its floor, on its wall. */
export interface RoomCard {
  player: ResolvedPlayer;
  numbers?: LineupNumbers;
  /** The season counted through. */
  season: number;
  scoring?: Record<string, number>;
}

// The column a player's card stands in front of (see RoomColumn's `stage`): told where it is, and whether a card's up.
const StageContext = createContext<{ up: boolean; place: (el: HTMLElement | null) => void } | null>(null);

/** Where the room's horizon is (its share of the room's height), eased there from where it was. */
function useEasedShare(target: number): number {
  const [shown, setShown] = useState(target);
  const last = useRef(target);
  useEffect(() => {
    last.current = shown;
  });
  useEffect(() => {
    const from = last.current;
    let start: number | null = null;
    let frame = requestAnimationFrame(function step(now) {
      if (Math.abs(from - target) < 1e-4) return setShown(target);
      start ??= now;
      const t = Math.min(1, (now - start) / LOOK_MS);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setShown(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

/** Whether the room is wide enough for three columns (from laptop width up). */
export function useWideRoom(): boolean {
  return useSyncExternalStore(onWideChange, () => window.matchMedia(WIDE).matches, () => false);
}

/**
 * A column standing in the room: on the back wall down to just over the horizon, scrolling on its own, reflected in the
 * floor. The one marked `stage` is where a player's card comes up (see WallRoom's `card`), stepping aside for it.
 */
export function RoomColumn({
  label,
  className = "",
  style,
  stage = false,
  children,
}: {
  label: string;
  className?: string;
  style?: React.CSSProperties;
  stage?: boolean;
  children: React.ReactNode;
}) {
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const stageOf = useContext(StageContext);
  const place = stage ? stageOf?.place : undefined;
  const away = stage && !!stageOf?.up;
  // Scrolled as an iPhone scrolls, by the page, so its reflection moves with it exactly (see useListScroll).
  useListScroll(list);
  const pad = { paddingTop: `calc(${UNDER_HEADER})` };
  return (
    <section
      ref={place}
      aria-label={label}
      inert={away}
      className={`relative min-w-0 transition-opacity duration-300 ${away ? "pointer-events-none opacity-0" : ""} ${className}`}
      style={style}
    >
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
 * back wall, each scrolling on its own and reflected in the floor in front of them. A player's `card` comes up as the
 * League Room's does: the horizon drops to make floor for it, and it stands where the column marked `stage` was.
 */
export function WallRoom({ title, card = null, onCloseCard, children }: { title: string; card?: RoomCard | null; onCloseCard?: () => void; children: React.ReactNode }) {
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
  // The room's size as it's drawn (not 100vh, which a browser's toolbars can make taller than the screen).
  const [room, setRoom] = useState<HTMLDivElement | null>(null);
  const [roomSize, setRoomSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!room) return;
    const measure = () => setRoomSize({ width: room.clientWidth || window.innerWidth, height: room.clientHeight || window.innerHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, [room]);
  // Where the column a card stands in front of is across the screen.
  const [stageColumn, setStageColumn] = useState<HTMLElement | null>(null);
  const [stageBox, setStageBox] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    if (!stageColumn) return;
    const measure = () => {
      const r = stageColumn.getBoundingClientRect();
      setStageBox((was) => (was && was.left === r.left && was.width === r.width ? was : { left: r.left, width: r.width }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stageColumn);
    return () => observer.disconnect();
  }, [stageColumn]);
  // The tab bar's top (on a phone): a card's floor stops above it.
  const [tabBar, setTabBar] = useState(0);
  useEffect(() => {
    const read = () => setTabBar(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tabbar-h")) || 0);
    read();
    window.addEventListener("resize", read);
    const late = window.setTimeout(read, 500);
    return () => {
      window.removeEventListener("resize", read);
      window.clearTimeout(late);
    };
  }, []);

  // The horizon: low, the back wall most of the screen — but as the League Room's while a card's up, for its floor.
  const up = card !== null;
  const share = useEasedShare(up ? HORIZON_SHARE : WALL_SHARE);
  const stage =
    roomSize && stageBox
      ? {
          top: roomSize.height * HORIZON_SHARE + STAGE_GAP_PX,
          bottom: roomSize.height - tabBar - STAGE_GAP_PX,
          left: stageBox.left,
          width: stageBox.width,
          room: roomSize,
          back: true,
          places: {
            wall: {
              top: `calc(${UNDER_HEADER})`,
              height: `calc(${roomSize.height * HORIZON_SHARE - STAGE_GAP_PX}px - (${UNDER_HEADER}))`,
              left: stageBox.left,
              width: stageBox.width,
            },
            floor: { top: roomSize.height * HORIZON_SHARE + STAGE_GAP_PX, bottom: roomSize.height - tabBar - STAGE_GAP_PX, left: stageBox.left, width: stageBox.width },
            room: roomSize,
          },
        }
      : null;

  // Every column down to just over the horizon.
  const columnHeight = { height: `calc(var(--room-h, 100vh) * ${share} - ${OVER_HORIZON})` };
  return (
    <StageContext.Provider value={{ up, place: setStageColumn }}>
      <div style={roomSize ? { ["--room-h" as string]: `${roomSize.height}px` } : undefined}>
        <h1 className="sr-only">{title}</h1>
        <div ref={setRoom} aria-hidden className="grid-room" style={{ ["--horizon" as string]: `${share * 100}%` }}>
          <FloorGrid share={share} />
        </div>
        <div className="fixed inset-x-0 top-0 flex gap-4 px-4" style={columnHeight}>
          {children}
        </div>
        {/* Over the page, not inside a column (whose contents move as it scrolls, and whose reflection would copy it). */}
        {card && stage && onCloseCard
          ? createPortal(
              <PlayerCareer player={card.player} numbers={card.numbers} season={card.season} scoring={card.scoring} stage={stage} onClose={onCloseCard} />,
              document.body
            )
          : null}
      </div>
    </StageContext.Provider>
  );
}
