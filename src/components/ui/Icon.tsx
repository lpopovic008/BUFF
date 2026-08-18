// Small hand-drawn icon set (no external dependency) matching a single
// consistent stroke style, for icon-first buttons across the app. Each icon
// is 20x20, inherits color via currentColor, and takes no props beyond a
// className so callers size/color them with Tailwind like any other element.

import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <line x1="3" y1="5" x2="17" y2="5" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="15" x2="17" y2="15" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="6.5" y="6.5" width="9" height="11" rx="1.5" />
      <path d="M4.5 13.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function CopyStyledIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5.5" y="6.5" width="9" height="11" rx="1.5" />
      <path d="M3.5 13.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
      <path d="M16.5 2.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 3.5h10l2.5 2.5V16a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
      <path d="M6.5 3.5V8h6V3.5" />
      <path d="M6.5 16.5V11h7v5.5" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12.5 10 7l5.5 5.5" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 7.5 10 13l5.5-5.5" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h12" />
      <path d="M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6" />
      <path d="M5.5 6l.6 9a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9l.6-9" />
      <line x1="8.3" y1="9" x2="8.6" y2="13.5" />
      <line x1="11.7" y1="9" x2="11.4" y2="13.5" />
    </svg>
  );
}

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(props)} fill={filled ? "currentColor" : "none"}>
      <path d="M10 3l1.9 3.9 4.2.6-3 3 .7 4.2L10 12.8 6.2 14.7l.7-4.2-3-3 4.2-.6z" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 3v9.5" />
      <path d="M6.5 9l3.5 3.5L13.5 9" />
      <path d="M4 15.5h12" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 12.5V3" />
      <path d="M6.5 6.5L10 3l3.5 3.5" />
      <path d="M4 15.5h12" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <line x1="12.7" y1="12.7" x2="16.5" y2="16.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

export function StandingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="10.5" width="3" height="5.5" />
      <rect x="8.5" y="6.5" width="3" height="9.5" />
      <rect x="13" y="3.5" width="3" height="12.5" />
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.5 3h6l3 3v11a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5V3.5a.5.5 0 0 1 .5-.5z" />
      <path d="M11.5 3v3h3" />
      <line x1="7" y1="10.5" x2="13" y2="10.5" />
      <line x1="7" y1="13" x2="13" y2="13" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10.5" r="6.5" />
      <path d="M10 6.5V10.5l3.2 1.9" />
    </svg>
  );
}

export function CrownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 15.5h13l-1-8-3.5 3-2-5.5-2 5.5-3.5-3z" />
      <line x1="3.5" y1="15.5" x2="16.5" y2="15.5" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="4.5" width="13" height="12" />
      <line x1="3.5" y1="8" x2="16.5" y2="8" />
      <line x1="7" y1="3" x2="7" y2="6" />
      <line x1="13" y1="3" x2="13" y2="6" />
    </svg>
  );
}

export function OneQBIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  );
}

export function SuperflexIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="7" cy="6.5" r="2.6" />
      <circle cx="13" cy="6.5" r="2.6" />
      <path d="M2.5 17c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5" />
      <path d="M8.5 17c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5" />
    </svg>
  );
}

export function DotIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10.5" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlusCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10.5" r="6.5" />
      <line x1="10" y1="7.5" x2="10" y2="13.5" />
      <line x1="7" y1="10.5" x2="13" y2="10.5" />
    </svg>
  );
}
