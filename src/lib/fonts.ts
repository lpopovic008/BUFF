// The recap graphic's "college sports" display font for bowl/cup names —
// next/font self-hosts it at build time (no runtime CDN call, works
// offline), same convention as the app's own Julius Sans One in layout.tsx.
// Canvas text drawing can't read CSS classes, so recap-graphic.ts instead
// uses `recapDisplayFont.style.fontFamily` directly in its `ctx.font`
// strings — see RecapEditor.tsx, which also renders an invisible span in
// this font so the browser actually has a live use of it to load.

import { Anton, Karla } from "next/font/google";

export const recapDisplayFont = Anton({ weight: "400", subsets: ["latin"], display: "swap" });

// The recap write-up's own body font — applied to the editor area in
// RecapEditor.tsx so it reads distinctly from the rest of the app's Julius
// Sans One chrome, since this is the one place in the app meant to be read
// like a document rather than a UI.
export const recapBodyFont = Karla({ subsets: ["latin"], display: "swap" });
