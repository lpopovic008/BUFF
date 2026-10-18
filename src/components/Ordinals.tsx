/** Text with its ordinals' suffixes ("1st", "3rd & 4") set small and raised: 1ˢᵗ, 3ʳᵈ & 4. */
export function Ordinals({ text }: { text: string }) {
  const parts = text.split(/(?<=\d)(st|nd|rd|th)\b/);
  return (
    <>
      {parts.map((part, i) =>
        // The split keeps each suffix at an odd index.
        i % 2 === 1 ? (
          <sup key={i} className="text-[0.6em]">
            {part}
          </sup>
        ) : (
          part
        )
      )}
    </>
  );
}
