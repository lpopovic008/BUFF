import { NavBar } from "@/components/NavBar";
import { TabBar } from "@/components/TabBar";

/** The bar-and-column shell every page sits in: the header, the page itself, and on a phone the tab bar along the bottom. */
export default function ChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      {/* Phones keep a comfortable gutter; from tablet width up the app runs nearly edge to edge.
          Nothing in a page may push it wider than the screen: anything too wide is clipped
          rather than letting the page scroll sideways (and a phone zoom out to fit it).
          clip, not hidden, so the sticky columns inside still stick. */}
      {/* On a phone, room under the page's end for the tab bar along the bottom. */}
      <main className="w-full min-w-0 flex-1 overflow-x-clip px-4 py-6 max-md:pb-[calc(1.5rem+var(--tabbar-h,0px))] sm:px-6 sm:py-8 md:px-1">{children}</main>
      <TabBar />
    </div>
  );
}
