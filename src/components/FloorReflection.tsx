"use client";

import { useEffect, useRef } from "react";

/** How far down the floor a reflection reaches, and how strong it is at its top. */
const REACH = "5rem";
const STRENGTH = 0.2;
/** How often, at most, the copy's redone as the list changes (ms). */
const RECOPY_MS = 300;

/**
 * A scrolling list's reflection in the floor under it (`source`, a scroll box): its bottom part, upside down, fading
 * out a little way down — moving with the list as it scrolls. Drawn from a copy of the list (-webkit-box-reflect
 * doesn't keep up with a box that scrolls, and some browsers reflect the wrong part of it), laid out as the list is
 * (`className`, `style`: its padding and fade) and scrolled with it, redone as the list changes.
 */
export function FloorReflection({ source, className = "", style }: { source: HTMLElement | null; className?: string; style?: React.CSSProperties }) {
  const box = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = box.current;
    const cp = copy.current;
    if (!source || !out || !cp) return;
    const scroll = () => {
      cp.scrollTop = source.scrollTop;
    };
    // Just under the list, as wide as it — its copy as tall as it, turned over about the list's foot.
    const place = () => {
      const r = source.getBoundingClientRect();
      out.style.left = `${r.left}px`;
      out.style.width = `${r.width}px`;
      out.style.top = `${r.bottom}px`;
      cp.style.height = `${r.height}px`;
      scroll();
    };
    const recopy = () => {
      cp.replaceChildren(...[...source.childNodes].map((n) => n.cloneNode(true)));
      place();
    };
    let timer = 0;
    const changed = () => {
      if (!timer) timer = window.setTimeout(() => ((timer = 0), recopy()), RECOPY_MS);
    };
    recopy();
    source.addEventListener("scroll", scroll, { passive: true });
    const mutations = new MutationObserver(changed);
    mutations.observe(source, { subtree: true, childList: true, characterData: true, attributes: true });
    const resize = new ResizeObserver(place);
    resize.observe(source);
    window.addEventListener("resize", place);
    // Its rise into place, when it's first drawn.
    document.addEventListener("animationend", place, true);
    return () => {
      window.clearTimeout(timer);
      source.removeEventListener("scroll", scroll);
      mutations.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", place);
      document.removeEventListener("animationend", place, true);
      cp.replaceChildren();
    };
  }, [source]);
  return (
    <div
      ref={box}
      aria-hidden
      inert
      className="pointer-events-none fixed overflow-hidden"
      style={{
        height: REACH,
        WebkitMaskImage: `linear-gradient(to bottom, rgb(0 0 0 / ${STRENGTH}), transparent)`,
        maskImage: `linear-gradient(to bottom, rgb(0 0 0 / ${STRENGTH}), transparent)`,
      }}
    >
      {/* Still: no animation or transition of the list's replays each time it's copied. */}
      <div
        ref={copy}
        className={`absolute inset-x-0 bottom-full origin-bottom overflow-hidden [transform:scaleY(-1)] [&_*]:!animate-none [&_*]:!transition-none ${className}`}
        style={style}
      />
    </div>
  );
}
