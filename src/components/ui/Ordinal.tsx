import { ordinal } from "@/lib/format";

/** A place like "5th", with its suffix raised as a superscript (5ᵗʰ). */
export function Ordinal({ n }: { n: number }) {
  const text = ordinal(n);
  const digits = String(n);
  return (
    <span aria-label={text}>
      {digits}
      <sup className="text-[0.7em]">{text.slice(digits.length)}</sup>
    </span>
  );
}
