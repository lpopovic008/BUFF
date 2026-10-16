"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/format";

/**
 * The countdown to the week's next kickoff, ticking each second — set over
 * the open space at the top of the dashboard's map. Gone once the week's last
 * game has kicked off (or for a week already played).
 */
export function KickoffCountdown({ kickoffs, className = "" }: { kickoffs: number[]; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, []);
  if (now === null) return null;
  const target = kickoffs.find((t) => t > now);
  if (target === undefined) return null;
  return (
    <span
      className={`text-base font-bold tabular-nums text-ink-secondary animate-[fade-in_0.2s_ease-out] sm:text-2xl ${className}`}
      title="Next kickoff"
    >
      {formatCountdown(target - now)}
    </span>
  );
}
