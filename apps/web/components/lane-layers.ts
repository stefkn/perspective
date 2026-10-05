import type { Layer } from "@deck.gl/core";
import { LineLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import {
  yearToCoord,
  coordToYear,
  timeOffset,
  type Orientation,
  type Scale,
} from "../lib/time-transform";
import {
  assignIntervalLanes,
  fractionToPerp,
  laneOffset,
  valueToFraction,
  type AssignedInterval,
  type Interval,
  type LaneBand,
  type LaneDefinition,
  type LaneId,
  type SeriesData,
} from "../lib/lanes";
import {
  POPULATION,
  POPULATION_MIN,
  POPULATION_MAX,
  formatPopulation,
  CO2,
  CO2_MIN,
  CO2_MAX,
  formatCO2,
  LIFE_EXPECTANCY,
  LIFE_EXPECTANCY_MIN,
  LIFE_EXPECTANCY_MAX,
  formatLifeExpectancy,
  GDP,
  GDP_MIN,
  GDP_MAX,
  formatGDP,
  interpolateSeries,
} from "../lib/datasets";
import {
  ENERGY,
  ENERGY_MIN,
  ENERGY_MAX,
  ENERGY_SOURCES,
  formatEnergy,
  type EnergyPoint,
} from "../lib/energy";
import { PERIODS, POWERS, PEOPLE, WARS, CULTURE } from "../lib/entities-data";
import type { AggregateInfo, EntityDetail } from "../lib/types";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "ui-sans-serif, system-ui, -apple-system, sans-serif";

const LANE_TITLE_COLOR: [number, number, number, number] = [138, 147, 166, 220];

const PERIOD_FILL: [number, number, number, number] = [118, 158, 220, 34];
const PERIOD_STROKE: [number, number, number, number] = [150, 190, 240, 90];
const PERIOD_LABEL: [number, number, number, number] = [176, 200, 232, 220];

const POWERS_FILL: [number, number, number, number] = [86, 200, 178, 30];
const POWERS_STROKE: [number, number, number, number] = [120, 222, 202, 90];
const POWERS_LABEL: [number, number, number, number] = [140, 222, 208, 220];

const PEOPLE_FILL: [number, number, number, number] = [214, 150, 236, 36];
const PEOPLE_STROKE: [number, number, number, number] = [222, 172, 240, 120];
const PEOPLE_LABEL: [number, number, number, number] = [226, 190, 242, 220];
const PEOPLE_EST_FILL: [number, number, number, number] = [214, 150, 236, 12];
const PEOPLE_EST_STROKE: [number, number, number, number] = [222, 172, 240, 180];

const CULTURE_FILL: [number, number, number, number] = [240, 180, 90, 36];
const CULTURE_STROKE: [number, number, number, number] = [244, 196, 122, 120];
const CULTURE_LABEL: [number, number, number, number] = [246, 210, 150, 220];
const CULTURE_EST_FILL: [number, number, number, number] = [240, 180, 90, 12];
const CULTURE_EST_STROKE: [number, number, number, number] = [244, 196, 122, 180];

const WARS_FILL: [number, number, number, number] = [226, 110, 110, 34];
const WARS_STROKE: [number, number, number, number] = [238, 138, 138, 110];
const WARS_LABEL: [number, number, number, number] = [240, 158, 158, 220];
const WARS_EST_FILL: [number, number, number, number] = [226, 110, 110, 12];
const WARS_EST_STROKE: [number, number, number, number] = [238, 138, 138, 170];

const PERIOD_THICKNESS = 8;
const POWERS_THICKNESS = 8;
const PEOPLE_THICKNESS = 6;
const CULTURE_THICKNESS = 6;
const WARS_THICKNESS = 6;

const DASH_EXTENSION = new PathStyleExtension({ dash: true });
const INTERVAL_BAND: LaneBand = { center: 0, half: 0 };

// Progressive disclosure: a lane renders individual (named) bands and collapses
// the remaining visible intervals into a single "~n+ more" block. Order of
// significance decides which intervals stay individual, and intervals too thin
// to read always collapse regardless of significance. The number of kept bands
// is also bounded by how many fit in the lane's perpendicular half (see below),
// so this is only the absolute ceiling.
const BUDGET_BANDS = 40;
// How many collapsed titles the "~n+ more" block carries for its hover tooltip.
const MORE_NAMES_HINT = 3;

// Lane assignment depends only on each interval's start/end year, so it is
// computed once at module load instead of re-sorting thousands of intervals on
// every zoom/pan frame.
const PEOPLE_ASSIGNED = assignIntervalLanes(PEOPLE);
const POWERS_ASSIGNED = assignIntervalLanes(POWERS);
const CULTURE_ASSIGNED = assignIntervalLanes(CULTURE);
const WARS_ASSIGNED = assignIntervalLanes(WARS);
const PERIODS_ASSIGNED = assignIntervalLanes(PERIODS);

type Anchor = "start" | "middle" | "end";
type Baseline = "top" | "center" | "bottom";

interface LaneLabel {
  position: [number, number, number];
  text: string;
  anchor: Anchor;
  baseline: Baseline;
  color?: [number, number, number, number];
  detail?: EntityDetail;
  aggregate?: AggregateInfo;
}

// Choose an anchor that keeps a label from spilling off the edge of the screen.
function laneLabelAnchor(
  orientation: Orientation,
  side: -1 | 1,
  atNow: boolean,
): { anchor: Anchor; baseline: Baseline } {
  if (orientation === "horizontal") {
    return { anchor: atNow ? "end" : "start", baseline: "center" };
  }
  return { anchor: side === -1 ? "start" : "end", baseline: "center" };
}

// Time coordinate for a lane title: sticks to the deep-past edge of the
// visible viewport so the label stays on screen while zoomed into recent
// history, instead of scrolling away with the timeline's start.
function titleTimeCoord(
  coordExtent: [number, number],
  visibleCoordRange?: [number, number],
): number {
  return visibleCoordRange
    ? Math.max(coordExtent[0], visibleCoordRange[0])
    : coordExtent[0];
}

// Geometry of the sticky time ruler drawn by Timeline.tsx. It is pinned to the
// low edge of the visible perpendicular range: the top of the screen when
// horizontal (+Y is down) and the left edge when vertical (+X is right), which
// keeps it clear of the event detail panel and minimap anchored at the bottom.
// Lane titles clamped to that same edge have to clear the ruler's tick labels,
// so that edge reserves a wider inset than the opposite one.
export const STICKY_RULER_INSET = 8;
export const STICKY_RULER_LABEL_OFFSET = 8;
// Ruler labels start at inset + offset and run ~11px, so titles on the same
// edge need to start beyond that to keep a readable gap rather than just
// clearing the glyphs by a pixel.
export const STICKY_RULER_RESERVE = 40;

// Perpendicular coordinate for a lane title: clamps to the visible viewport so
// the label for an outermost lane stays on screen instead of slipping past the
// screen edge when the lane stack overflows.
function titlePerpCoord(
  perp: number,
  visiblePerpRange?: [number, number],
): number {
  if (!visiblePerpRange) return perp;
  return Math.min(
    Math.max(perp, visiblePerpRange[0] + STICKY_RULER_RESERVE),
    visiblePerpRange[1] - 8,
  );
}

export interface LaneOptions {
  orientation: Orientation;
  scale: Scale;
  coordExtent: [number, number];
  timeZoom: number;
  visibleCoordRange?: [number, number];
  visiblePerpRange?: [number, number];
}

interface IntervalBandOptions<T extends Interval = Interval> {
  id: string;
  assigned: AssignedInterval<T>[];
  orientation: Orientation;
  scale: Scale;
  coordExtent: [number, number];
  band: LaneBand;
  thickness: number;
  timeZoom: number;
  fillColor: [number, number, number, number];
  strokeColor: [number, number, number, number];
  labelColor: [number, number, number, number];
  estimateFillColor?: [number, number, number, number];
  estimateStrokeColor?: [number, number, number, number];
  dashedEstimated?: boolean;
  title?: string;
  unitNoun?: string;
  visibleCoordRange?: [number, number];
  visiblePerpRange?: [number, number];
}

interface IntervalLabelCandidate {
  id: string;
  text: string;
  coord: number;
  perp: number;
  interval: Interval;
  significance: number;
}

interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const INTERVAL_LABEL_FONT = 11;
const INTERVAL_LABEL_HEIGHT = 13;
// Minimum on-screen band width before a label is shown. Labels are centered
// on the band and may overflow it (staggering + leader lines keep them
// legible), so the band only needs to be a visible anchor, not wide enough
// to contain the title.
const MIN_BAND_LABEL_PX = 6;
const STAGGER_STEP = 14;
const STAGGER_MAX_STEPS = 6;
const LEADER_LINE_MIN_PX = 24;
const SMOOTH_FACTOR = 0.3;

// Remembers each label's current smoothed offset (in screen px) so it sticks
// to its slot and glides toward a new one instead of flickering between
// equally valid positions. Keyed by stable label id; the small set keeps this
// bounded.
const labelOffsetCache = new Map<string, [number, number]>();

// Candidate (time-px, perp-px) offsets ordered by distance from the home slot,
// so labels first try to sit still, then nudge along either axis, then both.
const STAGGER_CANDIDATES: [number, number][] = (() => {
  const offsets: [number, number][] = [];
  for (let di = -STAGGER_MAX_STEPS; di <= STAGGER_MAX_STEPS; di++) {
    for (let dj = -STAGGER_MAX_STEPS; dj <= STAGGER_MAX_STEPS; dj++) {
      offsets.push([di * STAGGER_STEP, dj * STAGGER_STEP]);
    }
  }
  offsets.sort(
    (a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]),
  );
  return offsets;
})();

