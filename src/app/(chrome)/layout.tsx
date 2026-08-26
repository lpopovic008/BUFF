import { NavBar } from "@/components/NavBar";

/** The bar-and-column shell every page except the War Room (home) still uses. */
export default function ChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-8 sm:px-6">{children}</main>
    </div>
  );
}
