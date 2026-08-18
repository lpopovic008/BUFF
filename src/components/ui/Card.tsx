import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-border bg-surface-raised ${className}`}>{children}</div>;
}
