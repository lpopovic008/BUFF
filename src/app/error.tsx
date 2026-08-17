"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-raised p-12 text-center">
      <h1 className="text-xl font-semibold text-ink-primary">Couldn&rsquo;t load this page</h1>
      <p className="max-w-md text-sm text-ink-secondary">
        {error.message.includes("Sleeper API")
          ? "Sleeper's API didn't respond. It may be down for maintenance (common during live games) — try again in a moment."
          : "Something went wrong while loading this page."}
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
