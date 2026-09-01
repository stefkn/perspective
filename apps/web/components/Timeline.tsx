"use client";

import { useMemo } from "react";
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
import type { TimeViewState } from "../lib/view-state";

const AXIS_COLOR: [number, number, number] = [0x39, 0x41, 0x4d];
const TICK_COLOR: [number, number, number] = [0x8a, 0x93, 0xa6];
const NOW_COLOR: [number, number, number] = [0x7f, 0xd1, 0xff];

const LABEL_ANGLE_DEG = 45;

interface TimelineProps {
  events: TimelineEvent[];
  lanes: LaneDefinition[];
  laneBands: Record<LaneId, LaneBand>;
  orientation: Orientation;
  scale: Scale;
  viewState: TimeViewState;
  minSignificance: number;
  selectedId: string | null;
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
  lanes,
  laneBands,
  orientation,
  scale,
  viewState,
  minSignificance,
  selectedId,
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

  const layers = useMemo(() => {
    const ticks = generateTicks(scale);

    const eventPoints = events
      .map((event) => {
        const selected = event.id === selectedId;
        const opacity = opacityForSignificance(
          event.significance,
          minSignificance,
        );
        if (opacity <= 0 && !selected) return null;
        return {
          position: offset(yearToCoord(event.year, scale), 0),
          color: significanceColor(event.significance, selected ? 1 : opacity),
          radius: selected ? 7 : 4.5,
          opacity,
          event,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const labels = events
      .filter((event) => {
        const alpha =
          event.id === selectedId ? 1 : labelAlpha[event.id] ?? 0;
        return alpha > 0.02;
      })
      .map((event) => {
        const alpha =
          event.id === selectedId ? 1 : labelAlpha[event.id] ?? 0;
        const perp = orientation === "horizontal" ? -18 : 18;
        return {
          position: offset(yearToCoord(event.year, scale), perp),
          text: event.title,
          color: [
            ...significanceColor(event.significance, 1).slice(0, 3),
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
        pickable: false,
        parameters: { depthTest: false },
      }),
    ];
  }, [
    events,
    lanes,
    laneBands,
    orientation,
    scale,
    minSignificance,
    selectedId,
    coordExtent,
    labelAlpha,
    visibleCoordRange,
    visiblePerpRange,
    viewState.zoomX,
    viewState.zoomY,
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
        maxZoom: 8,
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
