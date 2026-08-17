"use client";

import { useState } from "react";
import { playerHeadshotUrl } from "@/lib/sleeper";

/** Sleeper's player-photo CDN. Not every player has a real photo, so a failed load falls back to a plain circle rather than a broken-image icon. */
export function PlayerHeadshot({ playerId, size = 40 }: { playerId: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="shrink-0 rounded-full bg-page" style={{ width: size, height: size }} aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playerHeadshotUrl(playerId)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-page object-cover"
      style={{ width: size, height: size }}
    />
  );
}
