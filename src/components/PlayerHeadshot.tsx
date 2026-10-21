"use client";

import { useState } from "react";
import { playerHeadshotUrl } from "@/lib/sleeper";

/** Sleeper's player-photo CDN. Not every player has a real photo, so a failed load falls back to a plain circle rather than a broken-image icon. `size` is in px at the base 16px root, applied as rem so it scales with the app's fluid root size — or, `sizeClass` instead, sized by classes (to change with the screen). Round, or `square`: the biggest square that fits inside the round one, cut from it — the photo at the same scale, the square its width over √2, centered where the circle was. */
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
    // The circle's box kept, so nothing around it moves; the square inset 14.645% (half of 1 − 1/√2) from each
    // edge, and the photo inside it at the circle's own size and place.
    return (
      <span className={`relative shrink-0 ${sizeClass ?? ""}`} style={sized.style}>
        <span className="absolute inset-[14.645%] overflow-hidden bg-page">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={playerHeadshotUrl(playerId)}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute -left-[20.711%] -top-[20.711%] h-[141.421%] w-[141.421%] max-w-none object-cover"
          />
        </span>
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
