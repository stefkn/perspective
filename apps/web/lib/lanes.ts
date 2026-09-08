import type { Scale } from "./time-transform";

export interface Interval {
  id: string;
  title: string;
  startYear: number;
  endYear: number;
  estimated?: boolean;
}

export interface AssignedInterval<T extends Interval = Interval> {
  interval: T;
  lane: number;
}

// Greedy lane assignment so that overlapping intervals never share a lane.
export function assignIntervalLanes<T extends Interval>(
  intervals: T[],
): AssignedInterval<T>[] {
  const sorted = [...intervals].sort(
    (a, b) => a.startYear - b.startYear || a.endYear - b.endYear,
  );

  const laneEnds: number[] = [];
  const result: AssignedInterval<T>[] = [];

  for (const interval of sorted) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > interval.startYear) {
      lane++;
    }
    if (lane === laneEnds.length) laneEnds.push(0);
    laneEnds[lane] = interval.endYear;
    result.push({ interval, lane });
  }

  return result;
}

// Perpendicular offset of a sub-lane relative to its parent band's center.
export function laneOffset(lane: number, thickness: number): number {
  const direction = lane % 2 === 0 ? -1 : 1;
  const level = Math.floor(lane / 2);
  return direction * (thickness / 2 + 6 + level * 16);
}

export interface LaneBand {
  center: number;
  half: number;
}

// Perpendicular space reserved on each side of the main axis for the
// timeline itself (events, labels, period bands).
export const MAIN_AXIS_HALF = 48;

// Gap between adjacent lanes, in world units (pixels on the perp axis).
export const LANE_GAP = 12;

// Minimum / maximum lane half-widths (world units = pixels). Lanes grow to
// fill available perpendicular space up to MAX_LANE_HALF, but never shrink
// below MIN_LANE_HALF.
export const MIN_LANE_HALF = 55;
export const MAX_LANE_HALF = 140;
export const EXPANDED_HALF = 160;

// Map a normalized value in [0, 1] to a perpendicular offset inside a band.
// Values grow away from the main axis: 0 at the inner edge, 1 at the outer edge.
export function fractionToPerp(fraction: number, band: LaneBand): number {
  const side = band.center >= 0 ? 1 : -1;
  return band.center - side * band.half + fraction * side * 2 * band.half;
}

// Map a raw value within [min, max] to a normalized [0, 1] fraction, honoring
// the active time scale so the value axis mirrors the time axis. Values are
// floored at 1 so zero (or near-zero) values stay finite on a log axis.
export function valueToFraction(
  value: number,
  min: number,
  max: number,
  scale: Scale,
): number {
  if (scale === "log") {
    const floor = Math.max(min, 1);
    const lo = Math.log(floor);
    const hi = Math.log(Math.max(max, floor));
    return (Math.log(Math.max(value, floor)) - lo) / (hi - lo);
  }
  return (value - min) / (max - min);
}

export interface SeriesPoint {
  year: number;
  value: number;
}

export type SeriesData = SeriesPoint[];

export type LaneId =
  | "population"
  | "energy"
  | "co2"
  | "powers"
  | "people"
  | "life-expectancy"
  | "gdp";

export type LaneKind = "series" | "stacked" | "intervals";

export interface LaneDefinition {
  id: LaneId;
  title: string;
  kind: LaneKind;
  side: -1 | 1;
  color: [number, number, number];
  defaultVisible: boolean;
}

// Ordered registry of toggleable lanes. Order defines stacking within a side.
export const LANES: LaneDefinition[] = [
  { id: "population", title: "World population", kind: "series", side: -1, color: [255, 209, 102], defaultVisible: false },
  { id: "energy", title: "Primary energy", kind: "stacked", side: -1, color: [220, 220, 230], defaultVisible: false },
  { id: "co2", title: "CO2 emissions", kind: "series", side: -1, color: [226, 96, 72], defaultVisible: false },
  { id: "powers", title: "Major world powers", kind: "intervals", side: 1, color: [86, 200, 178], defaultVisible: false },
  { id: "people", title: "Notable lifespans", kind: "intervals", side: -1, color: [214, 150, 236], defaultVisible: true },
  { id: "life-expectancy", title: "Life expectancy", kind: "series", side: 1, color: [126, 199, 106], defaultVisible: false },
  { id: "gdp", title: "Global GDP", kind: "series", side: 1, color: [109, 165, 240], defaultVisible: false },
];

export interface LaneLayout {
  bands: Record<LaneId, LaneBand>;
  negExtent: number;
  posExtent: number;
}

// Lay out visible lanes into perpendicular bands that grow to fill the
// available space (up to MAX_LANE_HALF), with a wider MIN_LANE_HALF floor.
// When an expanded lane is present it takes EXPANDED_HALF while the rest
// shrink to MIN_LANE_HALF, and the resulting overflow is reached by panning.
export function layoutLaneBands(
  lanes: LaneDefinition[],
  perpSize: number,
  expandedId: LaneId | null,
): LaneLayout {
  const bands = {} as Record<LaneId, LaneBand>;
  const halfPerSide = { [-1]: 0, [1]: 0 } as Record<-1 | 1, number>;

  const avail = perpSize / 2 - MAIN_AXIS_HALF - LANE_GAP;

  for (const side of [-1, 1] as const) {
    const sideLanes = lanes.filter((l) => l.side === side);
    const n = sideLanes.length;
    if (n === 0) continue;

    const sharedHalf = Math.min(
      Math.max((avail - (n - 1) * LANE_GAP) / (2 * n), MIN_LANE_HALF),
      MAX_LANE_HALF,
    );

    let cursor = MAIN_AXIS_HALF + LANE_GAP;
    for (const lane of sideLanes) {
      let half: number;
      if (lane.id === expandedId) {
        half = EXPANDED_HALF;
      } else if (expandedId) {
        half = MIN_LANE_HALF;
      } else {
        half = sharedHalf;
      }
      const center = side * (cursor + half);
      bands[lane.id] = { center, half };
      cursor += 2 * half + LANE_GAP;
    }
    halfPerSide[side] = cursor - LANE_GAP;
  }

  return { bands, negExtent: halfPerSide[-1], posExtent: halfPerSide[1] };
}