let intervalMeasureCtx: CanvasRenderingContext2D | null = null;
const intervalWidthCache = new Map<string, number>();

function measureIntervalLabel(text: string): number {
  const cached = intervalWidthCache.get(text);
  if (cached !== undefined) return cached;
  let width = text.length * 6.6;
  if (typeof document !== "undefined") {
    if (!intervalMeasureCtx) {
      const canvas = document.createElement("canvas");
      intervalMeasureCtx = canvas.getContext("2d");
    }
    if (intervalMeasureCtx) {
      intervalMeasureCtx.font = `${INTERVAL_LABEL_FONT}px ${SANS}`;
      width = intervalMeasureCtx.measureText(text).width;
    }
  }
  intervalWidthCache.set(text, width);
  return width;
}

function boxesOverlap(a: ScreenBox, b: ScreenBox): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

// Approximate on-screen box for a label at the given time/perp position, in
// relative px. Horizontal: time runs along X and the text is centered on the
// span. Vertical: time runs along Y and the text sits to the right of the band.
function intervalLabelBox(
  label: IntervalLabelCandidate,
  coord: number,
  perp: number,
  orientation: Orientation,
  timeScale: number,
): ScreenBox {
  const w = measureIntervalLabel(label.text);
  const h = INTERVAL_LABEL_HEIGHT;
  if (orientation === "horizontal") {
    return { x: coord * timeScale - w / 2, y: perp - h / 2, w, h };
  }
  return { x: perp, y: coord * timeScale - h / 2, w, h };
}

function boxWithin(box: ScreenBox, vp: ScreenBox): boolean {
  return (
    box.x >= vp.x &&
    box.y >= vp.y &&
    box.x + box.w <= vp.x + vp.w &&
    box.y + box.h <= vp.y + vp.h
  );
}

// The visible viewport as a relative-px box, used to keep labels on screen.
function viewportBox(
  orientation: Orientation,
  timeScale: number,
  timeRange: [number, number],
  perpRange: [number, number],
): ScreenBox {
  const [vMin, vMax] = timeRange;
  const [pMin, pMax] = perpRange;
  if (orientation === "horizontal") {
    return {
      x: vMin * timeScale,
      y: pMin,
      w: (vMax - vMin) * timeScale,
      h: pMax - pMin,
    };
  }
  return {
    x: pMin,
    y: vMin * timeScale,
    w: pMax - pMin,
    h: (vMax - vMin) * timeScale,
  };
}

// Half of a label's extent along the time axis, in coord units. Horizontal
// labels carry their text width along time; vertical labels carry their fixed
// pixel line height along time.
function labelTimeHalfExtent(
  text: string,
  orientation: Orientation,
  timeScale: number,
): number {
  if (orientation === "horizontal") {
    return measureIntervalLabel(text) / (2 * timeScale);
  }
  return INTERVAL_LABEL_HEIGHT / (2 * timeScale);
}

// Best-effort staggering: nudge labels that overlap on screen apart along both
// axes, trying the nearest in-viewport free slots first. Each label's offset is
// smoothed toward its target so placements glide instead of flickering while
// zooming, and the previous offset is preferred so slots stay sticky.
function staggerIntervalLabels(
  labels: IntervalLabelCandidate[],
  orientation: Orientation,
  timeScale: number,
  viewport: ScreenBox | null,
): { coord: number; perp: number }[] {
  const result = labels.map((l) => ({ coord: l.coord, perp: l.perp }));
  if (labels.length === 0) return result;

  const order = labels
    .map((l, i) => ({ i, t: l.coord }))
    .sort((a, b) => a.t - b.t);

  const candidates = STAGGER_CANDIDATES.slice(1);
  const placed: { box: ScreenBox }[] = [];

  const boxFor = (label: IntervalLabelCandidate, offset: [number, number]) =>
    intervalLabelBox(
      label,
      label.coord + offset[0] / timeScale,
      label.perp + offset[1],
      orientation,
      timeScale,
    );

  const fitsIn = (box: ScreenBox) =>
    (!viewport || boxWithin(box, viewport)) &&
    !placed.some((p) => boxesOverlap(p.box, box));

  for (const { i } of order) {
    const label = labels[i];
    const current = labelOffsetCache.get(label.id) ?? [0, 0];

    let target: [number, number] = [0, 0];
    if (fitsIn(boxFor(label, [0, 0]))) {
      target = [0, 0];
    } else if (
      (current[0] !== 0 || current[1] !== 0) &&
      fitsIn(boxFor(label, current))
    ) {
      target = current;
    } else {
      for (const offset of candidates) {
        if (fitsIn(boxFor(label, offset))) {
          target = offset;
          break;
        }
      }
    }

    const next: [number, number] = [
      current[0] + (target[0] - current[0]) * SMOOTH_FACTOR,
      current[1] + (target[1] - current[1]) * SMOOTH_FACTOR,
    ];
    if (Math.abs(next[0] - target[0]) < 0.75) next[0] = target[0];
    if (Math.abs(next[1] - target[1]) < 0.75) next[1] = target[1];

    const box = boxFor(label, next);
    placed.push({ box });
    result[i] = {
      coord: label.coord + next[0] / timeScale,
      perp: label.perp + next[1],
    };
    labelOffsetCache.set(label.id, next);
  }

  return result;
}

// Build an EntityDetail for the info box from an interval.
function intervalDetail(interval: Interval): EntityDetail {
  return {
    id: interval.id,
    title: interval.title,
    description: interval.description ?? "",
    significance: interval.significance,
    wikipediaUrl: interval.wikipediaUrl ?? null,
    startYear: interval.startYear,
    endYear: interval.endYear,
    estimated: interval.estimated,
  };
}

// Axis-aligned rectangle for a band spanning [c0, c1] along time at `perp`.
function bandPolygon(
  c0: number,
  c1: number,
  perp: number,
  thickness: number,
  orientation: Orientation,
): [number, number][] {
  const t = thickness / 2;
  if (orientation === "horizontal") {
    return [
      [c0, perp - t],
      [c1, perp - t],
      [c1, perp + t],
      [c0, perp + t],
    ];
  }
  const y0 = -c1;
  const y1 = -c0;
  return [
    [perp - t, y0],
    [perp + t, y0],
    [perp + t, y1],
    [perp - t, y1],
  ];
}

// Stable repack: time-ordered greedy exactly like assignIntervalLanes, but a
// survivor keeps its previous sub-lane whenever that lane is still
// conflict-free, instead of always taking the lowest free lane. Panning only
// changes the kept set at the viewport edges, so survivors overwhelmingly
// keep their lanes and on-screen bands stop reshuffling. Pure — the caller
// carries `prevLanes` (interval id → lane) across frames.
export function assignStableLanes<T extends Interval>(
  intervals: T[],
  prevLanes: Map<string, number> | null,
): AssignedInterval<T>[] {
  const sorted = [...intervals].sort(
    (a, b) => a.startYear - b.startYear || a.endYear - b.endYear,
  );

  const laneEnds: number[] = [];
  const result: AssignedInterval<T>[] = [];

  for (const interval of sorted) {
    const prev = prevLanes?.get(interval.id);
    let lane: number;
    if (
      prev !== undefined &&
      Number.isInteger(prev) &&
      prev >= 0 &&
      prev < intervals.length &&
      (laneEnds[prev] === undefined || laneEnds[prev] <= interval.startYear)
    ) {
      lane = prev;
    } else {
      lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > interval.startYear) {
        lane++;
      }
    }
    while (laneEnds.length <= lane) laneEnds.push(-Infinity);
    laneEnds[lane] = interval.endYear;
    result.push({ interval, lane });
  }

  return result;
}

