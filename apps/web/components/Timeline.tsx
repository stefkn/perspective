"use client";

import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { TimelineEvent } from "../lib/types";
import {
  yearToCoord,
  type Orientation,
  type Scale,
} from "../lib/time-transform";
import { opacityForSignificance, significanceColor } from "../lib/significance";
import type { TimeViewState } from "../lib/view-state";

const AXIS_COLOR: [number, number, number] = [0x39, 0x41, 0x4d];
const NOW_COLOR: [number, number, number] = [0x7f, 0xd1, 0xff];

interface TimelineProps {
  events: TimelineEvent[];
  orientation: Orientation;
  scale: Scale;
  viewState: TimeViewState;
  minSignificance: number;
  selectedId: string | null;
  coordExtent: [number, number];
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

  const layers = useMemo(() => {
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

    const axisData = [
      { source: offset(coordExtent[0], 0), target: offset(coordExtent[1], 0) },
    ];

    const nowData = [{ source: offset(0, -24), target: offset(0, 24) }];

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
        id: "now",
        data: nowData,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: NOW_COLOR,
        widthUnits: "pixels",
        getWidth: 2,
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
    ];
  }, [
    events,
    orientation,
    scale,
    minSignificance,
    selectedId,
    coordExtent,
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
      onClick={(info) => onSelect(info.object?.event ?? null)}
      getCursor={({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
      }
    />
  );
}
