"use client";

import { useState } from "react";
import { playerHeadshotUrl } from "@/lib/sleeper";

/** Sleeper's player-photo CDN. Not every player has a real photo, so a failed load falls back to a plain circle rather than a broken-image icon. `size` is in px at the base 16px root, applied as rem so it scales with the app's fluid root size — or, `sizeClass` instead, sized by classes (to change with the screen). Round, or `square`: the same size, showing the biggest square that fits inside the round one — its width over √2, enlarged to fill. */
export function PlayerHeadshot({
  playerId,
  size = 40,
  sizeClass,
  square = false,
}: {
  playerId: string;
  size?: number;
  sizeClass?: string;
  square?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const dim = `${size / 16}rem`;
  const sized = sizeClass ? { className: sizeClass } : { style: { width: dim, height: dim } };
  if (failed) {
    return <span className={`shrink-0 bg-page ${square ? "" : "rounded-full"} ${sizeClass ?? ""}`} style={sized.style} aria-hidden />;
  }
  if (square) {
    return (
      <span className={`relative shrink-0 overflow-hidden bg-page ${sizeClass ?? ""}`} style={sized.style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={playerHeadshotUrl(playerId)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full scale-[1.4142] object-cover"
        />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={playerHeadshotUrl(playerId)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full bg-page object-cover ${sizeClass ?? ""}`}
      style={sized.style}
    />
  );
}