// Build stacked interval bands (polygons + labels) for a lane or the main axis.
export interface KeptCandidate {
  id: string;
  readable: boolean;
}

// Extra significance ranks a previously kept interval may hold past the
// budget before it collapses. Newcomers need rank < budget to appear, while
// incumbents survive until rank > budget + slack, so slow pans (where ranks
// drift by one or two at the viewport edges) don't churn the kept set every
// frame. The kept set can transiently exceed the budget by ~slack bands.
export const KEPT_BUDGET_SLACK = 6;

// Membership hysteresis for progressive disclosure. `cands` must be in
// significance order (highest first); `prevKept` is the previous frame's kept
// ids (null on the first frame). Pure — the caller owns `prevKept`.
export function selectKeptIds(
  cands: KeptCandidate[],
  prevKept: Set<string> | null,
  budget: number,
  slack: number,
): Set<string> {
  const kept = new Set<string>();
  let count = 0;
  for (const c of cands) {
    if (!c.readable) continue;
    const limit = prevKept?.has(c.id) ? budget + slack : budget;
    if (count < limit) {
      kept.add(c.id);
    }
    count++;
  }
  return kept;
}

// Previous frame's kept ids per lane-band id, feeding selectKeptIds.
const keptMemory = new Map<string, Set<string>>();

// Previous frame's packed sub-lanes per lane-band id, feeding
// assignStableLanes. Replaced wholesale each build, so no pruning needed.
const laneMemory = new Map<string, Map<string, number>>();

// Displayed "~n+ more" counts, per lane-band id. The true hidden count ticks
// with every interval crossing the viewport edge while panning, so the label
// is only refreshed once it has drifted past a ratio threshold — occasional
// meaningful updates instead of a flickering counter. The "~" prefix already
// marks it approximate.
const moreDisplayCache = new Map<string, number>();
const MORE_COUNT_UPDATE_RATIO = 0.12;

export function displayedMoreCount(
  laneId: string,
  truth: number,
): number {
  const prev = moreDisplayCache.get(laneId);
  let shown = truth;
  if (prev !== undefined && prev > 0) {
    const drift = Math.abs(truth - prev) / prev;
    if (drift < MORE_COUNT_UPDATE_RATIO) shown = prev;
  }
  moreDisplayCache.set(laneId, shown);
  return shown;
}

// Test hook: drop displayed-count state.
export function resetMoreCounts(): void {
  moreDisplayCache.clear();
}

