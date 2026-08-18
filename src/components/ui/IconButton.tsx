import { ButtonHTMLAttributes, ReactNode } from "react";
import Link, { LinkProps } from "next/link";

type Variant = "default" | "primary" | "danger";
type Size = "md" | "sm";

const variantClasses: Record<Variant, string> = {
  default: "border border-border text-ink-secondary hover:bg-page hover:text-ink-primary",
  primary: "bg-series-1 text-white hover:opacity-90",
  danger: "border border-border text-status-critical hover:bg-status-critical/10",
};

const sizeClasses: Record<Size, string> = {
  md: "h-9 w-9",
  sm: "h-6 w-7",
};

const baseClass =
  "flex shrink-0 items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:hover:bg-transparent active:scale-90";

/** A square icon-only button — label doubles as aria-label and a hover tooltip since there's no visible text. */
export function IconButton({
  icon,
  label,
  variant = "default",
  size = "md",
  className = "",
  ...rest
}: {
  icon: ReactNode;
  label: string;
  variant?: Variant;
  size?: Size;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${baseClass} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
}

/** Same look as IconButton, but a navigation link (an <a>, not a <button>) — for icon-only nav rows. */
export function IconLink({
  icon,
  label,
  variant = "default",
  size = "md",
  className = "",
  ...rest
}: {
  icon: ReactNode;
  label: string;
  variant?: Variant;
  size?: Size;
} & LinkProps & { className?: string }) {
  return (
    <Link
      aria-label={label}
      title={label}
      className={`${baseClass} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {icon}
    </Link>
  );
}
