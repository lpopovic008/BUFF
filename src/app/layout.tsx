import type { Metadata, Viewport } from "next";
import { Julius_Sans_One } from "next/font/google";
import { AutoSync } from "@/components/AutoSync";
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

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

// Same basePath Next.js itself is built with (see next.config.ts) — GitHub
// Pages serves this site from /BUFF, but Next's own metadata.manifest/
// metadata.icons fields don't get that prefix applied automatically (unlike
// next/link or next/image), so a plain "/manifest.json" 404s once deployed.
// Hand-writing these tags with the same prefix google-auth.ts's
// redirectUri() already uses keeps every basePath-sensitive URL in the app
// resolved the same way.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${juliusSansOne.variable} h-full antialiased`}>
      <head>
        <link rel="manifest" href={`${basePath}/manifest.json`} />
        <link rel="icon" href={`${basePath}/icons/favicon-32.png`} sizes="32x32" type="image/png" />
        <link rel="icon" href={`${basePath}/icons/favicon-16.png`} sizes="16x16" type="image/png" />
        <link rel="apple-touch-icon" href={`${basePath}/icons/apple-touch-icon.png`} sizes="180x180" type="image/png" />
        {/* iOS only ever honored its own prefixed tag for "add to home screen -> full-screen, no Safari chrome" — Next's own metadata API only emits the newer unprefixed mobile-web-app-capable (present too, via generated metadata), which older iOS ignores. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="BUFF" />
      </head>
      <body className="min-h-full bg-page">
        <AutoSync />
        {children}
      </body>
    </html>
  );
}