export function buildIntervalBands<T extends Interval = Interval>(
  opts: IntervalBandOptions<T>,
): Layer[] {
  const {
    id,
    assigned,
    orientation,
    scale,
    coordExtent,
    band,
    thickness,
    timeZoom,
    fillColor,
    strokeColor,
    labelColor,
    estimateFillColor,
    estimateStrokeColor,
    dashedEstimated,
    title,
    unitNoun,
    visibleCoordRange,
    visiblePerpRange,
  } = opts;

  const timeScale = Math.pow(2, timeZoom);
  const offset = (coord: number, perp: number) =>
    timeOffset(coord, perp, orientation);

  const estimateFill = estimateFillColor ?? fillColor;
  const estimateStroke = estimateStrokeColor ?? strokeColor;

  // Single pass over the (pre-assigned) intervals: cull to the viewport and
  // compute geometry once. Significance ordering happens in the split below.
  const visible: {
    interval: T;
    c0: number;
    c1: number;
  }[] = [];
  for (const { interval } of assigned) {
    const c0 = yearToCoord(interval.startYear, scale);
    const c1 = yearToCoord(interval.endYear, scale);
    if (visibleCoordRange) {
      const [vMin, vMax] = visibleCoordRange;
      if (c1 < vMin || c0 > vMax) continue;
    }
    visible.push({ interval, c0, c1 });
  }

  // Progressive disclosure: keep the most significant intervals that are wide
  // enough to read as individual bands; collapse the rest into one "~n+ more"
  // block. The budget is bounded by how many stacked sub-lanes actually fit
  // inside the lane's perpendicular half, so the kept bands don't spill off
  // screen. The always-on period band (half = 0) is unbounded and never
  // collapses (its sub-pixel spans are just dropped rather than summarized).
  const collapsible = band.half > 0;
  const capacity = Math.max(2, 2 * (Math.floor((band.half - thickness - 6) / 16) + 1));
  const budget = collapsible
    ? Math.min(capacity, BUDGET_BANDS, Math.max(2, Math.floor(band.half / 8)))
    : Infinity;

  const sorted = [...visible].sort(
    (a, b) => (b.interval.significance ?? 0) - (a.interval.significance ?? 0),
  );

  // Kept-set hysteresis: incumbents survive a few ranks past the budget, so
  // the re-pack below sees a stable input while panning and surviving bands
  // keep their sub-lanes instead of reshuffling.
  const prevKept = keptMemory.get(id) ?? null;
  const keptIds = selectKeptIds(
    sorted.map((v) => ({
      id: v.interval.id,
      readable: (v.c1 - v.c0) * timeScale >= MIN_BAND_LABEL_PX,
    })),
    prevKept,
    budget,
    collapsible ? Math.min(KEPT_BUDGET_SLACK, Math.max(0, capacity - budget)) : 0,
  );
  if (collapsible) keptMemory.set(id, keptIds);

  const individual: typeof visible = [];
  const collapsed: typeof visible = [];
  for (const v of sorted) {
    if (keptIds.has(v.interval.id)) individual.push(v);
    else if (collapsible) collapsed.push(v);
  }

  // Re-pack the kept intervals into a compact swimlane (time-ordered) so they
  // stack tightly instead of keeping their scattered sub-lane indices from the
  // full, pre-assigned set. Packing is order-stable: survivors keep their
  // previous sub-lane whenever it is still conflict-free, so the edge
  // enter/exit churn of panning doesn't reshuffle on-screen bands.
  const prevLaneMap = (collapsible ? laneMemory.get(id) : null) ?? null;
  const laneById = new Map<string, number>();
  for (const { interval, lane } of assignStableLanes(
    individual.map((v) => v.interval),
    prevLaneMap,
  )) {
    laneById.set(interval.id, lane);
  }
  if (collapsible) laneMemory.set(id, laneById);

  // Use the collision-free packed positions directly. Interpolating only on
  // layer rebuilds can leave bands overlapping when the viewport stops moving.
  const packedOffset = (intervalId: string) =>
    band.center + laneOffset(laneById.get(intervalId) ?? 0, thickness);

  // Individual bands (full color, stacked into sub-lanes).
  const bandData = individual.map(({ interval, c0, c1 }) => {
    const off = packedOffset(interval.id);
    return {
      polygon: bandPolygon(c0, c1, off, thickness, orientation),
      estimated: interval.estimated,
    };
  });

  const viewport =
    visibleCoordRange && visiblePerpRange
      ? viewportBox(orientation, timeScale, visibleCoordRange, visiblePerpRange)
      : null;

  const labelCandidates: IntervalLabelCandidate[] = [];
  for (const { interval, c0, c1 } of individual) {
    const displayTitle = interval.estimated
      ? `≈ ${interval.title}`
      : interval.title;

    // Clamp the label's time position inside the viewport so a band whose
    // midpoint is off-screen still anchors its label to the visible edge.
    let coord = (c0 + c1) / 2;
    if (visibleCoordRange) {
      const [vMin, vMax] = visibleCoordRange;
      const halfExt = labelTimeHalfExtent(displayTitle, orientation, timeScale);
      const lo = vMin + halfExt;
      const hi = vMax - halfExt;
      coord = lo >= hi ? (vMin + vMax) / 2 : Math.min(Math.max(coord, lo), hi);
    }

    const off = packedOffset(interval.id);
    labelCandidates.push({
      id: `${id}:${interval.id}`,
      text: displayTitle,
      coord,
      perp: orientation === "horizontal" ? off : off + thickness / 2 + 5,
      interval,
      significance: interval.significance ?? 0,
    });
  }

  const placedLabels = staggerIntervalLabels(
    labelCandidates,
    orientation,
    timeScale,
    viewport,
  );

  const anchor: Anchor = orientation === "horizontal" ? "middle" : "start";

  const labelData: LaneLabel[] = labelCandidates.map((label, i) => ({
    position: offset(placedLabels[i].coord, placedLabels[i].perp),
    text: label.text,
    anchor,
    baseline: "center",
    color: labelColor,
    detail: intervalDetail(label.interval),
  }));

  const leaderLines = labelCandidates.flatMap((label, i) => {
    const p = placedLabels[i];
    const dt = (p.coord - label.coord) * timeScale;
    const dp = p.perp - label.perp;
    if (Math.hypot(dt, dp) < LEADER_LINE_MIN_PX) return [];
    return [
      {
        source: offset(label.coord, label.perp),
        target: offset(p.coord, p.perp),
      },
    ];
  });

  // A single "~n+ more" summary block for the collapsed intervals. Bucketing
  // the hidden set into per-screen-slice chips produced a strip of "+n" blocks
  // whose counts flickered on every scroll, so instead one contiguous block
  // spans the visible stretch where entities are being hidden. It is pickable
  // (tap to zoom to that stretch, hover for a tooltip).
  const moreBandData: {
    polygon: [number, number][];
    aggregate: AggregateInfo;
  }[] = [];
  const moreLabelData: LaneLabel[] = [];
  if (collapsed.length > 0) {
    // Clamp to the viewport, not the collapsed intervals' full span: at deep
    // zoom a visible lifespan still spans decades of coordinates, and the
    // summary belongs to what is on screen.
    let lo: number;
    let hi: number;
    if (visibleCoordRange) {
      lo = visibleCoordRange[0];
      hi = visibleCoordRange[1];
    } else {
      lo = Infinity;
      hi = -Infinity;
      for (const v of collapsed) {
        if (v.c0 < lo) lo = v.c0;
        if (v.c1 > hi) hi = v.c1;
      }
    }

    let stripLo = Infinity;
    let stripHi = -Infinity;
    for (const v of collapsed) {
      stripLo = Math.min(stripLo, Math.max(v.c0, lo));
      stripHi = Math.max(stripHi, Math.min(v.c1, hi));
    }
    if (stripHi > stripLo) {
      // Sit the summary strip at the lane's outer edge (furthest from the main
      // axis), leaving the named-band swimlane clear toward the axis.
      const off = fractionToPerp(1, band);

      // Most significant hidden titles first, for the hover tooltip.
      const best = new Map<string, number>();
      for (const v of collapsed) {
        const sig = v.interval.significance ?? 0;
        const prev = best.get(v.interval.title);
        if (prev == null || sig > prev) best.set(v.interval.title, sig);
      }
      const names = [...best.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, MORE_NAMES_HINT)
        .map(([title]) => title);

      const aggregate: AggregateInfo = {
        startYear: coordToYear(stripLo, scale),
        endYear: coordToYear(stripHi, scale),
        count: displayedMoreCount(id, collapsed.length),
        names,
        unitNoun,
      };

      moreBandData.push({
        polygon: bandPolygon(stripLo, stripHi, off, thickness, orientation),
        aggregate,
      });
      moreLabelData.push({
        position: offset(
          (stripLo + stripHi) / 2,
          orientation === "horizontal" ? off : off + thickness / 2 + 5,
        ),
        text: `~${aggregate.count.toLocaleString("en-US")}+ more`,
        anchor,
        baseline: "center",
        color: labelColor,
        aggregate,
      });
    }
  }

  const leaderColor: [number, number, number, number] = [
    labelColor[0],
    labelColor[1],
    labelColor[2],
    120,
  ];

  const layers: Layer[] = [
    new PolygonLayer({
      id: `${id}-bands`,
      data: bandData,
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: (d) => (d.estimated ? estimateFill : fillColor),
      stroked: true,
      getLineColor: (d) => (d.estimated ? estimateStroke : strokeColor),
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      pickable: false,
      extensions: dashedEstimated ? [DASH_EXTENSION] : [],
      getDashArray: dashedEstimated
        ? (d: { estimated?: boolean }) =>
            d.estimated
              ? ([6, 4] as [number, number])
              : ([0, 0] as [number, number])
        : undefined,
      parameters: { depthTest: false },
    }),
    new LineLayer({
      id: `${id}-leader-lines`,
      data: leaderLines,
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      getColor: leaderColor,
      widthUnits: "pixels",
      getWidth: 1,
      pickable: false,
      parameters: { depthTest: false },
    }),
    new TextLayer({
      id: `${id}-labels`,
      data: labelData,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getTextAnchor: (d) => d.anchor,
      getAlignmentBaseline: (d) => d.baseline,
      getColor: (d) => d.color ?? labelColor,
      sizeUnits: "pixels",
      getSize: 11,
      fontFamily: SANS,
      characterSet: "auto",
      pickable: true,
      parameters: { depthTest: false },
    }),
    new PolygonLayer({
      id: `${id}-more-bands`,
      data: moreBandData,
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: [fillColor[0], fillColor[1], fillColor[2], 30],
      stroked: true,
      getLineColor: [strokeColor[0], strokeColor[1], strokeColor[2], 140],
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      pickable: true,
      extensions: [DASH_EXTENSION],
      getDashArray: [4, 4] as [number, number],
      parameters: { depthTest: false },
    }),
    new TextLayer({
      id: `${id}-more-labels`,
      data: moreLabelData,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getTextAnchor: (d) => d.anchor,
      getAlignmentBaseline: (d) => d.baseline,
      getColor: (d) => d.color ?? labelColor,
      sizeUnits: "pixels",
      getSize: 10,
      fontFamily: MONO,
      characterSet: "auto",
      pickable: true,
      parameters: { depthTest: false },
    }),
  ];

  if (title) {
    const side = band.center >= 0 ? 1 : -1;
    const titleAnchor = laneLabelAnchor(orientation, side, false);
    const titleText = `${title} · ${assigned.length.toLocaleString("en-US")}`;
    layers.push(
      new TextLayer({
        id: `${id}-title`,
        data: [{ title: titleText }],
        getPosition: () =>
          timeOffset(
            titleTimeCoord(coordExtent, visibleCoordRange),
            titlePerpCoord(fractionToPerp(1, band) + side * 8, visiblePerpRange),
            orientation,
          ),
        getText: (d) => d.title,
        getTextAnchor: titleAnchor.anchor,
        getAlignmentBaseline: titleAnchor.baseline,
        getColor: LANE_TITLE_COLOR,
        sizeUnits: "pixels",
        getSize: 11,
        fontFamily: MONO,
        pickable: false,
        parameters: { depthTest: false },
      }),
    );
  }

  return layers;
}

interface SeriesLaneData {
  data: SeriesData;
  min: number;
  max: number;
  format: (value: number) => string;
}

const SERIES_DATA: Record<string, SeriesLaneData> = {
  population: {
    data: POPULATION,
    min: POPULATION_MIN,
    max: POPULATION_MAX,
    format: formatPopulation,
  },
  co2: { data: CO2, min: CO2_MIN, max: CO2_MAX, format: formatCO2 },
  "life-expectancy": {
    data: LIFE_EXPECTANCY,
    min: LIFE_EXPECTANCY_MIN,
    max: LIFE_EXPECTANCY_MAX,
    format: formatLifeExpectancy,
  },
  gdp: { data: GDP, min: GDP_MIN, max: GDP_MAX, format: formatGDP },
};

