import type { Layer } from "@deck.gl/core";
import { PathLayer, PolygonLayer, TextLayer } from "@deck.gl/layers";
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

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "ui-sans-serif, system-ui, -apple-system, sans-serif";

const LANE_TITLE_COLOR: [number, number, number, number] = [138, 147, 166, 220];

const PERIOD_FILL: [number, number, number, number] = [118, 158, 220, 34];
const PERIOD_STROKE: [number, number, number, number] = [150, 190, 240, 90];
const PERIOD_LABEL: [number, number, number, number] = [176, 200, 232, 220];

const POWERS_FILL: [number, number, number, number] = [86, 200, 178, 30];
const POWERS_STROKE: [number, number, number, number] = [120, 222, 202, 90];
const POWERS_LABEL: [number, number, number, number] = [140, 222, 208, 220];

const PERIOD_THICKNESS = 8;
const POWERS_THICKNESS = 8;
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
  title?: string;
  laneId?: string;
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
    title,
    laneId,
  } = opts;

  const timeScale = Math.pow(2, timeZoom);
  const offset = (coord: number, perp: number) =>
    timeOffset(coord, perp, orientation);

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
    return laneId ? { polygon, laneId } : { polygon };
  });

  const labelData: LaneLabel[] = assigned.flatMap(
    ({ interval, lane }): LaneLabel[] => {
      const c0 = yearToCoord(interval.startYear, scale);
      const c1 = yearToCoord(interval.endYear, scale);
      const center = (c0 + c1) / 2;
      const off = band.center + laneOffset(lane, thickness);
      const bandPixels = (c1 - c0) * timeScale;
      const fits =
        orientation === "horizontal"
          ? bandPixels >= interval.title.length * 7 + 12
          : bandPixels >= 13 + 12;
      if (!fits) return [];
      if (orientation === "horizontal") {
        return [
          {
            position: offset(center, off),
            text: interval.title,
            anchor: "middle",
            baseline: "center",
          },
        ];
      }
      return [
        {
          position: offset(center, off + thickness / 2 + 5),
          text: interval.title,
          anchor: "start",
          baseline: "center",
        },
      ];
    },
  );

  const layers: Layer[] = [
    new PolygonLayer({
      id: `${id}-bands`,
      data: bandData,
      getPolygon: (d) => d.polygon,
      filled: true,
      getFillColor: fillColor,
      stroked: true,
      getLineColor: strokeColor,
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      pickable: !!laneId,
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
  });
}

// The timeline's own period bands, always rendered (not toggleable).
export function buildPeriodBands(opts: LaneOptions): Layer[] {
  const { orientation, scale, coordExtent, timeZoom } = opts;
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
  });
}
