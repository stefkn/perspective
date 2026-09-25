"use client";

import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import {
  LineLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import type { TimelineEvent, EntityDetail, AggregateInfo } from "../lib/types";
import {
  yearToCoord,
  coordToYear,
  timeOffset,
  NOW,
  type Orientation,
  type Scale,
} from "../lib/time-transform";
import { opacityForSignificance, significanceColor } from "../lib/significance";
import { generateTicks, monthYearLabel } from "../lib/ticks";
import type { LaneBand, LaneDefinition, LaneId } from "../lib/lanes";
import {
  buildPeriodBands,
  buildLaneLayers,
  STICKY_RULER_INSET,
  STICKY_RULER_LABEL_OFFSET,
} from "./lane-layers";
import {
  computeOtdLabelLanes,
  otdDotSpreadPx,
  otdPerpOffset,
  otdTimeShiftPx,
  PORTRAIT_LABEL_CLEARANCE,
} from "../lib/labels";
import type { TimeViewState } from "../lib/view-state";

const AXIS_COLOR: [number, number, number] = [0x39, 0x41, 0x4d];
const TICK_COLOR: [number, number, number] = [0x8a, 0x93, 0xa6];
// Full-viewport reference guides: a hairline at round years so an entity sitting
// far from the axis can be traced across to the sticky ruler. Decades first;
// zooming out coarsens the step to centuries, then millennia, so no more than
// MAX_GUIDE_LINES are ever on screen. Past that (fully zoomed out) they vanish.
const MAX_GUIDE_LINES = 8;
const GUIDE_STEPS = [10, 100, 1000];
const GUIDE_COLOR: [number, number, number, number] = [0x8a, 0x93, 0xa6, 32];
const NOW_COLOR: [number, number, number] = [0x7f, 0xd1, 0xff];
const ON_THIS_DAY_COLOR: [number, number, number] = [0x4f, 0xd1, 0xc5];
const ON_THIS_DAY_HIT_RADIUS = 14;
const ON_THIS_DAY_LEADER_GAP = 10;
const ON_THIS_DAY_LABEL_EDGE_MARGIN = 120;
// On-screen margin (in px) kept around the viewport when culling the dot
// buffer, so dots don't pop at the edges while panning.
const ON_THIS_DAY_DOT_MARGIN = 48;

const LABEL_ANGLE_DEG = 45;

// Cap the number of on-this-day labels shown at once: at century-level zooms
// the visible range holds thousands of events, so a dense label cloud is
// unreadable. Keep a deterministic subset keyed on each event's id, so the
// chosen labels stay put while panning instead of reshuffling every frame.
function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sampleOtdLabelEvents(
  events: TimelineEvent[],
  count: number,
): TimelineEvent[] {
  if (events.length <= count) return events;
  return events
    .map((event, index) => ({ event, index, hash: hashString(event.id) }))
    .sort((a, b) => a.hash - b.hash || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.event);
}

interface TimelineProps {
  events: TimelineEvent[];
  onThisDayEvents: TimelineEvent[];
  showOnThisDayLabels: boolean;
  showOtdLabels: boolean;
  otdLabelAlpha: number;
  otdLabelSampleCount: number;
  selectedEvent: EntityDetail | null;
  lanes: LaneDefinition[];
  laneBands: Record<LaneId, LaneBand>;
  orientation: Orientation;
  scale: Scale;
  viewState: TimeViewState;
  minSignificance: number;
  coordExtent: [number, number];
  labelAlpha: Record<string, number>;
  visibleCoordRange: [number, number] | null;
  visiblePerpRange: [number, number] | null;
  onViewStateChange: (vs: TimeViewState) => void;
  onResize: (size: { width: number; height: number }) => void;
  onSelect: (detail: EntityDetail | null) => void;
  onAggregateNavigate: (startYear: number, endYear: number) => void;
  onHoverAggregate: (
    info: {
      x: number;
      y: number;
      count: number;
      names: string[];
      unitNoun?: string;
    } | null,
  ) => void;
}

export default function Timeline({
  events,
  onThisDayEvents,
  showOnThisDayLabels,
  showOtdLabels,
  otdLabelAlpha,
  otdLabelSampleCount,
  selectedEvent,
  lanes,
  laneBands,
  orientation,
  scale,
  viewState,
  minSignificance,
  coordExtent,
  labelAlpha,
  visibleCoordRange,
  visiblePerpRange,
  onViewStateChange,
  onResize,
  onSelect,
  onAggregateNavigate,
  onHoverAggregate,
}: TimelineProps) {
  const offset = (coord: number, perp: number): [number, number, number] =>
    timeOffset(coord, perp, orientation);

  const view = useMemo(
    () =>
      new OrthographicView({
        id: "timeline",
        controller: {
          dragRotate: false,
          doubleClickZoom: false,
          keyboard: true,
        },
      }),
    [],
  );

  // On-this-day dots: cull the full ~20k-point set to the viewport (plus a
  // margin) before building the buffer, so deep zooms into a few days or months
  // don't keep re-uploading the entire history every frame.
  const onThisDayPoints = useMemo(() => {
    if (!visibleCoordRange) return [];
    const [lo, hi] = visibleCoordRange;
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const margin = ON_THIS_DAY_DOT_MARGIN / Math.pow(2, zoom);
    const out: { coord: number; event: TimelineEvent; otd: true }[] = [];
    for (const event of onThisDayEvents) {
      const coord = yearToCoord(event.year, scale);
      if (coord < lo - margin || coord > hi + margin) continue;
      out.push({ coord, event, otd: true });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onThisDayEvents,
    visibleCoordRange,
    scale,
    viewState.zoomX,
    viewState.zoomY,
    orientation,
  ]);

  const onThisDayVisibleEvents = useMemo(() => {
    if (!visibleCoordRange) return [];
    const [lo, hi] = visibleCoordRange;
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const margin = ON_THIS_DAY_LABEL_EDGE_MARGIN / Math.pow(2, zoom);
    return onThisDayEvents.filter((event) => {
      if (event.id === selectedEvent?.id) return false;
      const coord = yearToCoord(event.year, scale);
      return coord >= lo - margin && coord <= hi + margin;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onThisDayEvents, visibleCoordRange, scale, selectedEvent, viewState.zoomX, viewState.zoomY, orientation]);

  const otdLabelEvents = useMemo(
    () => sampleOtdLabelEvents(onThisDayVisibleEvents, otdLabelSampleCount),
    [onThisDayVisibleEvents, otdLabelSampleCount],
  );

  const otdLabelLanes = useMemo(() => {
    if (!showOtdLabels || otdLabelEvents.length === 0) {
      return {} as Record<string, number>;
    }
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    return computeOtdLabelLanes(
      otdLabelEvents,
      zoom,
      scale,
      orientation,
    );
  }, [
    showOtdLabels,
    otdLabelEvents,
    viewState.zoomX,
    viewState.zoomY,
    scale,
    orientation,
  ]);

  const onThisDayLabelData = useMemo(() => {
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const zoomScale = Math.pow(2, zoom);
    return onThisDayVisibleEvents
      .filter((event) => otdLabelLanes[event.id] != null)
      .map((event) => {
        const coord =
          yearToCoord(event.year, scale) +
          otdDotSpreadPx(event.dayIndex) / zoomScale;
        const lane = otdLabelLanes[event.id];
        if (orientation === "horizontal") {
          const perp = otdPerpOffset(lane);
          return { position: offset(coord, perp), text: event.title, event };
        }
        const shift = otdTimeShiftPx(lane) / zoomScale;
        return {
          position: offset(coord + shift, PORTRAIT_LABEL_CLEARANCE),
          text: event.title,
          event,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onThisDayVisibleEvents, otdLabelLanes, scale, orientation, viewState.zoomX, viewState.zoomY]);

  const onThisDayLeaderLines = useMemo(() => {
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const zoomScale = Math.pow(2, zoom);
    return onThisDayVisibleEvents
      .filter((event) => otdLabelLanes[event.id] != null)
      .map((event) => {
        const coord =
          yearToCoord(event.year, scale) +
          otdDotSpreadPx(event.dayIndex) / zoomScale;
        const lane = otdLabelLanes[event.id];
        if (orientation === "horizontal") {
          const perp = otdPerpOffset(lane);
          const dir = perp >= 0 ? 1 : -1;
          return {
            source: offset(coord, 0),
            target: offset(coord, perp - dir * ON_THIS_DAY_LEADER_GAP),
          };
        }
        const shift = otdTimeShiftPx(lane) / zoomScale;
        return {
          source: offset(coord, 0),
          target: offset(
            coord + shift,
            PORTRAIT_LABEL_CLEARANCE - ON_THIS_DAY_LEADER_GAP,
          ),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onThisDayVisibleEvents, otdLabelLanes, scale, orientation, viewState.zoomX, viewState.zoomY]);

  const [isTouch] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches,
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // On touch, default the focus to the on-this-day dot nearest the viewport
  // center so there is always a tap-target-free way to read a label.
  const centerOtdId = useMemo(() => {
    if (!isTouch || onThisDayEvents.length === 0) return null;
    const centerCoord =
      orientation === "horizontal" ? viewState.target[0] : -viewState.target[1];
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const event of onThisDayEvents) {
      const dist = Math.abs(yearToCoord(event.year, scale) - centerCoord);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = event.id;
      }
    }
    return bestId;
  }, [isTouch, onThisDayEvents, orientation, scale, viewState.target]);

  const focusedId = hoveredId ?? centerOtdId;

  const focusedLabel = useMemo(() => {
    if (!focusedId || showOtdLabels || focusedId === selectedEvent?.id) {
      return [];
    }
    const event = onThisDayEvents.find((e) => e.id === focusedId);
    if (!event) return [];
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const spread = otdDotSpreadPx(event.dayIndex) / Math.pow(2, zoom);
    return [
      {
        position: offset(
          yearToCoord(event.year, scale) + spread,
          orientation === "horizontal" ? 20 : PORTRAIT_LABEL_CLEARANCE,
        ),
        text: event.title,
        event,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, showOtdLabels, onThisDayEvents, scale, orientation, selectedEvent, viewState.zoomX, viewState.zoomY]);

  const selectionPin = useMemo(() => {
    if (!selectedEvent) return null;
    const year = selectedEvent.year ?? selectedEvent.startYear;
    if (year == null) return null;
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const dayIndex = (selectedEvent as TimelineEvent).dayIndex;
    const spread =
      dayIndex != null ? otdDotSpreadPx(dayIndex) / Math.pow(2, zoom) : 0;
    const coord = yearToCoord(year, scale) + spread;
    const fill: [number, number, number, number] =
      selectedEvent.significance != null
        ? significanceColor(selectedEvent.significance, 1)
        : [...ON_THIS_DAY_COLOR, 255];
    return {
      position: offset(coord, 0),
      labelPosition:
        orientation === "horizontal" ? offset(coord, 22) : offset(coord, -22),
      fill,
      title: selectedEvent.title,
    };
  }, [selectedEvent, scale, orientation, viewState.zoomX, viewState.zoomY]);

  const layers = useMemo(() => {
    const timeZoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const ticks = generateTicks(scale, timeZoom, visibleCoordRange, coordExtent);

    const eventPoints = events
      .map((event) => {
        const opacity = opacityForSignificance(
          event.significance ?? 0,
          minSignificance,
        );
        if (opacity <= 0) return null;
        return {
          position: offset(yearToCoord(event.year, scale), 0),
          color: significanceColor(event.significance ?? 0, opacity),
          radius: 4.5,
          event,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const labels = events
      .filter((event) => {
        if (event.id === selectedEvent?.id) return false;
        const alpha = labelAlpha[event.id] ?? 0;
        return alpha > 0.02;
      })
      .map((event) => {
        const alpha = labelAlpha[event.id] ?? 0;
        const perp =
          orientation === "horizontal" ? -18 : PORTRAIT_LABEL_CLEARANCE;
        return {
          position: offset(yearToCoord(event.year, scale), perp),
          text: event.title,
          color: [
            ...significanceColor(event.significance ?? 0, 1).slice(0, 3),
            Math.round(230 * alpha),
          ] as [number, number, number, number],
          event,
        };
      });

    const axisData = [
      {
        source: offset(coordExtent[0], 0),
        target: offset(coordExtent[1], 0),
      },
    ];

    const nowData = [
      { source: offset(0, -24), target: offset(0, 24) },
    ];

    // Sticky time ruler: a compact scale pinned to a fixed viewport edge so the
    // current time stays readable however far the lanes are panned perpendicular
    // to the main axis. visiblePerpRange[0] is the low edge of the perpendicular
    // axis: the top of the screen when horizontal (+Y is down), the left edge
    // when vertical (+X is right). Pinning there keeps the ruler clear of the
    // event detail panel and minimap, which are anchored along the bottom.
    const stickyPerp = visiblePerpRange
      ? visiblePerpRange[0] + STICKY_RULER_INSET
      : 0;

    const rulerData = [
      {
        source: offset(coordExtent[0], stickyPerp),
        target: offset(coordExtent[1], stickyPerp),
      },
    ];

    const rulerTicks = ticks.map((t) => ({
      source: offset(t.coord, stickyPerp),
      target: offset(t.coord, stickyPerp + (t.major ? 5 : 3)),
    }));

    const tickLabels = ticks
      .filter((t) => t.label)
      .map((t) => ({
        position: offset(t.coord, stickyPerp + STICKY_RULER_LABEL_OFFSET),
        text: t.label,
        anchor: orientation === "horizontal" ? ("middle" as const) : ("start" as const),
        baseline: orientation === "horizontal" ? ("top" as const) : ("center" as const),
      }));

    const nowLabel =
      orientation === "horizontal"
        ? { position: offset(0, 36), text: `Now · ${NOW}`, anchor: "middle" as const, baseline: "top" as const }
        : { position: offset(0, -30), text: `Now · ${NOW}`, anchor: "end" as const, baseline: "center" as const };

    // When zoomed in so far that no tick label fits in the viewport, pin the
    // current month+year to the deep-past edge so the user never loses track
    // of where they are on the timeline.
    const pinnedTickLabel = (() => {
      if (ticks.some((t) => t.label) || !visibleCoordRange) return [];
      const loCoord = Math.max(visibleCoordRange[0], coordExtent[0]);
      const position = offset(loCoord, stickyPerp + STICKY_RULER_LABEL_OFFSET);
      return [{ position, text: monthYearLabel(coordToYear(loCoord, scale)) }];
    })();

    const zoomScale = Math.pow(2, timeZoom);
    const dotPosition = (d: { coord: number; event: TimelineEvent }) => {
      const spread = otdDotSpreadPx(d.event.dayIndex) / zoomScale;
      return offset(d.coord + spread, 0);
    };

    const laneOptions = { orientation, scale, coordExtent, timeZoom, visibleCoordRange: visibleCoordRange ?? undefined, visiblePerpRange: visiblePerpRange ?? undefined };
    const laneLayers = lanes.flatMap((lane) =>
      buildLaneLayers(lane, laneBands[lane.id], laneOptions),
    );

    // Reference guides run the full perpendicular extent of the viewport. They
    // sit above the lanes so a bar deep in the stack stays traceable to the
    // ruler, but below the ruler itself so its labels keep the last word.
    const referenceGuides: {
      source: [number, number, number];
      target: [number, number, number];
    }[] = (() => {
      if (!visibleCoordRange || !visiblePerpRange) return [];
      const lo = Math.max(visibleCoordRange[0], coordExtent[0]);
      const hi = Math.min(visibleCoordRange[1], coordExtent[1]);
      if (hi <= lo) return [];
      const yLo = coordToYear(lo, scale);
      const yHi = coordToYear(hi, scale);
      const linesAt = (step: number) => {
        const first = Math.ceil(yLo / step) * step;
        const last = Math.floor(yHi / step) * step;
        return {
          first,
          last,
          count: last < first ? 0 : Math.floor((last - first) / step) + 1,
        };
      };
      // A window narrower than a decade boundary has nothing to draw.
      if (linesAt(10).count <= 0) return [];
      // Finest step that keeps the viewport within the cap: decades, then
      // centuries, then millennia.
      let step = GUIDE_STEPS.find((candidate) => {
        const { count } = linesAt(candidate);
        return count >= 1 && count <= MAX_GUIDE_LINES;
      });
      // Only reachable when every rung is either too crowded or misses the
      // window entirely (e.g. decades crowd the screen but the window is too
      // narrow to hold a century). Thin the coarsest rung that does land a
      // line, so they keep to round years instead of going blank.
      if (step === undefined) {
        step =
          GUIDE_STEPS.filter((candidate) => linesAt(candidate).count >= 1).pop() ??
          10;
        const stride = step;
        while (linesAt(step).count > MAX_GUIDE_LINES) step += stride;
      }
      const { first, last, count } = linesAt(step);
      if (count <= 0 || count > MAX_GUIDE_LINES) return [];
      const [perpLo, perpHi] = visiblePerpRange;
      const guides = [];
      for (let year = first; year <= last; year += step) {
        const coord = yearToCoord(year, scale);
        guides.push({
          source: offset(coord, perpLo),
          target: offset(coord, perpHi),
        });
      }
      return guides;
    })();

    return [
      new LineLayer({
        id: "axis",
        data: axisData,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: AXIS_COLOR,
        widthUnits: "pixels",
        getWidth: 1.5,
        pickable: false,
      }),
      ...buildPeriodBands(laneOptions),
      ...laneLayers,
      new LineLayer({
        id: "reference-guides",
        data: referenceGuides,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: GUIDE_COLOR,
        widthUnits: "pixels",
        getWidth: 1,
        pickable: false,
      }),
      new LineLayer({
        id: "ruler",
        data: rulerData,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: AXIS_COLOR,
        widthUnits: "pixels",
        getWidth: 1,
        pickable: false,
      }),
      new LineLayer({
        id: "ruler-ticks",
        data: rulerTicks,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: AXIS_COLOR,
        widthUnits: "pixels",
        getWidth: 1,
        pickable: false,
      }),
      new TextLayer({
        id: "tick-labels",
        data: tickLabels,
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getTextAnchor: (d) => d.anchor,
        getAlignmentBaseline: (d) => d.baseline,
        getColor: TICK_COLOR,
        sizeUnits: "pixels",
        getSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        pickable: false,
      }),
      new TextLayer({
        id: "tick-pinned-label",
        data: pinnedTickLabel,
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getTextAnchor: "start",
        getAlignmentBaseline: orientation === "horizontal" ? "top" : "bottom",
        getColor: TICK_COLOR,
        sizeUnits: "pixels",
        getSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        pickable: false,
      }),
      new LineLayer({
        id: "now",
        data: nowData,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: NOW_COLOR,
        widthUnits: "pixels",
        getWidth: 2,
        pickable: false,
      }),
      new TextLayer({
        id: "now-label",
        data: [nowLabel],
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getTextAnchor: (d) => d.anchor,
        getAlignmentBaseline: (d) => d.baseline,
        getColor: NOW_COLOR,
        sizeUnits: "pixels",
        getSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        characterSet: "auto",
        pickable: false,
      }),
      new ScatterplotLayer({
        id: "events",
        data: eventPoints,
        getPosition: (d) => d.position,
        getFillColor: (d) => d.color,
        getLineColor: [10, 13, 20],
        stroked: true,
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        radiusUnits: "pixels",
        getRadius: (d) => d.radius,
        pickable: true,
        parameters: { depthTest: false },
      }),
      new TextLayer({
        id: "event-labels",
        data: labels,
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getTextAnchor: "start",
        getAlignmentBaseline:
          orientation === "horizontal" ? "bottom" : "center",
        getAngle: orientation === "horizontal" ? LABEL_ANGLE_DEG : 0,
        getColor: (d) => d.color,
        sizeUnits: "pixels",
        getSize: 13,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        characterSet: "auto",
        pickable: true,
        parameters: { depthTest: false },
      }),
      new ScatterplotLayer({
        id: "on-this-day",
        data: onThisDayPoints,
        getPosition: dotPosition,
        getFillColor: ON_THIS_DAY_COLOR,
        getLineColor: [10, 13, 20],
        stroked: true,
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        radiusUnits: "pixels",
        getRadius: (d) =>
          d.event.id === focusedId ? 7 : showOnThisDayLabels ? 5 : 2.5,
        updateTriggers: {
          getPosition: timeZoom,
          getRadius: `${focusedId}|${showOnThisDayLabels}`,
        },
        pickable: false,
        parameters: { depthTest: false },
      }),
      new ScatterplotLayer({
        id: "on-this-day-hit",
        data: onThisDayPoints,
        getPosition: dotPosition,
        getFillColor: [0, 0, 0, 0],
        radiusUnits: "pixels",
        getRadius: ON_THIS_DAY_HIT_RADIUS,
        updateTriggers: { getPosition: timeZoom },
        pickable: true,
        parameters: { depthTest: false },
      }),
      new LineLayer({
        id: "on-this-day-leader-lines",
        data: onThisDayLeaderLines,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: [
          ...ON_THIS_DAY_COLOR,
          Math.round(150 * otdLabelAlpha),
        ] as [number, number, number, number],
        widthUnits: "pixels",
        getWidth: 1,
        pickable: false,
        parameters: { depthTest: false },
      }),
      new TextLayer({
        id: "on-this-day-labels",
        data: onThisDayLabelData,
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getTextAnchor: orientation === "horizontal" ? "middle" : "start",
        getAlignmentBaseline: "center",
        getColor: [
          ...ON_THIS_DAY_COLOR,
          Math.round(255 * otdLabelAlpha),
        ] as [number, number, number, number],
        sizeUnits: "pixels",
        getSize: 12,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        characterSet: "auto",
        pickable: true,
        parameters: { depthTest: false },
      }),
      new TextLayer({
        id: "on-this-day-focus-label",
        data: focusedLabel,
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getTextAnchor: "start",
        getAlignmentBaseline:
          orientation === "horizontal" ? "bottom" : "center",
        getAngle: orientation === "horizontal" ? LABEL_ANGLE_DEG : 0,
        getColor: [...ON_THIS_DAY_COLOR, 255] as [
          number,
          number,
          number,
          number,
        ],
        sizeUnits: "pixels",
        getSize: 13,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        characterSet: "auto",
        pickable: true,
        parameters: { depthTest: false },
      }),
      new ScatterplotLayer({
        id: "selection-pin",
        data: selectionPin ? [selectionPin] : [],
        getPosition: (d) => d.position,
        getFillColor: (d) => d.fill,
        getLineColor: [255, 255, 255],
        stroked: true,
        getLineWidth: 2,
        lineWidthMinPixels: 2,
        radiusUnits: "pixels",
        getRadius: 8,
        pickable: false,
        parameters: { depthTest: false },
      }),
      new TextLayer({
        id: "selection-pin-label",
        data: selectionPin ? [selectionPin] : [],
        getPosition: (d) => d.labelPosition,
        getText: (d) => d.title,
        getTextAnchor: orientation === "horizontal" ? "middle" : "end",
        getAlignmentBaseline:
          orientation === "horizontal" ? "top" : "center",
        getColor: [255, 255, 255, 255],
        sizeUnits: "pixels",
        getSize: 13,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        characterSet: "auto",
        pickable: false,
        parameters: { depthTest: false },
      }),
    ];
  }, [
    events,
    onThisDayEvents,
    onThisDayPoints,
    showOnThisDayLabels,
    otdLabelAlpha,
    selectedEvent,
    lanes,
    laneBands,
    orientation,
    scale,
    minSignificance,
    coordExtent,
    labelAlpha,
    visibleCoordRange,
    visiblePerpRange,
    viewState.zoomX,
    viewState.zoomY,
    focusedId,
    focusedLabel,
    selectionPin,
    onThisDayLabelData,
    onThisDayLeaderLines,
  ]);

  return (
    <DeckGL
      views={view}
      layers={layers}
      viewState={{
        target: [viewState.target[0], viewState.target[1], 0] as [
          number,
          number,
          number,
        ],
        zoomX: viewState.zoomX,
        zoomY: viewState.zoomY,
        zoomAxis: orientation === "horizontal" ? "X" : "Y",
        minZoom: -10,
        maxZoom: 16,
      }}
      controller={true}
      onViewStateChange={({ viewState: vs }) => {
        const t = vs.target ?? [0, 0, 0];
        onViewStateChange({
          target: [t[0], t[1]],
          zoomX: vs.zoomX ?? 0,
          zoomY: vs.zoomY ?? 0,
        });
      }}
      onResize={onResize}
      onHover={(info) => {
        const obj = info.object as
          | { otd?: boolean; event?: TimelineEvent; aggregate?: AggregateInfo }
          | null;
        setHoveredId(obj?.otd ? obj.event?.id ?? null : null);
        if (obj?.aggregate) {
          onHoverAggregate({
            x: info.x,
            y: info.y,
            count: obj.aggregate.count,
            names: obj.aggregate.names,
            unitNoun: obj.aggregate.unitNoun,
          });
        } else {
          onHoverAggregate(null);
        }
      }}
      onClick={(info) => {
        const obj = info.object as
          | {
              event?: TimelineEvent;
              detail?: EntityDetail;
              aggregate?: AggregateInfo;
            }
          | null;
        if (obj?.aggregate) {
          onAggregateNavigate(obj.aggregate.startYear, obj.aggregate.endYear);
          return;
        }
        onSelect(obj?.detail ?? obj?.event ?? null);
      }}
      getCursor={({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
      }
    />
  );
}
