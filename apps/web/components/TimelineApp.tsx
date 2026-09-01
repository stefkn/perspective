"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { EVENTS } from "../lib/events";
import {
  yearToCoord,
  coordToYear,
  type Orientation,
  type Scale,
} from "../lib/time-transform";
import {
  spanToMinSignificance,
  LOD_MAX_MIN_SIG,
} from "../lib/significance";
import {
  visibleBounds,
  visibleTimeCoordRange,
  visibleYearSpan,
  type TimeViewState,
} from "../lib/view-state";
import { computeLabelBoxes, resolveLabelTargets } from "../lib/labels";
import { isWebGL2Supported } from "../lib/webgl";
import { LANES, layoutLaneBands, type LaneId } from "../lib/lanes";

import EventDetail from "./EventDetail";
import FallbackTimeline from "./FallbackTimeline";
import DeckGLErrorBoundary from "./DeckGLErrorBoundary";
import LaneToggles from "./LaneToggles";

const Timeline = dynamic(() => import("./Timeline"), { ssr: false });
const Minimap = dynamic(() => import("./Minimap"), { ssr: false });

const MAX_ZOOM = 8;
const FIT_PAD = 1.15;

function clampCoord(coord: number, extent: [number, number]): number {
  return Math.min(Math.max(coord, extent[0]), extent[1]);
}

function computeCoordExtent(scale: Scale): [number, number] {
  const minYear = Math.min(...EVENTS.map((e) => e.year), -3000);
  return [yearToCoord(minYear, scale), 0];
}

