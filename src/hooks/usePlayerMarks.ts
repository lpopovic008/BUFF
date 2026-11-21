"use client";

import { useSyncExternalStore } from "react";
import { getPlayerMarks, onLocalWrite, PlayerMark, savePlayerMarks } from "@/lib/localStore";

// The marks as last read, so each read between changes is the same object.
let cached: Record<string, PlayerMark> | null = null;
const EMPTY: Record<string, PlayerMark> = {};

function subscribe(onChange: () => void): () => void {
  const changed = () => {
    cached = null;
    onChange();
  };
  // Changed here (any write), or in another tab.
  const stop = onLocalWrite(changed);
  window.addEventListener("storage", changed);
  return () => {
    stop();
    window.removeEventListener("storage", changed);
  };
}

/** The players you've marked to buy or sell (see PlayerMark), by Sleeper player id — followed as they change. */
export function usePlayerMarks(): Record<string, PlayerMark> {
  return useSyncExternalStore(
    subscribe,
    () => (cached ??= getPlayerMarks()),
    () => EMPTY
  );
}

/** Marks a player to buy or sell — or, given the mark he has (or null), takes it off. */
export function setPlayerMark(playerId: string, mark: PlayerMark | null): void {
  const marks = { ...getPlayerMarks() };
  if (mark === null || marks[playerId] === mark) delete marks[playerId];
  else marks[playerId] = mark;
  savePlayerMarks(marks);
}
