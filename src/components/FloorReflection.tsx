"use client";

import { useEffect, useId, useRef } from "react";

/** How far down the floor a reflection reaches, and how strong it is at its top. */
const REACH = "5rem";
const STRENGTH = 0.2;

// The scroll timelines of the lists being reflected, all of them seen page-wide (see below).
const timelines = new Set<string>();
const publishTimelines = () => document.body.style.setProperty("timeline-scope", [...timelines].join(", ") || "none");

/**
 * Something standing on the floor reflected in it (`source`): its bottom part, upside down, fading out a little way
 * down — a list moving as it scrolls. Drawn from a copy of it (-webkit-box-reflect doesn't keep up with a box that
 * scrolls, and some browsers reflect the wrong part of it), laid out as it is (`className`, `style`: a list's padding
 * and fade), redone the frame it changes. A list (`source` scrolling) moves its copy by a scroll timeline, so the two
 * move together in the same frame; where there's none, and for anything scrolling within it, the copy follows its
 * scroll.
 */
export function FloorReflection({ source, className = "", style }: { source: HTMLElement | null; className?: string; style?: React.CSSProperties }) {
  const box = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const name = `--reflect-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  useEffect(() => {
    const out = box.current;
    const cp = copy.current;
    if (!source || !out || !cp) return;
    const scrolls = getComputedStyle(source).overflowY !== "visible";
    const timeline = scrolls && CSS.supports("animation-timeline", "--x") && CSS.supports("timeline-scope", "--x");
    if (timeline) {
      source.style.setProperty("scroll-timeline", `${name} y`);
      timelines.add(name);
      publishTimelines();
    }
    // The copy's contents, moved up as far as the list's scrolled; and what scrolls within it, each paired with its copy.
    let content: HTMLDivElement | null = null;
    let inner: [HTMLElement, HTMLElement][] = [];
    const follow = () => {
      if (content && scrolls) {
        if (timeline) content.style.setProperty("--reflect-max", `${source.scrollHeight - source.clientHeight}px`);
        else content.style.transform = `translateY(${-source.scrollTop}px)`;
      }
      for (const [from, to] of inner) to.scrollTop = from.scrollTop;
    };
    // Just under it, as wide as it — its copy as tall as it, turned over about its foot.
    const place = () => {
      const r = source.getBoundingClientRect();
      out.style.left = `${r.left}px`;
      out.style.width = `${r.width}px`;
      out.style.top = `${r.bottom}px`;
      cp.style.height = `${r.height}px`;
      follow();
    };
    const recopy = () => {
      const next = document.createElement("div");
      if (timeline) {
        next.style.animation = "reflect-scroll linear both";
        next.style.setProperty("animation-timeline", name);
      }
      next.append(...[...source.childNodes].map((n) => n.cloneNode(true)));
      cp.replaceChildren(next);
      content = next;
      const froms = source.querySelectorAll<HTMLElement>("*");
      const tos = next.querySelectorAll<HTMLElement>("*");
      inner = [...froms].flatMap((from, i) => (from.scrollTop > 0 || from.scrollHeight > from.clientHeight + 1 ? [[from, tos[i]] as [HTMLElement, HTMLElement]] : []));
      place();
    };
    let frame = 0;
    const changed = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), recopy()));
    };
    recopy();
    // Scrolls within it don't bubble, so they're caught on their way down.
    source.addEventListener("scroll", follow, { capture: true, passive: true });
    const mutations = new MutationObserver(changed);
    mutations.observe(source, { subtree: true, childList: true, characterData: true, attributes: true });
    const resize = new ResizeObserver(place);
    resize.observe(source);
    window.addEventListener("resize", place);
    // Its rise into place, when it's first drawn.
    document.addEventListener("animationend", place, true);
    return () => {
      cancelAnimationFrame(frame);
      source.removeEventListener("scroll", follow, { capture: true });
      mutations.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", place);
      document.removeEventListener("animationend", place, true);
      if (timeline) {
        source.style.removeProperty("scroll-timeline");
        timelines.delete(name);
        publishTimelines();
      }
      cp.replaceChildren();
    };
  }, [source, name]);
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
      {/* Still: no animation or transition in it replays each time it's copied (only its scroll's). */}
      <div
        ref={copy}
        className={`absolute inset-x-0 bottom-full origin-bottom overflow-hidden [transform:scaleY(-1)] [&>*_*]:!animate-none [&>*_*]:!transition-none ${className}`}
        style={style}
      />
    </div>
  );
}
