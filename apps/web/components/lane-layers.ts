import type { Layer } from "@deck.gl/core";
import { LineLayer, PathLayer, PolygonLayer, TextLayer } from "@deck.gl/layers";
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

// Build stacked interval bands (polygons + labels) for a lane or the main axis.
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
  const budget = collapsible
    ? Math.min(BUDGET_BANDS, Math.max(2, Math.floor(band.half / 8)))
    : Infinity;

  const sorted = [...visible].sort(
    (a, b) => (b.interval.significance ?? 0) - (a.interval.significance ?? 0),
  );
  const individual: typeof visible = [];
  const collapsed: typeof visible = [];
  for (const v of sorted) {
    const readable = (v.c1 - v.c0) * timeScale >= MIN_BAND_LABEL_PX;
    if (readable && individual.length < budget) individual.push(v);
    else if (collapsible) collapsed.push(v);
  }

  // Re-pack the kept intervals into a compact swimlane (time-ordered) so they
  // stack tightly instead of keeping their scattered sub-lane indices from the
  // full, pre-assigned set.
  const laneById = new Map<string, number>();
  for (const { interval, lane } of assignIntervalLanes(
    individual.map((v) => v.interval),
  )) {
    laneById.set(interval.id, lane);
  }

  // Individual bands (full color, stacked into sub-lanes).
  const bandData = individual.map(({ interval, c0, c1 }) => {
    const off = band.center + laneOffset(laneById.get(interval.id) ?? 0, thickness);
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

    const off = band.center + laneOffset(laneById.get(interval.id) ?? 0, thickness);
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
        count: collapsed.length,
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
        text: `~${collapsed.length.toLocaleString("en-US")}+ more`,
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
