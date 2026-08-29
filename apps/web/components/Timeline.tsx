"use client";

import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import {
  LineLayer,
  ScatterplotLayer,
  TextLayer,
  PolygonLayer,
} from "@deck.gl/layers";
import type { TimelineEvent } from "../lib/types";
import {
  yearToCoord,
  NOW,
  type Orientation,
  type Scale,
} from "../lib/time-transform";
import { opacityForSignificance, significanceColor } from "../lib/significance";
import { generateTicks } from "../lib/ticks";
import { assignPeriodLanes, laneOffset, PERIODS } from "../lib/periods";
import type { TimeViewState } from "../lib/view-state";

const AXIS_COLOR: [number, number, number] = [0x39, 0x41, 0x4d];
const TICK_COLOR: [number, number, number] = [0x8a, 0x93, 0xa6];
const NOW_COLOR: [number, number, number] = [0x7f, 0xd1, 0xff];

const LABEL_ANGLE_DEG = 45;

const PERIOD_THICKNESS = 8;
const PERIOD_FILL: [number, number, number, number] = [118, 158, 220, 34];
const PERIOD_STROKE: [number, number, number, number] = [150, 190, 240, 90];
const PERIOD_LABEL_COLOR: [number, number, number, number] = [176, 200, 232, 220];

interface TimelineProps {
  events: TimelineEvent[];
  orientation: Orientation;
  scale: Scale;
  viewState: TimeViewState;
  minSignificance: number;
  selectedId: string | null;
  coordExtent: [number, number];
  labelAlpha: Record<string, number>;
  onViewStateChange: (vs: TimeViewState) => void;
  onResize: (size: { width: number; height: number }) => void;
  onSelect: (event: TimelineEvent | null) => void;
}

export default function Timeline({
  events,
  orientation,
  scale,
  viewState,
  minSignificance,
  selectedId,
  coordExtent,
  labelAlpha,
  onViewStateChange,
  onResize,
  onSelect,
}: TimelineProps) {
  const offset = (coord: number, perp: number): [number, number, number] =>
    orientation === "horizontal" ? [coord, perp, 0] : [perp, -coord, 0];

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

  const periodLanes = useMemo(() => assignPeriodLanes(PERIODS), []);

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
    const timeScale = Math.pow(2, timeZoom);

    const periodBands = periodLanes.map(({ period, lane }) => {
      const c0 = yearToCoord(period.startYear, scale);
      const c1 = yearToCoord(period.endYear, scale);
      const off = laneOffset(lane, PERIOD_THICKNESS);
      const t = PERIOD_THICKNESS / 2;
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
      return { polygon, period };
    });

    const periodLabels = periodLanes
      .map(({ period, lane }) => {
        const c0 = yearToCoord(period.startYear, scale);
        const c1 = yearToCoord(period.endYear, scale);
        const center = (c0 + c1) / 2;
        const off = laneOffset(lane, PERIOD_THICKNESS);
        const bandPixels = (c1 - c0) * timeScale;
        const fits =
          orientation === "horizontal"
            ? bandPixels >= period.title.length * 7 + 12
            : bandPixels >= 13 + 12;
        if (!fits) return null;

        if (orientation === "horizontal") {
          return {
            position: offset(center, off),
            text: period.title,
            anchor: "middle" as const,
            baseline: "center" as const,
          };
        }
        return {
          position: offset(center, off + PERIOD_THICKNESS / 2 + 5),
          text: period.title,
          anchor: "start" as const,
          baseline: "center" as const,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

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
      new PolygonLayer({
        id: "period-bands",
        data: periodBands,
        getPolygon: (d) => d.polygon,
        filled: true,
        getFillColor: PERIOD_FILL,
        stroked: true,
        getLineColor: PERIOD_STROKE,
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        pickable: false,
        parameters: { depthTest: false },
      }),
      new TextLayer({
        id: "period-labels",
        data: periodLabels,
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getTextAnchor: (d) => d.anchor,
        getAlignmentBaseline: (d) => d.baseline,
        getColor: PERIOD_LABEL_COLOR,
        sizeUnits: "pixels",
        getSize: 11,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        pickable: false,
        parameters: { depthTest: false },
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
    orientation,
    scale,
    minSignificance,
    selectedId,
    coordExtent,
    labelAlpha,
    viewState.zoomX,
    viewState.zoomY,
    periodLanes,
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
      onClick={(info) => onSelect(info.object?.event ?? null)}
      getCursor={({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
      }
    />
  );
}