function buildSeriesLane(
  cfg: SeriesLaneData & {
    id: string;
    title: string;
    color: [number, number, number];
    band: LaneBand;
    orientation: Orientation;
    scale: Scale;
    coordExtent: [number, number];
    visibleCoordRange?: [number, number];
    visiblePerpRange?: [number, number];
  },
): Layer[] {
  const {
    id,
    title,
    color,
    data,
    min,
    max,
    format,
    band,
    orientation,
    scale,
    coordExtent,
    visibleCoordRange,
    visiblePerpRange,
  } = cfg;
  const side = band.center >= 0 ? 1 : -1;

  const perpFor = (value: number) =>
    fractionToPerp(valueToFraction(value, min, max, scale), band);

  // Leading estimated points (before the first measured year) are drawn as a
  // dashed extrapolation; everything from the first measured point onward is
  // the solid, filled series.
  const firstRealIndex = data.findIndex((p) => !p.estimated);
  const realPoints = firstRealIndex > 0 ? data.slice(firstRealIndex) : data;
  const estimatedPoints =
    firstRealIndex > 0 ? [...data.slice(0, firstRealIndex), realPoints[0]] : [];

  const path: [number, number, number][] = realPoints.map((p) =>
    timeOffset(yearToCoord(p.year, scale), perpFor(p.value), orientation),
  );
  const estimatedPath: [number, number, number][] = estimatedPoints.map((p) =>
    timeOffset(yearToCoord(p.year, scale), perpFor(p.value), orientation),
  );

  const xy = (coord: number, perp: number): [number, number] => {
    const [x, y] = timeOffset(coord, perp, orientation);
    return [x, y];
  };

  const baseline = fractionToPerp(0, band);
  const areaPolygon: [number, number][] = [
    xy(yearToCoord(realPoints[0].year, scale), baseline),
    ...realPoints.map((p) => xy(yearToCoord(p.year, scale), perpFor(p.value))),
    xy(yearToCoord(realPoints[realPoints.length - 1].year, scale), baseline),
  ];

  const outerPerp = fractionToPerp(1, band);
  const innerPerp = fractionToPerp(0, band);

  const lineColor: [number, number, number, number] = [
    color[0],
    color[1],
    color[2],
    230,
  ];
  const areaColor: [number, number, number, number] = [
    color[0],
    color[1],
    color[2],
    28,
  ];
  const estimateColor: [number, number, number, number] = [
    color[0],
    color[1],
    color[2],
    170,
  ];

  const titleAnchor = laneLabelAnchor(orientation, side, false);
  const maxAnchor = laneLabelAnchor(orientation, side, true);
  const minAnchor = laneLabelAnchor(orientation, side, false);

  const labels: LaneLabel[] = [
    {
      position: timeOffset(
        titleTimeCoord(coordExtent, visibleCoordRange),
        titlePerpCoord(outerPerp + side * 8, visiblePerpRange),
        orientation,
      ),
      text: title,
      anchor: titleAnchor.anchor,
      baseline: titleAnchor.baseline,
    },
    {
      position: timeOffset(
        yearToCoord(realPoints[realPoints.length - 1].year, scale),
        outerPerp + side * 8,
        orientation,
      ),
      text: format(max),
      anchor: maxAnchor.anchor,
      baseline: maxAnchor.baseline,
    },
    {
      position: timeOffset(
        yearToCoord(realPoints[0].year, scale),
        innerPerp - side * 8,
        orientation,
      ),
      text: format(min),
      anchor: minAnchor.anchor,
      baseline: minAnchor.baseline,
    },
  ];

  return [
    new PolygonLayer({
      id: `${id}-area`,
      data: [{ polygon: areaPolygon }],
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: areaColor,
      pickable: false,
      parameters: { depthTest: false },
    }),
    new PathLayer({
      id: `${id}-line`,
      data: [{ path }],
      getPath: (d) => d.path,
      getColor: lineColor,
      widthUnits: "pixels",
      getWidth: 2,
      pickable: false,
      parameters: { depthTest: false },
    }),
    ...(estimatedPath.length
      ? [
          new PathLayer({
            id: `${id}-estimated`,
            data: [{ path: estimatedPath }],
            getPath: (d) => d.path,
            getColor: estimateColor,
            widthUnits: "pixels",
            getWidth: 2,
            extensions: [DASH_EXTENSION],
            getDashArray: [6, 4] as [number, number],
            pickable: false,
            parameters: { depthTest: false },
          }),
        ]
      : []),
    new TextLayer({
      id: `${id}-labels`,
      data: labels,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getTextAnchor: (d) => d.anchor,
      getAlignmentBaseline: (d) => d.baseline,
      getColor: LANE_TITLE_COLOR,
      sizeUnits: "pixels",
      getSize: 11,
      fontFamily: MONO,
      pickable: false,
      parameters: { depthTest: false },
    }),
  ];
}

function buildEnergyLane(
  cfg: {
    band: LaneBand;
    orientation: Orientation;
    scale: Scale;
    coordExtent: [number, number];
    visibleCoordRange?: [number, number];
    visiblePerpRange?: [number, number];
  },
): Layer[] {
  const { band, orientation, scale, coordExtent, visibleCoordRange, visiblePerpRange } = cfg;
  const side = band.center >= 0 ? 1 : -1;

  const perpFor = (value: number) =>
    fractionToPerp(valueToFraction(value, ENERGY_MIN, ENERGY_MAX, scale), band);

  const totalOf = (p: EnergyPoint) =>
    ENERGY_SOURCES.reduce((sum, s) => sum + p.values[s.id], 0);

  const xy = (coord: number, perp: number): [number, number] => {
    const [x, y] = timeOffset(coord, perp, orientation);
    return [x, y];
  };

  const polygons: {
    polygon: [number, number][];
    fill: [number, number, number, number];
    line: [number, number, number, number];
  }[] = [];

  for (let si = 0; si < ENERGY_SOURCES.length; si++) {
    const source = ENERGY_SOURCES[si];
    for (let i = 0; i < ENERGY.length - 1; i++) {
      const a = ENERGY[i];
      const b = ENERGY[i + 1];
      let bottomA = 0;
      let bottomB = 0;
      for (let j = 0; j < si; j++) {
        bottomA += a.values[ENERGY_SOURCES[j].id];
        bottomB += b.values[ENERGY_SOURCES[j].id];
      }
      const topA = bottomA + a.values[source.id];
      const topB = bottomB + b.values[source.id];
      if (topA <= 0 && topB <= 0) continue;

      polygons.push({
        polygon: [
          xy(yearToCoord(a.year, scale), perpFor(topA)),
          xy(yearToCoord(b.year, scale), perpFor(topB)),
          xy(yearToCoord(b.year, scale), perpFor(bottomB)),
          xy(yearToCoord(a.year, scale), perpFor(bottomA)),
        ],
        fill: [source.color[0], source.color[1], source.color[2], 150],
        line: [source.color[0], source.color[1], source.color[2], 210],
      });
    }
  }

  // Extrapolated total back to the timeline's start, drawn as a dashed line
  // (every source in this dataset was ~0 before the industrial era).
  const firstRealIndex = ENERGY.findIndex((p) => !p.estimated);
  const estimatedEnergyPath: [number, number, number][] =
    firstRealIndex > 0
      ? [...ENERGY.slice(0, firstRealIndex), ENERGY[firstRealIndex]].map((p) =>
          timeOffset(yearToCoord(p.year, scale), perpFor(totalOf(p)), orientation),
        )
      : [];

  // Legend labels at the latest year, centered within each source's band.
  const last = ENERGY[ENERGY.length - 1];
  const lastCoord = yearToCoord(last.year, scale);
  const legendLabels: LaneLabel[] = [];
  let cumulative = 0;
  for (const source of ENERGY_SOURCES) {
    const bottom = cumulative;
    const top = bottom + last.values[source.id];
    cumulative = top;
    const bandHeight = Math.abs(perpFor(top) - perpFor(bottom));
    if (bandHeight < 9) continue;
    const anchor = laneLabelAnchor(orientation, side, true);
    legendLabels.push({
      position: timeOffset(lastCoord, perpFor((top + bottom) / 2), orientation),
      text: source.label,
      anchor: anchor.anchor,
      baseline: anchor.baseline,
      color: [source.color[0], source.color[1], source.color[2], 255],
    });
  }

  const outerPerp = fractionToPerp(1, band);
  const titleAnchor = laneLabelAnchor(orientation, side, false);
  const totalAnchor = laneLabelAnchor(orientation, side, true);
  const headerLabels: LaneLabel[] = [
    {
      position: timeOffset(
        titleTimeCoord(coordExtent, visibleCoordRange),
        titlePerpCoord(outerPerp + side * 8, visiblePerpRange),
        orientation,
      ),
      text: "Primary energy",
      anchor: titleAnchor.anchor,
      baseline: titleAnchor.baseline,
    },
    {
      position: timeOffset(lastCoord, outerPerp + side * 8, orientation),
      text: formatEnergy(ENERGY_MAX),
      anchor: totalAnchor.anchor,
      baseline: totalAnchor.baseline,
    },
  ];

  return [
    new PolygonLayer({
      id: "energy-bands",
      data: polygons,
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: (d) => d.fill,
      stroked: true,
      getLineColor: (d) => d.line,
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      pickable: false,
      parameters: { depthTest: false },
    }),
    ...(estimatedEnergyPath.length
      ? [
          new PathLayer({
            id: "energy-estimated",
            data: [{ path: estimatedEnergyPath }],
            getPath: (d) => d.path,
            getColor: [220, 220, 230, 170],
            widthUnits: "pixels",
            getWidth: 2,
            extensions: [DASH_EXTENSION],
            getDashArray: [6, 4] as [number, number],
            pickable: false,
            parameters: { depthTest: false },
          }),
        ]
      : []),
    new TextLayer({
      id: "energy-legend",
      data: legendLabels,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getTextAnchor: (d) => d.anchor,
      getAlignmentBaseline: (d) => d.baseline,
      getColor: (d) => d.color ?? LANE_TITLE_COLOR,
      sizeUnits: "pixels",
      getSize: 10,
      fontFamily: SANS,
      pickable: false,
      parameters: { depthTest: false },
    }),
    new TextLayer({
      id: "energy-labels",
      data: headerLabels,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getTextAnchor: (d) => d.anchor,
      getAlignmentBaseline: (d) => d.baseline,
      getColor: LANE_TITLE_COLOR,
      sizeUnits: "pixels",
      getSize: 11,
      fontFamily: MONO,
      pickable: false,
      parameters: { depthTest: false },
    }),
  ];
}

