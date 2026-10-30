"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";

/** How far down the floor a reflection reaches, and how strong it is at its top. */
const REACH = "5rem";
const STRENGTH = 0.2;

// The scroll timelines of the lists being reflected, all of them seen page-wide (see below).
const timelines = new Set<string>();
const publishTimelines = () => document.body.style.setProperty("timeline-scope", [...timelines].join(", ") || "none");

interface Timing {
  riseAt: number | null;
  sinkAt: number | null;
  timed: boolean;
  rise?: { delayMs: number; ms: number };
  sinkMs?: number;
  ease: string;
}

/** A copy moved as its source comes up out of the floor, or goes down into it (see FloorReflection's rise, sinkMs). */
function moveCopy(el: HTMLElement, { riseAt, sinkAt, timed, rise, sinkMs, ease }: Timing) {
  // A copy moved by its source's scroll timeline is left to it.
  if (timed) return;
  const now = performance.now();
  if (sinkAt !== null && sinkMs !== undefined) el.style.animation = `reflect-sink ${sinkMs}ms ${ease} ${sinkAt - now}ms forwards`;
  else if (riseAt !== null && rise) el.style.animation = `reflect-rise ${rise.ms}ms ${ease} ${riseAt - now}ms backwards`;
  else el.style.removeProperty("animation");
}

/** How far down an element's moved by its own transform or translate (what its box would be without, for its foot). */
function ownShift(el: HTMLElement): number {
  const style = getComputedStyle(el);
  let y = 0;
  if (style.transform && style.transform !== "none") y += new DOMMatrixReadOnly(style.transform).m42;
  if (style.translate && style.translate !== "none") y += parseFloat(style.translate.split(" ")[1] ?? "0") || 0;
  return y;
}

/**
 * Something standing on the floor reflected in it (`source`): its bottom part, upside down, fading out a little way
 * down — a list moving as it scrolls. Drawn from a copy of it (-webkit-box-reflect doesn't keep up with a box that
 * scrolls, and some browsers reflect the wrong part of it), laid out as it is (`className`, `style`: a list's padding
 * and fade), redone the moment it changes. A list (scrolled by the browser, as a phone scrolls) moves its copy by a
 * scroll timeline, so the two move in the same frame. Where there's none, and for anything scrolling within it, the
 * copy follows its scroll — past its ends too, where a phone's bounce reports it. Something coming up out of the floor (`rise`), or going back down into it (`sinkMs`),
 * has its reflection come down out of the floor's surface, or go back up into it, in step.
 */
export function FloorReflection({
  source,
  className = "",
  style,
  rise,
  sinkMs,
  ease = "ease-out",
  risesAtFirst = true,
}: {
  source: HTMLElement | null;
  className?: string;
  style?: React.CSSProperties;
  /** It's coming up out of the floor, after `delayMs`, over `ms`, from as far down as it's tall. */
  rise?: { delayMs: number; ms: number };
  /** It's going back down into the floor, over this long, as far down as it's tall. */
  sinkMs?: number;
  /** How its rise and sink are eased, as its source's are. */
  ease?: string;
  /** Whether it comes up when it's first drawn too (or only after going down). */
  risesAtFirst?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const name = `--reflect-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Its copy's contents (redone as it changes), and when it rises (or sinks): its copy moved to match, mirrored.
  const content = useRef<HTMLDivElement | null>(null);
  const timing = useRef<Timing & { first: boolean }>({ riseAt: null, sinkAt: null, timed: false, rise, sinkMs, ease, first: true });
  // Set before anything it's copying changes on the way down (its source's own sink), so that's not copied.
  const sinking = sinkMs !== undefined;
  useLayoutEffect(() => {
    const t = timing.current;
    Object.assign(t, { rise, sinkMs, ease });
    const first = t.first;
    t.first = false;
    if (sinking) t.sinkAt = performance.now();
    else if (t.sinkAt !== null || (first && risesAtFirst)) {
      // Coming up — again, if it was going down.
      t.sinkAt = null;
      t.riseAt = rise ? performance.now() + rise.delayMs : null;
    }
    if (content.current) moveCopy(content.current, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once each way
  }, [sinking]);
  useEffect(() => {
    const out = box.current;
    const cp = copy.current;
    if (!source || !out || !cp) return;
    const overflow = getComputedStyle(source).overflowY;
    const scrolls = overflow !== "visible";
    // Its copy moved by its scroll timeline, where there is one; else with each scroll.
    const timeline = scrolls && overflow !== "hidden" && CSS.supports("animation-timeline", "--x") && CSS.supports("timeline-scope", "--x");
    timing.current.timed = timeline;
    if (timeline) {
      source.style.setProperty("scroll-timeline", `${name} y`);
      timelines.add(name);
      publishTimelines();
    }
    // The copy's contents, moved up as far as the list's scrolled; and what scrolls within it, each paired with its copy.
    let inner: [HTMLElement, HTMLElement][] = [];
    const follow = () => {
      const moved = content.current;
      if (moved && scrolls) {
        if (timeline) moved.style.setProperty("--reflect-max", `${source.scrollHeight - source.clientHeight}px`);
        else moved.style.transform = `translateY(${-source.scrollTop}px)`;
      }
      for (const [from, to] of inner) to.scrollTop = from.scrollTop;
    };
    // Just under it, as wide as it — its copy as tall as it, turned over about its foot.
    // Where it stands, not where it's slid to on its way into (or out of) the floor.
    const place = () => {
      const r = source.getBoundingClientRect();
      out.style.left = `${r.left}px`;
      out.style.width = `${r.width}px`;
      out.style.top = `${r.bottom - ownShift(source)}px`;
      cp.style.height = `${r.height}px`;
      follow();
    };
    const recopy = () => {
      const next = document.createElement("div");
      // As tall as the copy at least: moved (transformed), it's what anything placed within the copy sizes against.
      next.style.minHeight = "100%";
      // Moved by the graphics card, not repainted, as it follows.
      next.style.willChange = "transform";
      if (timeline) {
        next.style.animation = "reflect-scroll linear both";
        next.style.setProperty("animation-timeline", name);
      }
      next.append(...[...source.childNodes].map((n) => n.cloneNode(true)));
      // Nothing marked to be left out (a scroll thumb).
      for (const el of next.querySelectorAll("[data-no-reflect]")) el.remove();
      moveCopy(next, timing.current);
      cp.replaceChildren(next);
      content.current = next;
      const froms = source.querySelectorAll<HTMLElement>(":not([data-no-reflect])");
      const tos = next.querySelectorAll<HTMLElement>("*");
      inner = [...froms].flatMap((from, i) => (from.scrollTop > 0 || from.scrollHeight > from.clientHeight + 1 ? [[from, tos[i]] as [HTMLElement, HTMLElement]] : []));
      place();
    };
    const changed = (records: MutationRecord[]) => {
      // Going down into the floor: kept as it was as it goes.
      if (timing.current.sinkAt !== null) return;
      const left = (r: MutationRecord) => r.target instanceof Element && r.target.closest("[data-no-reflect]") !== null;
      // Its own style (its scroll timeline, set here) isn't a change to copy.
      if (records.some((r) => !left(r) && !(r.target === source && r.attributeName === "style"))) recopy();
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