function useAnimatedAlphas(
  targets: Record<string, number>,
): Record<string, number> {
  const [alphas, setAlphas] = useState<Record<string, number>>({});
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const alphasRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = targetsRef.current;
      const current = alphasRef.current;
      const next: Record<string, number> = {};
      let changed = false;
      for (const id of new Set([
        ...Object.keys(target),
        ...Object.keys(current),
      ])) {
        const t = target[id] ?? 0;
        const c = current[id] ?? 0;
        let n = c + (t - c) * 0.18;
        if (Math.abs(t - n) < 0.01) n = t;
        if (n > 0.004) next[id] = n;
        if (Math.abs(n - c) > 0.003) changed = true;
      }
      alphasRef.current = next;
      if (changed) setAlphas(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return alphas;
}

export default function TimelineApp() {
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [scale, setScale] = useState<Scale>("log");

  const coordExtent = useMemo<[number, number]>(
    () => computeCoordExtent(scale),
    [scale],
  );

  const [timeCenter, setTimeCenter] = useState(
    () => (coordExtent[0] + coordExtent[1]) / 2,
  );
  const [timeZoom, setTimeZoom] = useState(0.6);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const fittedRef = useRef(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [webglSupported, setWebglSupported] = useState(true);

  const [visibility, setVisibility] = useState<Record<LaneId, boolean>>(() => {
    const initial = {} as Record<LaneId, boolean>;
    for (const lane of LANES) initial[lane.id] = lane.defaultVisible;
    return initial;
  });

  const [expandedLaneId, setExpandedLaneId] = useState<LaneId | null>(null);
  const [perpOffset, setPerpOffset] = useState(0);

  const toggleLane = useCallback((id: LaneId) => {
    setVisibility((v) => {
      const next = { ...v, [id]: !v[id] };
      if (!next[id]) setExpandedLaneId((e) => (e === id ? null : e));
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((id: LaneId) => {
    setExpandedLaneId((e) => (e === id ? null : id));
  }, []);

  const visibleLanes = useMemo(
    () => LANES.filter((lane) => visibility[lane.id]),
    [visibility],
  );

  const perpSize =
    orientation === "horizontal" ? size.height : size.width;

  const laneLayout = useMemo(
    () => layoutLaneBands(visibleLanes, perpSize, expandedLaneId),
    [visibleLanes, perpSize, expandedLaneId],
  );

  const clampPerp = useCallback(
    (offset: number) => {
      const half = perpSize / 2;
      const overflowNeg = Math.max(0, laneLayout.negExtent - half);
      const overflowPos = Math.max(0, laneLayout.posExtent - half);
      return Math.min(Math.max(offset, -overflowNeg), overflowPos);
    },
    [laneLayout, perpSize],
  );

  useEffect(() => {
    setPerpOffset((p) => clampPerp(p));
  }, [clampPerp]);

  useEffect(() => {
    const update = () =>
      setOrientation(
        window.innerWidth >= window.innerHeight ? "horizontal" : "vertical",
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    setWebglSupported(isWebGL2Supported());
  }, []);

  const viewState = useMemo<TimeViewState>(() => {
    const extent = coordExtent[1] - coordExtent[0];
    const dim = orientation === "horizontal" ? size.width : size.height;
    let zoom = timeZoom;
    if (dim > 0) {
      const fit = Math.log2(dim / (extent * FIT_PAD));
      zoom = Math.min(Math.max(timeZoom, fit), MAX_ZOOM);
    }
    const coord = clampCoord(timeCenter, coordExtent);
    const perp = clampPerp(perpOffset);
    if (orientation === "horizontal") {
      return { target: [coord, perp], zoomX: zoom, zoomY: 0 };
    }
    return { target: [perp, -coord], zoomX: 0, zoomY: zoom };
  }, [timeCenter, timeZoom, orientation, size, coordExtent, perpOffset, clampPerp]);

  const minSignificance = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return LOD_MAX_MIN_SIG;
    const span = visibleYearSpan(
      viewState,
      size.width,
      size.height,
      orientation,
      scale,
      coordExtent,
    );
    return spanToMinSignificance(span);
  }, [viewState, size, orientation, scale, coordExtent]);

  const bounds = useMemo<[number, number, number, number]>(() => {
    if (size.width <= 0 || size.height <= 0) {
      return [
        coordExtent[0],
        -100,
        coordExtent[1],
        100,
      ];
    }
    return visibleBounds(viewState, size.width, size.height, orientation);
  }, [viewState, size, orientation, coordExtent]);

  const visibleCoordRange = useMemo<[number, number] | null>(() => {
    if (size.width <= 0 || size.height <= 0) return null;
    return visibleTimeCoordRange(
      viewState,
      size.width,
      size.height,
      orientation,
    );
  }, [viewState, size, orientation]);

  const visiblePerpRange = useMemo<[number, number] | null>(() => {
    if (size.width <= 0 || size.height <= 0) return null;
    const [minX, minY, maxX, maxY] = bounds;
    return orientation === "horizontal" ? [minY, maxY] : [minX, maxX];
  }, [bounds, orientation, size]);

  const labelBoxes = useMemo(
    () =>
      computeLabelBoxes(
        EVENTS,
        viewState,
        size,
        orientation,
        scale,
        selectedId,
      ),
    [viewState, size, orientation, scale, selectedId],
  );

  const labelTargets = useMemo(
    () => resolveLabelTargets(labelBoxes, orientation),
    [labelBoxes, orientation],
  );

  const labelAlpha = useAnimatedAlphas(labelTargets);

  const handleViewStateChange = useCallback(
    (vs: TimeViewState) => {
      if (orientation === "horizontal") {
        setTimeCenter(vs.target[0]);
        setTimeZoom(vs.zoomX);
        setPerpOffset(clampPerp(vs.target[1]));
      } else {
        setTimeCenter(-vs.target[1]);
        setTimeZoom(vs.zoomY);
        setPerpOffset(clampPerp(vs.target[0]));
      }
    },
    [orientation, clampPerp],
  );

  const handleResize = useCallback(
    (s: { width: number; height: number }) => {
      setSize(s);
      if (!fittedRef.current && s.width > 0 && s.height > 0) {
        fittedRef.current = true;
        const extent = coordExtent[1] - coordExtent[0];
        const dim = orientation === "horizontal" ? s.width : s.height;
        setTimeCenter((coordExtent[0] + coordExtent[1]) / 2);
        setTimeZoom(Math.log2(dim / (extent * FIT_PAD)));
      }
    },
    [orientation, coordExtent],
  );

  const resetView = useCallback(() => {
    const extent = coordExtent[1] - coordExtent[0];
    const dim = orientation === "horizontal" ? size.width : size.height;
    setTimeCenter((coordExtent[0] + coordExtent[1]) / 2);
    setTimeZoom(
      dim > 0 ? Math.log2(dim / (extent * FIT_PAD)) : 0.6,
    );
    setPerpOffset(0);
    setExpandedLaneId(null);
  }, [orientation, size, coordExtent]);

  const toggleScale = useCallback(() => {
    const next: Scale = scale === "log" ? "linear" : "log";
    const dim = orientation === "horizontal" ? size.width : size.height;

    if (dim <= 0) {
      const centerYear = coordToYear(timeCenter, scale);
      setScale(next);
      setTimeCenter(yearToCoord(centerYear, next));
      return;
    }

    // Preserve the visible time range across the scale switch.
    const [cMin, cMax] = visibleTimeCoordRange(
      viewState,
      size.width,
      size.height,
      orientation,
    );
    const loCoord = Math.max(cMin, coordExtent[0]);
    const hiCoord = Math.min(cMax, coordExtent[1]);
    const loYear = coordToYear(loCoord, scale);
    const hiYear = coordToYear(hiCoord, scale);

    const newLo = yearToCoord(loYear, next);
    const newHi = yearToCoord(hiYear, next);
    const span = Math.max(newHi - newLo, 1);

    setScale(next);
    setTimeCenter((newLo + newHi) / 2);
    setTimeZoom(Math.log2(dim / span));
  }, [scale, timeCenter, orientation, size, viewState, coordExtent]);

  const selectedEvent = selectedId
    ? EVENTS.find((e) => e.id === selectedId) ?? null
    : null;

  return (
    <div
      className={`timeline-app ${
        orientation === "horizontal"
          ? "orientation-horizontal"
          : "orientation-vertical"
      }`}
    >
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-name">Perspective</span>
        </div>
        <div className="app-header-hint">
          Scroll to zoom · Drag to pan · Click an event
        </div>
        <div className="scale-toggle" role="group" aria-label="Time scale">
          <button
            className={scale === "log" ? "active" : ""}
            onClick={() => scale !== "log" && toggleScale()}
          >
            Log
          </button>
          <button
            className={scale === "linear" ? "active" : ""}
            onClick={() => scale !== "linear" && toggleScale()}
          >
            Linear
          </button>
        </div>
        <LaneToggles
          lanes={LANES}
          visibility={visibility}
          onToggle={toggleLane}
        />
        <button className="app-reset" onClick={resetView}>
          Reset view
        </button>
      </header>

      <main className="timeline-stage">
        {webglSupported ? (
          <DeckGLErrorBoundary
            fallback={
              <FallbackTimeline
                events={EVENTS}
                selectedId={selectedId}
                onSelect={(e) => setSelectedId(e ? e.id : null)}
              />
            }
          >
            <Timeline
              events={EVENTS}
              lanes={visibleLanes}
              laneBands={laneLayout.bands}
              orientation={orientation}
              scale={scale}
              viewState={viewState}
              minSignificance={minSignificance}
              selectedId={selectedId}
              coordExtent={coordExtent}
              labelAlpha={labelAlpha}
              visibleCoordRange={visibleCoordRange}
              visiblePerpRange={visiblePerpRange}
              onViewStateChange={handleViewStateChange}
              onResize={handleResize}
              onSelect={(e) => setSelectedId(e ? e.id : null)}
              onExpandLane={toggleExpanded}
            />

            <div className="minimap-wrap">
              <Minimap
                events={EVENTS}
                orientation={orientation}
                scale={scale}
                coordExtent={coordExtent}
                visibleBounds={bounds}
              />
            </div>
          </DeckGLErrorBoundary>
        ) : (
          <FallbackTimeline
            events={EVENTS}
            selectedId={selectedId}
            onSelect={(e) => setSelectedId(e ? e.id : null)}
          />
        )}

        {selectedEvent && (
          <EventDetail
            event={selectedEvent}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  );
}