// Build the layers for a single toggleable lane.
export function buildLaneLayers(
  lane: LaneDefinition,
  band: LaneBand,
  opts: LaneOptions,
): Layer[] {
  if (lane.kind === "series") {
    const cfg = SERIES_DATA[lane.id];
    if (!cfg) return [];
    return buildSeriesLane({
      ...cfg,
      id: lane.id,
      title: lane.title,
      color: lane.color,
      band,
      ...opts,
    });
  }
  if (lane.kind === "stacked") {
    return buildEnergyLane({ band, ...opts });
  }
  if (lane.id === "people") {
    return buildIntervalBands({
      id: "people",
      assigned: PEOPLE_ASSIGNED,
      orientation: opts.orientation,
      scale: opts.scale,
      coordExtent: opts.coordExtent,
      band,
      thickness: PEOPLE_THICKNESS,
      timeZoom: opts.timeZoom,
      fillColor: PEOPLE_FILL,
      strokeColor: PEOPLE_STROKE,
      labelColor: PEOPLE_LABEL,
      estimateFillColor: PEOPLE_EST_FILL,
      estimateStrokeColor: PEOPLE_EST_STROKE,
      dashedEstimated: true,
      title: "Notable lifespans",
      unitNoun: "notable people",
      visibleCoordRange: opts.visibleCoordRange,
      visiblePerpRange: opts.visiblePerpRange,
    });
  }
  if (lane.id === "culture") {
    return buildIntervalBands({
      id: "culture",
      assigned: CULTURE_ASSIGNED,
      orientation: opts.orientation,
      scale: opts.scale,
      coordExtent: opts.coordExtent,
      band,
      thickness: CULTURE_THICKNESS,
      timeZoom: opts.timeZoom,
      fillColor: CULTURE_FILL,
      strokeColor: CULTURE_STROKE,
      labelColor: CULTURE_LABEL,
      estimateFillColor: CULTURE_EST_FILL,
      estimateStrokeColor: CULTURE_EST_STROKE,
      dashedEstimated: true,
      title: "Cultural works",
      unitNoun: "cultural works",
      visibleCoordRange: opts.visibleCoordRange,
      visiblePerpRange: opts.visiblePerpRange,
    });
  }
  if (lane.id === "wars") {
    return buildIntervalBands({
      id: "wars",
      assigned: WARS_ASSIGNED,
      orientation: opts.orientation,
      scale: opts.scale,
      coordExtent: opts.coordExtent,
      band,
      thickness: WARS_THICKNESS,
      timeZoom: opts.timeZoom,
      fillColor: WARS_FILL,
      strokeColor: WARS_STROKE,
      labelColor: WARS_LABEL,
      estimateFillColor: WARS_EST_FILL,
      estimateStrokeColor: WARS_EST_STROKE,
      dashedEstimated: true,
      title: "Wars",
      unitNoun: "wars",
      visibleCoordRange: opts.visibleCoordRange,
      visiblePerpRange: opts.visiblePerpRange,
    });
  }
  return buildIntervalBands({
    id: "powers",
    assigned: POWERS_ASSIGNED,
    orientation: opts.orientation,
    scale: opts.scale,
    coordExtent: opts.coordExtent,
    band,
    thickness: POWERS_THICKNESS,
    timeZoom: opts.timeZoom,
    fillColor: POWERS_FILL,
    strokeColor: POWERS_STROKE,
    labelColor: POWERS_LABEL,
    title: "Major world powers",
    unitNoun: "world powers",
    visibleCoordRange: opts.visibleCoordRange,
    visiblePerpRange: opts.visiblePerpRange,
  });
}

// The timeline's own period bands, always rendered (not toggleable).
export function buildPeriodBands(opts: LaneOptions): Layer[] {
  const { orientation, scale, coordExtent, timeZoom, visibleCoordRange, visiblePerpRange } = opts;
  return buildIntervalBands({
    id: "periods",
    assigned: PERIODS_ASSIGNED,
    orientation,
    scale,
    coordExtent,
    band: INTERVAL_BAND,
    thickness: PERIOD_THICKNESS,
    timeZoom,
    fillColor: PERIOD_FILL,
    strokeColor: PERIOD_STROKE,
    labelColor: PERIOD_LABEL,
    visibleCoordRange,
    visiblePerpRange,
  });
}

// ---------------------------------------------------------------------------
// Backdrop: continuous lanes rendered as faint full-viewport graphs behind the
// main axis, sharing the screen instead of consuming stacked-lane space.
// ---------------------------------------------------------------------------

export interface BackdropOptions extends LaneOptions {
  // Lane currently emphasized (pinned focus, or transient chip hover). Null
  // means all slices render at the default faint level.
  focusedId: LaneId | null;
}

interface BackdropSlice {
  lane: LaneDefinition;
  lo: number;
  hi: number;
}

// Gap between adjacent backdrop slices, in world units (= screen px, since the
// perpendicular zoom is always 0).
const BACKDROP_GAP = 10;
// Inset inside each slice keeping the curve off the slice edge / separator.
const BACKDROP_PAD = 12;

// Split the visible perpendicular range into equal slices, one per backdrop
// lane, in the given lane order. Viewport-locked (derived from the visible
// range each frame), so the backdrop always fills the screen and never needs
// perpendicular panning.
function layoutBackdropSlices(
  lanes: LaneDefinition[],
  visiblePerpRange: [number, number],
): BackdropSlice[] {
  const n = lanes.length;
  if (n === 0) return [];
  const [vLo, vHi] = visiblePerpRange;
  const total = vHi - vLo;
  if (total <= 0) return [];
  const sliceH = (total - BACKDROP_GAP * (n - 1)) / n;
  if (sliceH <= 4) return [];
  return lanes.map((lane, i) => {
    const lo = vLo + i * (sliceH + BACKDROP_GAP);
    return { lane, lo, hi: lo + sliceH };
  });
}

// Opacity budget for the backdrop. Default is deliberately faint so interval
// bands and event dots (drawn later, fully opaque) keep visual priority; the
// focused slice steps up to near-lane strength while the rest dim further.
function backdropAlphas(focusedId: LaneId | null, laneId: LaneId): {
  wash: number;
  area: number;
  line: number;
  width: number;
  polyFill: number;
  polyLine: number;
  label: number;
} {
  if (focusedId == null) {
    return { wash: 8, area: 24, line: 150, width: 2, polyFill: 60, polyLine: 120, label: 150 };
  }
  if (focusedId === laneId) {
    return { wash: 16, area: 60, line: 255, width: 3, polyFill: 130, polyLine: 220, label: 230 };
  }
  return { wash: 5, area: 10, line: 60, width: 1.5, polyFill: 30, polyLine: 60, label: 80 };
}

// Full-slice rectangle as a 2D polygon for wash / hit layers.
function backdropRect(
  t0: number,
  t1: number,
  lo: number,
  hi: number,
  orientation: Orientation,
): [number, number][] {
  if (orientation === "horizontal") {
    return [
      [t0, lo],
      [t1, lo],
      [t1, hi],
      [t0, hi],
    ];
  }
  return [
    [lo, -t1],
    [hi, -t1],
    [hi, -t0],
    [lo, -t0],
  ];
}

