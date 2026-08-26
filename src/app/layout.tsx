import type { Metadata } from "next";
import { Julius_Sans_One } from "next/font/google";
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
      <body className="min-h-full bg-page">{children}</body>
    </html>
  );
}
