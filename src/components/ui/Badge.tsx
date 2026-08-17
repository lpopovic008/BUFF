import { ReactNode } from "react";

type BadgeTone = "neutral" | "good" | "warning" | "critical";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-page text-ink-secondary border-border",
  good: "text-status-good border-status-good/30 bg-status-good/10",
  warning: "text-status-warning border-status-warning/30 bg-status-warning/10",
  critical: "text-status-critical border-status-critical/30 bg-status-critical/10",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