// Perpendicular position of a normalized [0, 1] value inside a backdrop
// slice. Conventional chart direction: larger values toward the top of the
// screen when horizontal, toward the right when vertical.
function sliceFractionPerp(
  lo: number,
  hi: number,
  fraction: number,
  orientation: Orientation,
): number {
  const sliceH = hi - lo;
  const pad = Math.min(BACKDROP_PAD, sliceH * 0.15);
  if (orientation === "horizontal") {
    return hi - pad - fraction * (sliceH - 2 * pad);
  }
  return lo + pad + fraction * (sliceH - 2 * pad);
}

function buildBackdropSeriesSlice(
  slice: BackdropSlice,
  cfg: SeriesLaneData,
  color: [number, number, number],
  opts: BackdropOptions,
): Layer[] {
  const { lane, lo, hi } = slice;
  const { orientation, scale } = opts;
  const alphas = backdropAlphas(opts.focusedId, lane.id);
  const sliceH = hi - lo;
  const pad = Math.min(BACKDROP_PAD, sliceH * 0.15);

  const perpFor = (value: number) =>
    sliceFractionPerp(
      lo,
      hi,
      valueToFraction(value, cfg.min, cfg.max, scale),
      orientation,
    );

  const firstRealIndex = cfg.data.findIndex((p) => !p.estimated);
  const realPoints = firstRealIndex > 0 ? cfg.data.slice(firstRealIndex) : cfg.data;
  const estimatedPoints =
    firstRealIndex > 0 ? [...cfg.data.slice(0, firstRealIndex), realPoints[0]] : [];

  const path: [number, number, number][] = realPoints.map((p) =>
    timeOffset(yearToCoord(p.year, scale), perpFor(p.value), orientation),
  );
  const estimatedPath: [number, number, number][] = estimatedPoints.map((p) =>
    timeOffset(yearToCoord(p.year, scale), perpFor(p.value), orientation),
  );

  const xy = (coord: number, perp: number): [number, number] => {
    const [x, y] = timeOffset(coord, perp, orientation);
    return [x, y];
  };
  const baseline = orientation === "horizontal" ? hi - pad : lo + pad;
  const areaPolygon: [number, number][] = [
    xy(yearToCoord(realPoints[0].year, scale), baseline),
    ...realPoints.map((p) => xy(yearToCoord(p.year, scale), perpFor(p.value))),
    xy(yearToCoord(realPoints[realPoints.length - 1].year, scale), baseline),
  ];

  const lineColor: [number, number, number, number] = [color[0], color[1], color[2], alphas.line];
  const areaColor: [number, number, number, number] = [color[0], color[1], color[2], alphas.area];
  const labelColor: [number, number, number, number] = [color[0], color[1], color[2], alphas.label];

  // In-canvas labels are secondary (the HTML chips carry the crisp readout);
  // keep them small and faint: title at the deep-past edge inside the slice,
  // min/max at the curve endpoints.
  const titleTime = titleTimeCoord(opts.coordExtent, opts.visibleCoordRange);
  const firstCoord = yearToCoord(realPoints[0].year, scale);
  const lastCoord = yearToCoord(realPoints[realPoints.length - 1].year, scale);
  const titlePerp =
    orientation === "horizontal" ? lo + pad + 6 : hi - pad - 6;
  const titles: LaneLabel[] = [
    {
      position: timeOffset(titleTime, titlePerp, orientation),
      text: lane.title,
      anchor: orientation === "horizontal" ? "start" : "end",
      baseline: orientation === "horizontal" ? "top" : "bottom",
      color: labelColor,
    },
    {
      position: timeOffset(
        lastCoord,
        orientation === "horizontal" ? lo + pad + 6 : hi - pad - 6,
        orientation,
      ),
      text: cfg.format(cfg.max),
      anchor: "end",
      baseline: orientation === "horizontal" ? "top" : "top",
      color: labelColor,
    },
    {
      position: timeOffset(
        firstCoord,
        orientation === "horizontal" ? hi - pad - 6 : lo + pad + 6,
        orientation,
      ),
      text: cfg.format(cfg.min),
      anchor: "start",
      baseline: orientation === "horizontal" ? "bottom" : "bottom",
      color: labelColor,
    },
  ];

  const layers: Layer[] = [
    new PolygonLayer({
      id: `backdrop-${lane.id}-area`,
      data: [{ polygon: areaPolygon }],
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: areaColor,
      pickable: false,
      parameters: { depthTest: false },
    }),
    new PathLayer({
      id: `backdrop-${lane.id}-line`,
      data: [{ path }],
      getPath: (d) => d.path,
      getColor: lineColor,
      widthUnits: "pixels",
      getWidth: alphas.width,
      pickable: false,
      parameters: { depthTest: false },
    }),
  ];
  if (estimatedPath.length > 0) {
    layers.push(
      new PathLayer({
        id: `backdrop-${lane.id}-estimated`,
        data: [{ path: estimatedPath }],
        getPath: (d) => d.path,
        getColor: [color[0], color[1], color[2], Math.max(alphas.line - 20, 40)],
        widthUnits: "pixels",
        getWidth: alphas.width,
        extensions: [DASH_EXTENSION],
        getDashArray: [6, 4] as [number, number],
        pickable: false,
        parameters: { depthTest: false },
      }),
    );
  }
  layers.push(
    new TextLayer({
      id: `backdrop-${lane.id}-labels`,
      data: titles,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getTextAnchor: (d) => d.anchor,
      getAlignmentBaseline: (d) => d.baseline,
      getColor: (d) => d.color ?? labelColor,
      sizeUnits: "pixels",
      getSize: 10,
      fontFamily: MONO,
      pickable: false,
      parameters: { depthTest: false },
    }),
  );
  return layers;
}

function buildBackdropEnergySlice(
  slice: BackdropSlice,
  opts: BackdropOptions,
): Layer[] {
  const { lane, lo, hi } = slice;
  const { orientation, scale } = opts;
  const alphas = backdropAlphas(opts.focusedId, lane.id);
  const sliceH = hi - lo;
  const pad = Math.min(BACKDROP_PAD, sliceH * 0.15);

  const perpFor = (value: number) =>
    sliceFractionPerp(
      lo,
      hi,
      valueToFraction(value, ENERGY_MIN, ENERGY_MAX, scale),
      orientation,
    );
  const totalOf = (p: EnergyPoint) =>
    ENERGY_SOURCES.reduce((sum, s) => sum + p.values[s.id], 0);

  const xy = (coord: number, perp: number): [number, number] => {
    const [x, y] = timeOffset(coord, perp, orientation);
    return [x, y];
  };

  const polygons: {
    polygon: [number, number][];
    fill: [number, number, number, number];
    line: [number, number, number, number];
  }[] = [];
  for (let si = 0; si < ENERGY_SOURCES.length; si++) {
    const source = ENERGY_SOURCES[si];
    for (let i = 0; i < ENERGY.length - 1; i++) {
      const a = ENERGY[i];
      const b = ENERGY[i + 1];
      let bottomA = 0;
      let bottomB = 0;
      for (let j = 0; j < si; j++) {
        bottomA += a.values[ENERGY_SOURCES[j].id];
        bottomB += b.values[ENERGY_SOURCES[j].id];
      }
      const topA = bottomA + a.values[source.id];
      const topB = bottomB + b.values[source.id];
      if (topA <= 0 && topB <= 0) continue;
      polygons.push({
        polygon: [
          xy(yearToCoord(a.year, scale), perpFor(topA)),
          xy(yearToCoord(b.year, scale), perpFor(topB)),
          xy(yearToCoord(b.year, scale), perpFor(bottomB)),
          xy(yearToCoord(a.year, scale), perpFor(bottomA)),
        ],
        fill: [source.color[0], source.color[1], source.color[2], alphas.polyFill],
        line: [source.color[0], source.color[1], source.color[2], alphas.polyLine],
      });
    }
  }

  const firstRealIndex = ENERGY.findIndex((p) => !p.estimated);
  const estimatedPath: [number, number, number][] =
    firstRealIndex > 0
      ? [...ENERGY.slice(0, firstRealIndex), ENERGY[firstRealIndex]].map((p) =>
          timeOffset(yearToCoord(p.year, scale), perpFor(totalOf(p)), orientation),
        )
      : [];

  const titleTime = titleTimeCoord(opts.coordExtent, opts.visibleCoordRange);
  const lastCoord = yearToCoord(ENERGY[ENERGY.length - 1].year, scale);
  const labelColor: [number, number, number, number] = [220, 220, 230, alphas.label];
  const labels: LaneLabel[] = [
    {
      position: timeOffset(
        titleTime,
        orientation === "horizontal" ? lo + pad + 6 : hi - pad - 6,
        orientation,
      ),
      text: "Primary energy",
      anchor: orientation === "horizontal" ? "start" : "end",
      baseline: orientation === "horizontal" ? "top" : "bottom",
    },
    {
      position: timeOffset(
        lastCoord,
        orientation === "horizontal" ? lo + pad + 6 : hi - pad - 6,
        orientation,
      ),
      text: formatEnergy(ENERGY_MAX),
      anchor: "end",
      baseline: orientation === "horizontal" ? "top" : "top",
    },
  ];

  const layers: Layer[] = [
    new PolygonLayer({
      id: "backdrop-energy-bands",
      data: polygons,
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: (d) => d.fill,
      stroked: true,
      getLineColor: (d) => d.line,
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      pickable: false,
      parameters: { depthTest: false },
    }),
  ];
  if (estimatedPath.length > 0) {
    layers.push(
      new PathLayer({
        id: "backdrop-energy-estimated",
        data: [{ path: estimatedPath }],
        getPath: (d) => d.path,
        getColor: [220, 220, 230, Math.max(alphas.label - 20, 40)],
        widthUnits: "pixels",
        getWidth: 2,
        extensions: [DASH_EXTENSION],
        getDashArray: [6, 4] as [number, number],
        pickable: false,
        parameters: { depthTest: false },
      }),
    );
  }
  layers.push(
    new TextLayer({
      id: "backdrop-energy-labels",
      data: labels,
      getPosition: (d) => d.position,
      getText: (d) => d.text,
      getTextAnchor: (d) => d.anchor,
      getAlignmentBaseline: (d) => d.baseline,
      getColor: labelColor,
      sizeUnits: "pixels",
      getSize: 10,
      fontFamily: MONO,
      pickable: false,
      parameters: { depthTest: false },
    }),
  );
  return layers;
}

