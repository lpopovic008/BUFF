import type { Metadata } from "next";
import { Azeret_Mono } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const azeretMono = Azeret_Mono({
  variable: "--font-azeret-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BUFF — Fantasy League HQ",
  description: "Dashboard for tracking Sleeper fantasy leagues, commissioner recaps, and career stats.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${azeretMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-page">
        <NavBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
