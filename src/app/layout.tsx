import type { Metadata } from "next";
import { Julius_Sans_One } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const juliusSansOne = Julius_Sans_One({
  variable: "--font-julius-sans-one",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BUFF — Fantasy League HQ",
  description: "Dashboard for tracking Sleeper fantasy leagues, commissioner recaps, and career stats.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${juliusSansOne.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-page">
        <NavBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
