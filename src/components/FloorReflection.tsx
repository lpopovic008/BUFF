"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { LIST_MOVE, listPosition } from "@/hooks/useListScroll";

/** How far down the floor a reflection reaches, and how strong it is at its top. */
const REACH = "5rem";
const STRENGTH = 0.2;

interface Timing {
  riseAt: number | null;
  sinkAt: number | null;
  rise?: { delayMs: number; ms: number };
  sinkMs?: number;
  ease: string;
}

/** A copy moved as its source comes up out of the floor, or goes down into it (see FloorReflection's rise, sinkMs). */
function moveCopy(el: HTMLElement, { riseAt, sinkAt, rise, sinkMs, ease }: Timing) {
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
 * and fade), redone the moment it changes. A list (it, or one within it — every list is scrolled by the page, see
 * useListScroll) has its copy moved with each move it makes, there and then, in the same frame — pulled and bounced
 * past its ends too, exactly as it moves. Anything else scrolling within it, its copy follows its scroll. Something
 * coming up out of the floor (`rise`), or going back down into it (`sinkMs`), has its reflection come down out of the
 * floor's surface, or go back up into it, in step.
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
  // Its copy's contents (redone as it changes), and when it rises (or sinks): its copy moved to match, mirrored.
  const content = useRef<HTMLDivElement | null>(null);
  const timing = useRef<Timing & { first: boolean }>({ riseAt: null, sinkAt: null, rise, sinkMs, ease, first: true });
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
    // Each list (it, or one within it) paired with what moves for it in the copy: for it, the copy's contents as a
    // whole; for one within it, its copy's contents. And anything else scrolling within it, paired with its copy.
    let lists: [HTMLElement, HTMLElement][] = [];
    let inner: [HTMLElement, HTMLElement][] = [];
    const follow = () => {
      for (const [list, moved] of lists) moved.style.transform = `translate3d(0,${-listPosition(list)}px,0)`;
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
      next.append(...[...source.childNodes].map((n) => n.cloneNode(true)));
      // Nothing marked to be left out (a scroll thumb).
      for (const el of next.querySelectorAll("[data-no-reflect]")) el.remove();
      moveCopy(next, timing.current);
      cp.replaceChildren(next);
      content.current = next;
      const froms = source.querySelectorAll<HTMLElement>(":not([data-no-reflect])");
      const tos = next.querySelectorAll<HTMLElement>("*");
      lists = [];
      inner = [];
      // A list's contents in the copy are moved here alone (not as far past its end as they were when copied).
      const unmoved = (el: Element | null) => {
        if (el instanceof HTMLElement) el.style.removeProperty("transform");
        return el;
      };
      if (source.hasAttribute("data-scroll-list")) {
        unmoved(next.firstElementChild);
        lists.push([source, next]);
      }
      froms.forEach((from, i) => {
        if (from.hasAttribute("data-scroll-list")) {
          const moved = unmoved(tos[i]?.firstElementChild ?? null);
          if (moved instanceof HTMLElement) lists.push([from, moved]);
        } else if (from.scrollTop > 0 || from.scrollHeight > from.clientHeight + 1) inner.push([from, tos[i]]);
      });
      place();
    };
    const changed = (records: MutationRecord[]) => {
      // Going down into the floor: kept as it was as it goes.
      if (timing.current.sinkAt !== null) return;
      const left = (r: MutationRecord) => r.target instanceof Element && r.target.closest("[data-no-reflect]") !== null;
      // A list moved past an end (its contents moved) isn't a change to copy.
      const moved = (r: MutationRecord) =>
        r.attributeName === "style" && r.target instanceof Element && (r.target.hasAttribute("data-scroll-list") || !!r.target.parentElement?.hasAttribute("data-scroll-list"));
      if (records.some((r) => !left(r) && !moved(r))) recopy();
    };
    recopy();
    // Its lists' moves, and other scrolls within it (which don't bubble), caught on their way down.
    source.addEventListener(LIST_MOVE, follow, { capture: true });
    source.addEventListener("scroll", follow, { capture: true, passive: true });
    const mutations = new MutationObserver(changed);
    mutations.observe(source, { subtree: true, childList: true, characterData: true, attributes: true });
    const resize = new ResizeObserver(place);
    resize.observe(source);
    window.addEventListener("resize", place);
    // Its rise into place, when it's first drawn.
    document.addEventListener("animationend", place, true);
    return () => {
      source.removeEventListener(LIST_MOVE, follow, { capture: true });
      source.removeEventListener("scroll", follow, { capture: true });
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
      {/* Still: no animation or transition in it replays each time it's copied (only its scroll's). */}
      <div
        ref={copy}
        className={`absolute inset-x-0 bottom-full origin-bottom overflow-hidden [transform:scaleY(-1)] [&>*_*]:!animate-none [&>*_*]:!transition-none ${className}`}
        style={style}
      />
    </div>
  );
}
