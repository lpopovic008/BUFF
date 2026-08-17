import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface-raised shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
