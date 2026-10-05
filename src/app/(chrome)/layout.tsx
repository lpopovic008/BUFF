import { NavBar } from "@/components/NavBar";
import { PageHistoryButtons } from "@/components/HistoryButtons";

/** The bar-and-column shell every page except the War Room uses — the War Room stays full-bleed, reached via its own button on the league page rather than the NavBar. */
export default function ChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      {/* Phones keep a comfortable gutter; from tablet width up the app runs nearly edge to edge. */}
      {/* Just a sliver of room at the top: the back/forward row (or the dashboard's ticker) sits right under the header. */}
      <main className="w-full flex-1 px-4 pb-6 pt-0.5 sm:px-6 sm:pb-8 md:px-1">
        <PageHistoryButtons />
        {children}
      </main>
    </div>
  );
}