// Build faint full-viewport backdrop layers for the given continuous lanes.
// Slices divide the visible perpendicular range equally, in lane order. Render
// these layers first (bottom) so interval bands and events stay on top.
export function buildBackdropLayers(
  lanes: LaneDefinition[],
  opts: BackdropOptions,
): Layer[] {
  if (lanes.length === 0 || !opts.visiblePerpRange) return [];
  const [vLo, vHi] = opts.visiblePerpRange;
  // Clamp the time span to what is on screen so hit/wash rects stay bounded.
  const t0 = opts.visibleCoordRange
    ? Math.max(opts.coordExtent[0], opts.visibleCoordRange[0])
    : opts.coordExtent[0];
  const t1 = opts.visibleCoordRange
    ? Math.min(opts.coordExtent[1], opts.visibleCoordRange[1])
    : opts.coordExtent[1];
  if (t1 <= t0) return [];

  const slices = layoutBackdropSlices(lanes, [vLo, vHi]);
  if (slices.length === 0) return [];

  const layers: Layer[] = [
    // Invisible full-slice hit areas: guarantee a pickable target (and thus a
    // world coordinate for the value probe) everywhere over the backdrop, even
    // where no curve fill reaches.
    new PolygonLayer({
      id: "backdrop-hit",
      data: slices.map((s) => ({
        polygon: backdropRect(t0, t1, s.lo, s.hi, opts.orientation),
        laneId: s.lane.id,
      })),
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: [0, 0, 0, 0],
      stroked: false,
      pickable: true,
      parameters: { depthTest: false },
    }),
    // Whisper of lane color across each slice so slice extents read even where
    // the curve is flat at the bottom.
    new PolygonLayer({
      id: "backdrop-wash",
      data: slices.map((s) => {
        const c = s.lane.color;
        const a = backdropAlphas(opts.focusedId, s.lane.id);
        return {
          polygon: backdropRect(t0, t1, s.lo, s.hi, opts.orientation),
          fill: [c[0], c[1], c[2], a.wash] as [number, number, number, number],
        };
      }),
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: (d) => d.fill,
      stroked: false,
      pickable: false,
      parameters: { depthTest: false },
    }),
  ];

  for (const slice of slices) {
    if (slice.lane.kind === "stacked") {
      layers.push(...buildBackdropEnergySlice(slice, opts));
      continue;
    }
    const cfg = SERIES_DATA[slice.lane.id];
    if (!cfg) continue;
    layers.push(
      ...buildBackdropSeriesSlice(slice, cfg, slice.lane.color, opts),
    );
  }

  if (slices.length > 1) {
    const bounds = slices
      .slice(0, -1)
      .map((s, i) => (s.hi + slices[i + 1].lo) / 2);
    layers.push(
      new LineLayer({
        id: "backdrop-separators",
        data: bounds.map((perp) => {
          if (opts.orientation === "horizontal") {
            return { source: [t0, perp, 0] as [number, number, number], target: [t1, perp, 0] as [number, number, number] };
          }
          return { source: [perp, -t0, 0] as [number, number, number], target: [perp, -t1, 0] as [number, number, number] };
        }),
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: [138, 147, 166, 40],
        widthUnits: "pixels",
        getWidth: 1,
        pickable: false,
        parameters: { depthTest: false },
      }),
    );
  }

  return layers;
}

const PROBE_LINE_COLOR: [number, number, number, number] = [127, 209, 255, 150];

// Marker layers for the active backdrop probe (hover or pinned year): a faint
// hairline across the viewport at the probed time plus one dot per slice on
// its curve, so the chip/tooltip values are visibly anchored to the graph.
export function buildBackdropProbeLayers(
  lanes: LaneDefinition[],
  year: number,
  opts: BackdropOptions,
): Layer[] {
  if (lanes.length === 0) return [];
  if (!opts.visiblePerpRange || !opts.visibleCoordRange) return [];
  const { orientation, scale } = opts;
  const [vLo, vHi] = opts.visiblePerpRange;
  if (vHi <= vLo) return [];

  const coord = yearToCoord(year, scale);
  const line =
    orientation === "horizontal"
      ? {
          source: [coord, vLo, 0] as [number, number, number],
          target: [coord, vHi, 0] as [number, number, number],
        }
      : {
          source: [vLo, -coord, 0] as [number, number, number],
          target: [vHi, -coord, 0] as [number, number, number],
        };

  const slices = layoutBackdropSlices(lanes, [vLo, vHi]);
  const dots: {
    position: [number, number, number];
    fill: [number, number, number, number];
  }[] = [];
  for (const slice of slices) {
    let fraction: number | null = null;
    let color: [number, number, number] = slice.lane.color;
    if (slice.lane.kind === "stacked") {
      // Interpolate the rendered coordinates, so markers stay on the path
      // when either axis is logarithmic.
      fraction = interpolateSeries(
        ENERGY.map((point) => ({
          year: yearToCoord(point.year, scale),
          value: valueToFraction(
            ENERGY_SOURCES.reduce((sum, source) => sum + point.values[source.id], 0),
            ENERGY_MIN,
            ENERGY_MAX,
            scale,
          ),
        })),
        coord,
      ).value;
      color = [240, 240, 245];
    } else {
      const cfg = SERIES_DATA[slice.lane.id];
      if (!cfg) continue;
      fraction = interpolateSeries(
        cfg.data.map((point) => ({
          year: yearToCoord(point.year, scale),
          value: valueToFraction(point.value, cfg.min, cfg.max, scale),
        })),
        coord,
      ).value;
    }
    dots.push({
      position: timeOffset(
        coord,
        sliceFractionPerp(slice.lo, slice.hi, fraction, orientation),
        orientation,
      ),
      fill: [color[0], color[1], color[2], 255],
    });
  }

  return [
    new LineLayer({
      id: "backdrop-probe-line",
      data: [line],
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      getColor: PROBE_LINE_COLOR,
      widthUnits: "pixels",
      getWidth: 1.5,
      extensions: [DASH_EXTENSION],
      getDashArray: [4, 4] as [number, number],
      pickable: false,
      parameters: { depthTest: false },
    }),
    new ScatterplotLayer({
      id: "backdrop-probe-dots",
      data: dots,
      getPosition: (d) => d.position,
      getFillColor: (d) => d.fill,
      getLineColor: [10, 13, 20],
      stroked: true,
      getLineWidth: 1.5,
      lineWidthMinPixels: 1.5,
      radiusUnits: "pixels",
      getRadius: 5,
      pickable: false,
      parameters: { depthTest: false },
    }),
  ];
}
