import { NavBar } from "@/components/NavBar";

/** The bar-and-column shell every page except the War Room uses — the War Room stays full-bleed, reached via its own button on the league page rather than the NavBar. */
export default function ChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
    </div>
  );
}
