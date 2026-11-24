"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { finishAppSignIn } from "@/lib/auth";
import { startPush } from "@/lib/push";
import { isNativeApp, openExternal } from "@/lib/native";

/**
 * In the app on an iPhone or iPad (see lib/native): the app's own link (a sign-in coming back from its Safari sheet)
 * taken in; every link to another site opened in a Safari sheet over the app — never in the app's own view in place
 * of it, where there'd be no way back; and push notifications kept registered, a tapped one's page opened (see
 * lib/push). Nothing in a browser.
 */
export function NativeBridge() {
  const router = useRouter();
  useEffect(() => {
    if (!isNativeApp()) return;
    let stop: (() => void) | null = null;
    let stopPush: (() => void) | null = null;
    let gone = false;
    startPush((path) => router.push(path))
      .then((s) => (gone ? s() : (stopPush = s)))
      .catch(() => {});
    import("@capacitor/app").then(({ App }) =>
      App.addListener("appUrlOpen", ({ url }) => void finishAppSignIn(url)).then((handle) => {
        if (gone) handle.remove();
        else stop = () => handle.remove();
      })
    );
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement)) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin === window.location.origin || !/^https?:$/.test(url.protocol)) return;
      e.preventDefault();
      void openExternal(url.toString());
    };
    document.addEventListener("click", onClick, true);
    return () => {
      gone = true;
      stop?.();
      stopPush?.();
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);
  return null;
}
