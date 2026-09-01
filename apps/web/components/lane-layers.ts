import type { Layer } from "@deck.gl/core";
import { LineLayer, PathLayer, PolygonLayer, TextLayer } from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import {
  yearToCoord,
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
} from "../lib/energy";
import { PERIODS } from "../lib/periods";
import { POWERS } from "../lib/powers";
import { PEOPLE } from "../lib/people";

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

const PERIOD_THICKNESS = 8;
const POWERS_THICKNESS = 8;
const PEOPLE_THICKNESS = 6;

const DASH_EXTENSION = new PathStyleExtension({ dash: true });
const INTERVAL_BAND: LaneBand = { center: 0, half: 0 };

type Anchor = "start" | "middle" | "end";
type Baseline = "top" | "center" | "bottom";

interface LaneLabel {
  position: [number, number, number];
  text: string;
  anchor: Anchor;
  baseline: Baseline;
  color?: [number, number, number, number];
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
  laneId?: string;
  visibleCoordRange?: [number, number];
  visiblePerpRange?: [number, number];
}

interface IntervalLabelCandidate {
  id: string;
  text: string;
  coord: number;
  perp: number;
}

interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const INTERVAL_LABEL_FONT = 11;
const INTERVAL_LABEL_HEIGHT = 13;
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
    laneId,
    visibleCoordRange,
    visiblePerpRange,
  } = opts;

  const timeScale = Math.pow(2, timeZoom);
  const offset = (coord: number, perp: number) =>
    timeOffset(coord, perp, orientation);

  const estimateFill = estimateFillColor ?? fillColor;
  const estimateStroke = estimateStrokeColor ?? strokeColor;

  const bandData = assigned.map(({ interval, lane }) => {
    const c0 = yearToCoord(interval.startYear, scale);
    const c1 = yearToCoord(interval.endYear, scale);
    const off = band.center + laneOffset(lane, thickness);
    const t = thickness / 2;
    let polygon: [number, number][];
    if (orientation === "horizontal") {
      polygon = [
        [c0, off - t],
        [c1, off - t],
        [c1, off + t],
        [c0, off + t],
      ];
    } else {
      const y0 = -c1;
      const y1 = -c0;
      polygon = [
        [off - t, y0],
        [off + t, y0],
        [off + t, y1],
        [off - t, y1],
      ];
    }
    return laneId
      ? { polygon, laneId, estimated: interval.estimated }
      : { polygon, estimated: interval.estimated };
  });

  const viewport =
    visibleCoordRange && visiblePerpRange
      ? viewportBox(orientation, timeScale, visibleCoordRange, visiblePerpRange)
      : null;

  const labelCandidates: IntervalLabelCandidate[] = [];
  for (const { interval, lane } of assigned) {
    const c0 = yearToCoord(interval.startYear, scale);
    const c1 = yearToCoord(interval.endYear, scale);
    const displayTitle = interval.estimated
      ? `≈ ${interval.title}`
      : interval.title;

    // Skip spans that don't intersect the viewport at all.
    let coord = (c0 + c1) / 2;
    if (visibleCoordRange) {
      const [vMin, vMax] = visibleCoordRange;
      if (c1 < vMin || c0 > vMax) continue;
      const halfExt = labelTimeHalfExtent(displayTitle, orientation, timeScale);
      const lo = vMin + halfExt;
      const hi = vMax - halfExt;
      coord = lo >= hi ? (vMin + vMax) / 2 : Math.min(Math.max(coord, lo), hi);
    }

    const off = band.center + laneOffset(lane, thickness);
    const bandPixels = (c1 - c0) * timeScale;
    const fits =
      orientation === "horizontal"
        ? bandPixels >= displayTitle.length * 7 + 12
        : bandPixels >= 13 + 12;
    if (!fits) continue;

    labelCandidates.push({
      id: `${id}:${interval.id}`,
      text: displayTitle,
      coord,
      perp: orientation === "horizontal" ? off : off + thickness / 2 + 5,
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
      pickable: !!laneId,
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
      getColor: labelColor,
      sizeUnits: "pixels",
      getSize: 11,
      fontFamily: SANS,
      pickable: false,
      parameters: { depthTest: false },
    }),
  ];

  if (title) {
    const side = band.center >= 0 ? 1 : -1;
    const anchor = laneLabelAnchor(orientation, side, false);
    layers.push(
      new TextLayer({
        id: `${id}-title`,
        data: [{ title }],
        getPosition: () =>
          timeOffset(
            coordExtent[0],
            fractionToPerp(1, band) + side * 8,
            orientation,
          ),
        getText: (d) => d.title,
        getTextAnchor: anchor.anchor,
        getAlignmentBaseline: anchor.baseline,
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
  },
): Layer[] {
  const { id, title, color, data, min, max, format, band, orientation, scale, coordExtent } =
    cfg;
  const side = band.center >= 0 ? 1 : -1;

  const perpFor = (value: number) =>
    fractionToPerp(valueToFraction(value, min, max, scale), band);

  const path: [number, number, number][] = data.map((p) =>
    timeOffset(yearToCoord(p.year, scale), perpFor(p.value), orientation),
  );

  const xy = (coord: number, perp: number): [number, number] => {
    const [x, y] = timeOffset(coord, perp, orientation);
    return [x, y];
  };

  const baseline = fractionToPerp(0, band);
  const areaPolygon: [number, number][] = [
    xy(yearToCoord(data[0].year, scale), baseline),
    ...data.map((p) => xy(yearToCoord(p.year, scale), perpFor(p.value))),
    xy(yearToCoord(data[data.length - 1].year, scale), baseline),
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

  const titleAnchor = laneLabelAnchor(orientation, side, false);
  const maxAnchor = laneLabelAnchor(orientation, side, true);
  const minAnchor = laneLabelAnchor(orientation, side, false);

  const labels: LaneLabel[] = [
    {
      position: timeOffset(coordExtent[0], outerPerp + side * 8, orientation),
      text: title,
      anchor: titleAnchor.anchor,
      baseline: titleAnchor.baseline,
    },
    {
      position: timeOffset(
        yearToCoord(data[data.length - 1].year, scale),
        outerPerp + side * 8,
        orientation,
      ),
      text: format(max),
      anchor: maxAnchor.anchor,
      baseline: maxAnchor.baseline,
    },
    {
      position: timeOffset(
        yearToCoord(data[0].year, scale),
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
      data: [{ polygon: areaPolygon, laneId: id }],
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: areaColor,
      pickable: true,
      parameters: { depthTest: false },
    }),
    new PathLayer({
      id: `${id}-line`,
      data: [{ path, laneId: id }],
      getPath: (d) => d.path,
      getColor: lineColor,
      widthUnits: "pixels",
      getWidth: 2,
      pickable: true,
      parameters: { depthTest: false },
    }),
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
  },
): Layer[] {
  const { band, orientation, scale, coordExtent } = cfg;
  const side = band.center >= 0 ? 1 : -1;

  const perpFor = (value: number) =>
    fractionToPerp(valueToFraction(value, ENERGY_MIN, ENERGY_MAX, scale), band);

  const xy = (coord: number, perp: number): [number, number] => {
    const [x, y] = timeOffset(coord, perp, orientation);
    return [x, y];
  };

  const polygons: {
    polygon: [number, number][];
    fill: [number, number, number, number];
    line: [number, number, number, number];
    laneId: string;
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
        laneId: "energy",
      });
    }
  }

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
      position: timeOffset(coordExtent[0], outerPerp + side * 8, orientation),
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
      pickable: true,
      parameters: { depthTest: false },
    }),
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
      assigned: assignIntervalLanes(PEOPLE),
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
      laneId: "people",
      visibleCoordRange: opts.visibleCoordRange,
      visiblePerpRange: opts.visiblePerpRange,
    });
  }
  return buildIntervalBands({
    id: "powers",
    assigned: assignIntervalLanes(POWERS),
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
    laneId: "powers",
    visibleCoordRange: opts.visibleCoordRange,
    visiblePerpRange: opts.visiblePerpRange,
  });
}

// The timeline's own period bands, always rendered (not toggleable).
export function buildPeriodBands(opts: LaneOptions): Layer[] {
  const { orientation, scale, coordExtent, timeZoom, visibleCoordRange, visiblePerpRange } = opts;
  return buildIntervalBands({
    id: "periods",
    assigned: assignIntervalLanes(PERIODS),
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
