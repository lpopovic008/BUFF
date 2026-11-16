// Where tips for the app's developer go (see Settings → Suggest an improvement). Fill in a handle to show its button;
// any left empty stays hidden — with none filled in, only the suggestion box shows. These are public handles (they
// end up in links on the page), never passwords or keys.

/** github.com/sponsors/<this> — GitHub takes no fee on sponsorships from personal accounts. */
const GITHUB_SPONSORS = "";
/** venmo.com/u/<this> — free when sent from a Venmo balance, bank or debit card. */
const VENMO = "";
/** cash.app/$<this> (without the $) — free when sent from a Cash App balance, bank or debit card. */
const CASH_APP = "";

export interface SupportLink {
  label: string;
  href: string;
  note: string;
}

/** The ways to tip the developer that have a handle filled in, the one with no fees at all first. */
export function supportLinks(): SupportLink[] {
  const links: (SupportLink | null)[] = [
    GITHUB_SPONSORS ? { label: "GitHub Sponsors", href: `https://github.com/sponsors/${encodeURIComponent(GITHUB_SPONSORS)}`, note: "No fees: all of it goes to the developer." } : null,
    VENMO ? { label: "Venmo", href: `https://venmo.com/u/${encodeURIComponent(VENMO)}`, note: "Free from your Venmo balance, bank or debit card." } : null,
    CASH_APP ? { label: "Cash App", href: `https://cash.app/$${encodeURIComponent(CASH_APP)}`, note: "Free from your Cash App balance, bank or debit card." } : null,
  ];
  return links.filter((l): l is SupportLink => l !== null);
}

/** The longest a suggestion can be (characters) — the database holds it to the same. */
export const SUGGESTION_MAX = 2000;
