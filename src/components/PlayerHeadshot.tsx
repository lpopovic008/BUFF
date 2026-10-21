"use client";

import { useState } from "react";
import { playerHeadshotUrl } from "@/lib/sleeper";

/** Sleeper's player-photo CDN. Not every player has a real photo, so a failed load falls back to a plain square rather than a broken-image icon. `size` is in px at the base 16px root, applied as rem so it scales with the app's fluid root size — or, `sizeClass` instead, sized by classes (to change with the screen). */
export function PlayerHeadshot({ playerId, size = 40, sizeClass }: { playerId: string; size?: number; sizeClass?: string }) {
  const [failed, setFailed] = useState(false);
  const dim = `${size / 16}rem`;
  const sized = sizeClass ? { className: sizeClass } : { style: { width: dim, height: dim } };
  if (failed) {
    return <span className={`shrink-0 bg-page ${sizeClass ?? ""}`} style={sized.style} aria-hidden />;
  }
  return (
    // Square, zoomed in on the face: the photo half again as big, held to its top middle — where Sleeper's
    // head-and-shoulders shots have the face — so what's cut is shoulders and background, never the face.
    <span className={`relative shrink-0 overflow-hidden bg-page ${sizeClass ?? ""}`} style={sized.style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={playerHeadshotUrl(playerId)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full origin-[50%_18%] scale-150 object-cover object-top"
      />
    </span>
  );
}
