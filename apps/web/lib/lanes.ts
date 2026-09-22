import type { Scale } from "./time-transform";

export interface Interval {
  id: string;
  title: string;
  startYear: number;
  endYear: number;
  estimated?: boolean;
  // Detail fields carried through so the info box can be opened from a tap on
  // the entity's label/band.
  description?: string;
  significance?: number;
  wikipediaUrl?: string | null;
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

// Discrete per-lane size levels. Each maps to a fixed half-width (in world
// units = pixels on the perp axis) so a user can grant more or less space to
// the lanes they care about, independent of how many lanes are visible.
export type LaneSize = "compact" | "normal" | "large";

export const LANE_SIZE_HALF: Record<LaneSize, number> = {
  compact: 55,
  normal: 90,
  large: 160,
};

export const LANE_SIZES: LaneSize[] = ["compact", "normal", "large"];

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
  estimated?: boolean;
}

export type SeriesData = SeriesPoint[];

export type LaneId =
  | "population"
  | "energy"
  | "co2"
  | "powers"
  | "people"
  | "wars"
  | "culture"
  | "life-expectancy"
  | "gdp";

export type LaneKind = "series" | "stacked" | "intervals";

export interface LaneDefinition {
  id: LaneId;
  title: string;
  kind: LaneKind;
  defaultSide: -1 | 1;
  color: [number, number, number];
  defaultVisible: boolean;
}

// Sentinel id for the fixed "main timeline" divider in the ordered lane list.
// Lanes before it sit on one side of the axis, lanes after it on the other, so
// the list order is exactly the on-screen order (no separate side setting).
export const MAIN_AXIS_ID = "main" as const;

export type LaneItem = LaneId | typeof MAIN_AXIS_ID;

// Per-user, per-lane settings: visibility and how much perpendicular space it
// gets. Side is derived from the lane's position relative to MAIN_AXIS_ID.
export interface LaneConfig {
  visible: boolean;
  size: LaneSize;
}

// Registry of toggleable lanes. `defaultSide` seeds where the lane starts
// relative to the main axis; the user can reorder lanes (and the divider), so
// this array is the seed, not the source of truth.
export const LANES: LaneDefinition[] = [
  { id: "population", title: "World population", kind: "series", defaultSide: -1, color: [255, 209, 102], defaultVisible: false },
  { id: "energy", title: "Primary energy", kind: "stacked", defaultSide: -1, color: [220, 220, 230], defaultVisible: false },
  { id: "co2", title: "CO2 emissions", kind: "series", defaultSide: -1, color: [226, 96, 72], defaultVisible: false },
  { id: "powers", title: "Major world powers", kind: "intervals", defaultSide: 1, color: [86, 200, 178], defaultVisible: false },
  { id: "people", title: "Notable lifespans", kind: "intervals", defaultSide: -1, color: [214, 150, 236], defaultVisible: true },
  { id: "wars", title: "Wars", kind: "intervals", defaultSide: 1, color: [226, 110, 110], defaultVisible: false },
  { id: "culture", title: "Cultural works", kind: "intervals", defaultSide: 1, color: [240, 180, 90], defaultVisible: false },
  { id: "life-expectancy", title: "Life expectancy", kind: "series", defaultSide: 1, color: [126, 199, 106], defaultVisible: false },
  { id: "gdp", title: "Global GDP", kind: "series", defaultSide: 1, color: [109, 165, 240], defaultVisible: false },
];

export const LANE_BY_ID: Record<LaneId, LaneDefinition> = Object.fromEntries(
  LANES.map((lane) => [lane.id, lane]),
) as Record<LaneId, LaneDefinition>;

export function defaultLaneConfig(lane: LaneDefinition): LaneConfig {
  return {
    visible: lane.defaultVisible,
    size: "normal",
  };
}

export function defaultLaneConfigs(): Record<LaneId, LaneConfig> {
  const configs = {} as Record<LaneId, LaneConfig>;
  for (const lane of LANES) configs[lane.id] = defaultLaneConfig(lane);
  return configs;
}

// Initial ordered item list: lanes grouped by their default side, with the
// main-axis divider between the two groups.
export function defaultLaneItems(): LaneItem[] {
  return [
    ...LANES.filter((lane) => lane.defaultSide === -1).map((lane) => lane.id),
    MAIN_AXIS_ID,
    ...LANES.filter((lane) => lane.defaultSide === 1).map((lane) => lane.id),
  ];
}

export interface LaneLayout {
  bands: Record<LaneId, LaneBand>;
  negExtent: number;
  posExtent: number;
}

// Lay out visible lanes into perpendicular bands. Ordering (the order of
// `lanes`) determines stacking within a side, `sides` places each lane relative
// to the axis, and `configs` supplies the per-lane size. Overflow is reached
// by panning.
export function layoutLaneBands(
  lanes: LaneDefinition[],
  perpSize: number,
  configs: Record<LaneId, LaneConfig>,
  sides: Record<LaneId, -1 | 1>,
): LaneLayout {
  const bands = {} as Record<LaneId, LaneBand>;
  const halfPerSide = { [-1]: 0, [1]: 0 } as Record<-1 | 1, number>;

  for (const side of [-1, 1] as const) {
    const sideLanes = lanes.filter((l) => sides[l.id] === side);
    if (sideLanes.length === 0) continue;

    let cursor = MAIN_AXIS_HALF + LANE_GAP;
    for (const lane of sideLanes) {
      const half = LANE_SIZE_HALF[configs[lane.id].size];
      const center = side * (cursor + half);
      bands[lane.id] = { center, half };
      cursor += 2 * half + LANE_GAP;
    }
    halfPerSide[side] = cursor - LANE_GAP;
  }

  return { bands, negExtent: halfPerSide[-1], posExtent: halfPerSide[1] };
}
