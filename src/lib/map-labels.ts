// Stem heights for the dashboard map's game tags. Each game gets a vertical
// stem rising from its site with its tag hung off the stem's top, always to
// the right; dense areas (the Northeast corridor, two teams in one metro)
// would stack tags on top of each other at one fixed height, so each tag
// takes the shortest stem that clears every tag already placed. Pure screen
// geometry — re-run on every camera move.

export interface LabelSite {
  id: string;
  /** The site, in px from the map's top-left corner. */
  x: number;
  y: number;
  /** The tag's size in px. */
  width: number;
  height: number;
}

export interface PlacedLabel extends LabelSite {
  /** Stem length in px; the tag's top edge sits at y - stem. */
  stem: number;
}

export interface LabelLayoutOptions {
  /** Clearance between the bottom of a tag and its own site. */
  baseGap: number;
  /** How much longer each next-tallest candidate stem is. */
  step: number;
  /** Candidate stems tried per tag before settling for the least-overlapping one. */
  tries: number;
  /** Breathing room kept between tags. */
  margin: number;
  /** Tags shouldn't rise above this y (px, may be negative) — anything above is cut off. */
  minTop?: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boxFor(site: LabelSite, stem: number): Box {
  const top = site.y - stem;
  return { left: site.x, top, right: site.x + site.width, bottom: top + site.height };
}

function overlapArea(a: Box, b: Box, margin: number): number {
  const w = Math.min(a.right, b.right) + margin - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) + margin - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function stemBoxFor(site: LabelSite, stem: number): Box {
  return { left: site.x - 1, top: site.y - stem, right: site.x + 1, bottom: site.y };
}

// Cutting a tag off at the top is worse than brushing another tag.
const OUT_OF_BOUNDS_WEIGHT = 4;

/**
 * Nearest sites (lowest on screen) are placed first and get the shortest
 * stems, so the tags read front-to-back as they rise. Each tag takes the
 * shortest stem whose tag clears every placed tag and stem, and whose own
 * stem doesn't run through a placed tag — except sites sharing one spot,
 * whose tags simply stack up a single shared pole. Returned in placement
 * order.
 */
export function placeLabels(sites: LabelSite[], options: LabelLayoutOptions): PlacedLabel[] {
  const { baseGap, step, tries, margin, minTop = -Infinity } = options;
  const placed: { label: PlacedLabel; box: Box; stemBox: Box }[] = [];
  const ordered = [...sites].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const site of ordered) {
    let best: { stem: number; box: Box; stemBox: Box; overlap: number } | null = null;
    for (let i = 0; i < tries; i++) {
      const stem = site.height + baseGap + i * step;
      const box = boxFor(site, stem);
      const stemBox = stemBoxFor(site, stem);
      let overlap = box.top < minTop ? (minTop - box.top) * site.width * OUT_OF_BOUNDS_WEIGHT : 0;
      for (const p of placed) {
        overlap += overlapArea(box, p.box, margin);
        if (Math.abs(p.label.x - site.x) >= 2) {
          overlap += overlapArea(box, p.stemBox, margin) + overlapArea(stemBox, p.box, margin);
        }
      }
      if (!best || overlap < best.overlap) best = { stem, box, stemBox, overlap };
      if (overlap === 0) break;
    }
    // tries >= 1 always yields a candidate.
    placed.push({ label: { ...site, stem: best!.stem }, box: best!.box, stemBox: best!.stemBox });
  }
  return placed.map((p) => p.label);
}
