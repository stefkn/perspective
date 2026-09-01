"use client";

import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { OrthographicView } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";
import { LineLayer, PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { TimelineEvent } from "../lib/types";
import {
  yearToCoord,
  type Orientation,
  type Scale,
} from "../lib/time-transform";
import { significanceColor } from "../lib/significance";

interface MinimapProps {
  events: TimelineEvent[];
  orientation: Orientation;
  scale: Scale;
  coordExtent: [number, number];
  visibleBounds: [number, number, number, number];
  onNavigate: (timeCoord: number) => void;
}

const HORIZONTAL_SIZE = { width: 240, height: 56 };
const VERTICAL_SIZE = { width: 56, height: 240 };
const PAD = 0.86;

export default function Minimap({
  events,
  orientation,
  scale,
  coordExtent,
  visibleBounds,
  onNavigate,
}: MinimapProps) {
  const size =
    orientation === "horizontal" ? HORIZONTAL_SIZE : VERTICAL_SIZE;
  const extent = coordExtent[1] - coordExtent[0];
  const center = (coordExtent[0] + coordExtent[1]) / 2;

  const viewState = useMemo(() => {
    if (orientation === "horizontal") {
      const zoom = Math.log2((size.width * PAD) / extent);
      return {
        target: [center, 0, 0] as [number, number, number],
        zoomX: zoom,
        zoomY: 0,
      };
    }
    const zoom = Math.log2((size.height * PAD) / extent);
    return {
      target: [0, -center, 0] as [number, number, number],
      zoomX: 0,
      zoomY: zoom,
    };
  }, [orientation, extent, center, size.width, size.height]);

  const view = useMemo(() => new OrthographicView({ id: "minimap" }), []);

  const handlePick = (info: PickingInfo) => {
    const coord = info.coordinate;
    if (!coord) return;
    const timeCoord = orientation === "horizontal" ? coord[0] : -coord[1];
    onNavigate(timeCoord);
  };

  const layers = useMemo(() => {
    const offset = (coord: number, perp: number): [number, number, number] =>
      orientation === "horizontal" ? [coord, perp, 0] : [perp, -coord, 0];

    const topEvents = events
      .filter((e) => e.significance >= 0.8)
      .map((e) => ({
        position: offset(yearToCoord(e.year, scale), 0),
        color: significanceColor(e.significance, 0.9),
      }));

    const axis = [
      {
        source: offset(coordExtent[0], 0),
        target: offset(coordExtent[1], 0),
      },
    ];

    const [minX, minY, maxX, maxY] = visibleBounds;
    const rect = [
      {
        polygon: [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
        ],
      },
    ];

    return [
      new LineLayer({
        id: "minimap-axis",
        data: axis,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getColor: [0x39, 0x41, 0x4d],
        widthUnits: "pixels",
        getWidth: 1.5,
        pickable: false,
      }),
      new ScatterplotLayer({
        id: "minimap-events",
        data: topEvents,
        getPosition: (d) => d.position,
        getFillColor: (d) => d.color,
        radiusUnits: "pixels",
        getRadius: 2.5,
        pickable: false,
        parameters: { depthTest: false },
      }),
      new PolygonLayer({
        id: "minimap-viewport-rect",
        data: rect,
        getPolygon: (d) => d.polygon,
        filled: true,
        getFillColor: [255, 255, 255, 22],
        stroked: true,
        getLineColor: [255, 255, 255, 150],
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        pickable: false,
      }),
    ];
  }, [events, orientation, scale, coordExtent, visibleBounds]);

  return (
    <DeckGL
      views={view}
      layers={layers}
      viewState={viewState}
      controller={false}
      width={size.width}
      height={size.height}
      onClick={handlePick}
      onDrag={handlePick}
      getCursor={() => "pointer"}
    />
  );
}
