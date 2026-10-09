import { ReactNode, Ref } from "react";

export function Card({ children, className = "", ref }: { children: ReactNode; className?: string; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={`border border-border bg-surface-raised ${className}`}>
      {children}
    </div>
  );
}
