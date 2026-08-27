"use client";

import { Oxanium, Titillium_Web, IBM_Plex_Mono } from "next/font/google";
import { DraftRoom } from "@/components/DraftRoom";

const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-oxanium" });
const titilliumWeb = Titillium_Web({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-titillium-web" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ibm-plex-mono" });

export default function DraftPage() {
  return (
    <div className={`${oxanium.variable} ${titilliumWeb.variable} ${ibmPlexMono.variable}`}>
      <DraftRoom />
    </div>
  );
}
