"use client";

import { useState } from "react";
import { playerHeadshotUrl } from "@/lib/sleeper";

/** Sleeper's player-photo CDN. Not every player has a real photo, so a failed load falls back to a plain circle rather than a broken-image icon. `size` is in px at the base 16px root, applied as rem so it scales with the app's fluid root size. */
export function PlayerHeadshot({ playerId, size = 40 }: { playerId: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const dim = `${size / 16}rem`;
  if (failed) {
    return <span className="shrink-0 rounded-full bg-page" style={{ width: dim, height: dim }} aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playerHeadshotUrl(playerId)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-page object-cover"
      style={{ width: dim, height: dim }}
    />
  );
}
