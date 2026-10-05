import { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

/**
 * A card whose title sits on the map-tag plate across its top edge — the
 * app's section header, the same plate as the home page's slate bars and the
 * league page's matchup header. `aside` sits at the plate's right end.
 */
export function PlateCard({
  title,
  aside,
  children,
  className = "",
  bodyClassName = "p-4 sm:p-5",
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2 bg-[var(--map-tag)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--map-tag-ink)]">
        <h2 className="min-w-0 truncate">{title}</h2>
        {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}
