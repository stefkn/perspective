"use client";

import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import {
  LineLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import type { TimelineEvent } from "../lib/types";
import {
  yearToCoord,
  timeOffset,
  NOW,
  type Orientation,
  type Scale,
} from "../lib/time-transform";
import { opacityForSignificance, significanceColor } from "../lib/significance";
import { generateTicks } from "../lib/ticks";
import type { LaneBand, LaneDefinition, LaneId } from "../lib/lanes";
import { buildPeriodBands, buildLaneLayers } from "./lane-layers";
import { computeOtdLabelLanes } from "../lib/labels";
import type { TimeViewState } from "../lib/view-state";

const AXIS_COLOR: [number, number, number] = [0x39, 0x41, 0x4d];
const TICK_COLOR: [number, number, number] = [0x8a, 0x93, 0xa6];
const NOW_COLOR: [number, number, number] = [0x7f, 0xd1, 0xff];
const ON_THIS_DAY_COLOR: [number, number, number] = [0x4f, 0xd1, 0xc5];
const ON_THIS_DAY_HIT_RADIUS = 14;
const ON_THIS_DAY_LABEL_BASE = 20;
const ON_THIS_DAY_LABEL_SPACING = 16;
const ON_THIS_DAY_LEADER_GAP = 10;
const ON_THIS_DAY_LABEL_EDGE_MARGIN = 120;
const ON_THIS_DAY_DOT_SPREAD_PX = 16;

const LABEL_ANGLE_DEG = 45;

// Alternate staggered labels above and below the axis so a cluster stays
// compact: lane 0 -> 0, lane 1 -> -1, lane 2 -> +1, lane 3 -> -2, ...
function staggerUnits(lane: number): number {
  if (lane <= 0) return 0;
  const level = Math.floor((lane + 1) / 2);
  return (lane % 2 === 1 ? -1 : 1) * level;
}

// Spread coincident (same-day) dots slightly apart in time so each is
// individually selectable: index 0 -> 0, 1 -> -1, 2 -> +1, 3 -> -2, ...
function otdDotSpreadPx(dayIndex: number | undefined): number {
  if (!dayIndex || dayIndex <= 0) return 0;
  const level = Math.floor((dayIndex + 1) / 2);
  return (dayIndex % 2 === 1 ? -1 : 1) * level * ON_THIS_DAY_DOT_SPREAD_PX;
}

interface TimelineProps {
  events: TimelineEvent[];
  onThisDayEvents: TimelineEvent[];
  showOnThisDayLabels: boolean;
  selectedEvent: TimelineEvent | null;
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
  onSelect: (event: TimelineEvent | null) => void;
  onExpandLane: (id: LaneId) => void;
}

export default function Timeline({
  events,
  onThisDayEvents,
  showOnThisDayLabels,
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
  onExpandLane,
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

  // On-this-day positions depend only on the scale/orientation, not the zoom,
  // so keep them out of the zoom-sensitive layer memo to avoid recomputing the
  // full 20k-point buffer on every zoom frame.
  const onThisDayPoints = useMemo(
    () =>
      onThisDayEvents.map((event) => ({
        coord: yearToCoord(event.year, scale),
        event,
        otd: true,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onThisDayEvents, scale],
  );

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

  const otdLabelLanes = useMemo(() => {
    if (!showOnThisDayLabels || onThisDayVisibleEvents.length === 0) {
      return {} as Record<string, number>;
    }
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    return computeOtdLabelLanes(
      onThisDayVisibleEvents,
      zoom,
      scale,
      orientation,
    );
  }, [
    showOnThisDayLabels,
    onThisDayVisibleEvents,
    viewState.zoomX,
    viewState.zoomY,
    scale,
    orientation,
  ]);

  const onThisDayLabelData = useMemo(() => {
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const zoomScale = Math.pow(2, zoom);
    const timeSpacing = ON_THIS_DAY_LABEL_SPACING / zoomScale;
    return onThisDayVisibleEvents
      .filter((event) => otdLabelLanes[event.id] != null)
      .map((event) => {
        const coord =
          yearToCoord(event.year, scale) +
          otdDotSpreadPx(event.dayIndex) / zoomScale;
        const lane = otdLabelLanes[event.id];
        if (orientation === "horizontal") {
          const level = Math.floor(lane / 2);
          const dir = lane % 2 === 0 ? -1 : 1;
          const perp = dir * (ON_THIS_DAY_LABEL_BASE + level * ON_THIS_DAY_LABEL_SPACING);
          return { position: offset(coord, perp), text: event.title, event };
        }
        const shift = staggerUnits(lane) * timeSpacing;
        return {
          position: offset(coord + shift, ON_THIS_DAY_LABEL_BASE),
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
    const timeSpacing = ON_THIS_DAY_LABEL_SPACING / zoomScale;
    return onThisDayVisibleEvents
      .filter((event) => otdLabelLanes[event.id] != null)
      .map((event) => {
        const coord =
          yearToCoord(event.year, scale) +
          otdDotSpreadPx(event.dayIndex) / zoomScale;
        const lane = otdLabelLanes[event.id];
        if (orientation === "horizontal") {
          const level = Math.floor(lane / 2);
          const dir = lane % 2 === 0 ? -1 : 1;
          const perp = dir * (ON_THIS_DAY_LABEL_BASE + level * ON_THIS_DAY_LABEL_SPACING);
          return {
            source: offset(coord, 0),
            target: offset(coord, perp - dir * ON_THIS_DAY_LEADER_GAP),
          };
        }
        const shift = staggerUnits(lane) * timeSpacing;
        return {
          source: offset(coord, 0),
          target: offset(
            coord + shift,
            ON_THIS_DAY_LABEL_BASE - ON_THIS_DAY_LEADER_GAP,
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
    if (!focusedId || showOnThisDayLabels || focusedId === selectedEvent?.id) {
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
          orientation === "horizontal" ? 20 : -20,
        ),
        text: event.title,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, showOnThisDayLabels, onThisDayEvents, scale, orientation, selectedEvent, viewState.zoomX, viewState.zoomY]);

  const selectionPin = useMemo(() => {
    if (!selectedEvent) return null;
    const zoom =
      orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;
    const spread = otdDotSpreadPx(selectedEvent.dayIndex) / Math.pow(2, zoom);
    const coord = yearToCoord(selectedEvent.year, scale) + spread;
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
    const ticks = generateTicks(scale);

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
        const perp = orientation === "horizontal" ? -18 : 18;
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

    const tickMarks = ticks.map((t) => ({
      source: offset(t.coord, t.major ? -8 : -4),
      target: offset(t.coord, t.major ? 8 : 4),
    }));

    const tickLabels = ticks.map((t) => {
      if (orientation === "horizontal") {
        return {
          position: offset(t.coord, 16),
          text: t.label,
          anchor: "middle" as const,
          baseline: "top" as const,
        };
      }
      return {
        position: offset(t.coord, -16),
        text: t.label,
        anchor: "end" as const,
        baseline: "center" as const,
      };
    });

    const nowLabel =
      orientation === "horizontal"
        ? { position: offset(0, 36), text: `Now · ${NOW}`, anchor: "middle" as const, baseline: "top" as const }
        : { position: offset(0, -30), text: `Now · ${NOW}`, anchor: "end" as const, baseline: "center" as const };

    const timeZoom = orientation === "horizontal" ? viewState.zoomX : viewState.zoomY;

    const zoomScale = Math.pow(2, timeZoom);
    const dotPosition = (d: { coord: number; event: TimelineEvent }) => {
      const spread = otdDotSpreadPx(d.event.dayIndex) / zoomScale;
      return offset(d.coord + spread, 0);
    };

    const laneOptions = { orientation, scale, coordExtent, timeZoom, visibleCoordRange: visibleCoordRange ?? undefined, visiblePerpRange: visiblePerpRange ?? undefined };
    const laneLayers = lanes.flatMap((lane) =>
      buildLaneLayers(lane, laneBands[lane.id], laneOptions),
    );

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
      new LineLayer({
        id: "ticks",
        data: tickMarks,
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
      ...buildPeriodBands(laneOptions),
      ...laneLayers,
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
        pickable: false,
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
        getColor: [...ON_THIS_DAY_COLOR, 150] as [
          number,
          number,
          number,
          number,
        ],
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
        getColor: [...ON_THIS_DAY_COLOR, 255] as [
          number,
          number,
          number,
          number,
        ],
        sizeUnits: "pixels",
        getSize: 12,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        characterSet: "auto",
        pickable: false,
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
        pickable: false,
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
    showOnThisDayLabels,
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
        const obj = info.object as { otd?: boolean; event?: TimelineEvent } | null;
        setHoveredId(obj?.otd ? obj.event?.id ?? null : null);
      }}
      onClick={(info) => {
        const laneId = info.object?.laneId as LaneId | undefined;
        if (laneId) {
          onExpandLane(laneId);
          return;
        }
        onSelect(info.object?.event ?? null);
      }}
      getCursor={({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
      }
    />
  );
}
