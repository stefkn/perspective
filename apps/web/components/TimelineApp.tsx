"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { EVENTS } from "../lib/events";
import type { TimelineEvent } from "../lib/types";
import {
  yearToCoord,
  coordToYear,
  PIXELS_PER_LINEAR_YEAR,
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
import {
  loadOnThisDayEvents,
  OTD_DOT_SPAN_DAYS,
  OTD_LABEL_SPAN_DAYS,
} from "../lib/on-this-day";

import EventDetail from "./EventDetail";
import FallbackTimeline from "./FallbackTimeline";
import DeckGLErrorBoundary from "./DeckGLErrorBoundary";
import LaneToggles from "./LaneToggles";

const Timeline = dynamic(() => import("./Timeline"), { ssr: false });
const Minimap = dynamic(() => import("./Minimap"), { ssr: false });

const MAX_ZOOM = 16;
const FIT_PAD = 1.15;

const INTRO_SPAN_YEARS = 70;
const INTRO_DURATION_MS = 9000;

const OTD_LABEL_SAMPLE_COUNT = 100;
const OTD_LABEL_SAMPLE_COUNT_MOBILE = 15;
const MOBILE_MAX_WIDTH = 640;

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
  const [scale, setScale] = useState<Scale>("linear");

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
  const lastViewStateRef = useRef<{ center: number; zoom: number; perp: number } | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const selectedId = selectedEvent?.id ?? null;
  const [onThisDayEvents, setOnThisDayEvents] = useState<TimelineEvent[]>([]);
  const [webglSupported, setWebglSupported] = useState(true);
  const [otdShowcaseAlpha, setOtdShowcaseAlpha] = useState(0);
  const [introDone, setIntroDone] = useState(false);

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

  const animRafRef = useRef(0);
  const animCancelRef = useRef<(() => void) | null>(null);

  // Animate the time axis between two (zoom, rightEdge) states. The center is
  // derived from the right edge so the view zooms toward the present instead
  // of panning past it, keeping the motion readable.
  const animateView = useCallback(
    (
      start: { zoom: number; right: number },
      end: { zoom: number; right: number },
      dim: number,
      duration: number,
      onComplete?: () => void,
    ) => {
      animCancelRef.current?.();
      const startTime = performance.now();
      let finished = false;
      const ease = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const tick = (now: number) => {
        if (finished) return;
        const t = Math.min((now - startTime) / duration, 1);
        const e = ease(t);
        const zoom = start.zoom + (end.zoom - start.zoom) * e;
        const right = start.right + (end.right - start.right) * e;
        setTimeCenter(right - dim / (2 * Math.pow(2, zoom)));
        setTimeZoom(zoom);
        if (t < 1) {
          animRafRef.current = requestAnimationFrame(tick);
        } else {
          finished = true;
          onComplete?.();
        }
      };
      animRafRef.current = requestAnimationFrame(tick);
      animCancelRef.current = () => {
        finished = true;
        cancelAnimationFrame(animRafRef.current);
      };
    },
    [],
  );

  const showcaseRafRef = useRef(0);
  const showcaseCancelRef = useRef<(() => void) | null>(null);
  const showcaseStartedRef = useRef(false);

  // Briefly surface the on-this-day labels after the intro settles, so the
  // user sees that the dots are individual recorded events before the labels
  // fade back out.
  const startOtdShowcase = useCallback(() => {
    showcaseCancelRef.current?.();
    const FADE_MS = 600;
    const HOLD_MS = 2400;
    const startTime = performance.now();
    let finished = false;

    const tick = (now: number) => {
      if (finished) return;
      const t = now - startTime;
      let alpha: number;
      if (t < FADE_MS) alpha = t / FADE_MS;
      else if (t < FADE_MS + HOLD_MS) alpha = 1;
      else if (t < FADE_MS + HOLD_MS + FADE_MS) {
        alpha = 1 - (t - FADE_MS - HOLD_MS) / FADE_MS;
      } else {
        alpha = 0;
        finished = true;
      }
      setOtdShowcaseAlpha(alpha);
      if (!finished) showcaseRafRef.current = requestAnimationFrame(tick);
    };
    showcaseRafRef.current = requestAnimationFrame(tick);
    showcaseCancelRef.current = () => {
      finished = true;
      cancelAnimationFrame(showcaseRafRef.current);
    };
  }, []);

  useEffect(() => {
    const cancel = () => {
      animCancelRef.current?.();
      showcaseCancelRef.current?.();
      showcaseStartedRef.current = true;
      setOtdShowcaseAlpha(0);
    };
    window.addEventListener("wheel", cancel, { passive: true, capture: true });
    window.addEventListener("pointerdown", cancel, { capture: true });
    return () => {
      window.removeEventListener("wheel", cancel, { capture: true });
      window.removeEventListener("pointerdown", cancel, { capture: true });
    };
  }, []);

  const introStartedRef = useRef(false);

  useEffect(() => {
    if (introStartedRef.current) return;
    if (size.width <= 0 || size.height <= 0) return;
    introStartedRef.current = true;

    const dim = orientation === "horizontal" ? size.width : size.height;
    const extent = coordExtent[1] - coordExtent[0];

    const fitZoom = Math.log2(dim / (extent * FIT_PAD));
    const fitRight = (extent * (FIT_PAD - 1)) / 2;

    const endZoom = Math.log2(dim / (INTRO_SPAN_YEARS * PIXELS_PER_LINEAR_YEAR));

    // On portrait the present day sits at the top edge, so pin it there for
    // the whole zoom instead of letting it drift inward toward the center.
    const startRight = orientation === "horizontal" ? fitRight : 0;

    animateView(
      { zoom: fitZoom, right: startRight },
      { zoom: endZoom, right: 0 },
      dim,
      INTRO_DURATION_MS,
      () => setIntroDone(true),
    );
  }, [size, orientation, coordExtent, animateView]);

  // Start the label showcase once the intro has finished AND the on-this-day
  // events have loaded, so the labels never flash over an empty view.
  useEffect(() => {
    if (
      showcaseStartedRef.current ||
      !introDone ||
      onThisDayEvents.length === 0
    ) {
      return;
    }
    showcaseStartedRef.current = true;
    startOtdShowcase();
  }, [introDone, onThisDayEvents, startOtdShowcase]);

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

  const visibleSpanYears = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return 0;
    return visibleYearSpan(
      viewState,
      size.width,
      size.height,
      orientation,
      scale,
      coordExtent,
    );
  }, [viewState, size, orientation, scale, coordExtent]);

  const minSignificance = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return LOD_MAX_MIN_SIG;
    return spanToMinSignificance(visibleSpanYears);
  }, [visibleSpanYears, size]);

  const onThisDayActive =
    visibleSpanYears > 0 &&
    visibleSpanYears * 365.25 < OTD_DOT_SPAN_DAYS;
  const showOnThisDayLabels =
    visibleSpanYears > 0 &&
    visibleSpanYears * 365.25 < OTD_LABEL_SPAN_DAYS;
  const showOtdLabels = showOnThisDayLabels || otdShowcaseAlpha > 0;
  const otdLabelAlpha = otdShowcaseAlpha > 0 ? otdShowcaseAlpha : 1;
  const otdLabelSampleCount =
    size.width > 0 && size.width < MOBILE_MAX_WIDTH
      ? OTD_LABEL_SAMPLE_COUNT_MOBILE
      : OTD_LABEL_SAMPLE_COUNT;

  // Warm the on-this-day cache at startup so the dots are ready by the time
  // the intro zoom reaches them, even on slow mobile connections.
  useEffect(() => {
    loadOnThisDayEvents().catch(() => {});
  }, []);

  useEffect(() => {
    if (!onThisDayActive) {
      setOnThisDayEvents([]);
      return;
    }
    let cancelled = false;
    loadOnThisDayEvents()
      .then((events) => {
        if (!cancelled) setOnThisDayEvents(events);
      })
      .catch(() => {
        if (!cancelled) setOnThisDayEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [onThisDayActive]);

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
      const extent = coordExtent[1] - coordExtent[0];
      const dim = orientation === "horizontal" ? size.width : size.height;
      const fit = dim > 0 ? Math.log2(dim / (extent * FIT_PAD)) : -Infinity;

      let center: number;
      let zoom: number;
      let perp: number;
      if (orientation === "horizontal") {
        center = clampCoord(vs.target[0], coordExtent);
        zoom = Math.min(Math.max(vs.zoomX, fit), MAX_ZOOM);
        perp = clampPerp(vs.target[1]);
      } else {
        center = clampCoord(-vs.target[1], coordExtent);
        zoom = Math.min(Math.max(vs.zoomY, fit), MAX_ZOOM);
        perp = clampPerp(vs.target[0]);
      }

      const prev = lastViewStateRef.current;
      if (
        prev &&
        Math.abs(prev.center - center) < 1e-6 &&
        Math.abs(prev.zoom - zoom) < 1e-6 &&
        Math.abs(prev.perp - perp) < 1e-6
      ) {
        return;
      }
      lastViewStateRef.current = { center, zoom, perp };

      setTimeCenter(center);
      setTimeZoom(zoom);
      setPerpOffset(perp);
    },
    [orientation, coordExtent, size, clampPerp],
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
    setPerpOffset(0);
    setExpandedLaneId(null);

    const extent = coordExtent[1] - coordExtent[0];
    const dim = orientation === "horizontal" ? size.width : size.height;
    if (dim <= 0) return;

    const fitZoom = Math.log2(dim / (extent * FIT_PAD));
    const fitRight = (extent * (FIT_PAD - 1)) / 2;

    const curZoom = Math.min(Math.max(timeZoom, fitZoom), MAX_ZOOM);
    const curCenter = clampCoord(timeCenter, coordExtent);
    const curRight = curCenter + dim / (2 * Math.pow(2, curZoom));

    // Longer trip when zoomed further in: 3s at rest up to 10s fully zoomed.
    const t = (curZoom - fitZoom) / Math.max(MAX_ZOOM - fitZoom, 1);
    const duration = 3000 + t * 7000;

    animateView(
      { zoom: curZoom, right: curRight },
      { zoom: fitZoom, right: fitRight },
      dim,
      duration,
    );
  }, [orientation, size, coordExtent, timeCenter, timeZoom, animateView]);

  const handleMinimapNavigate = useCallback(
    (timeCoord: number) => {
      setTimeCenter(clampCoord(timeCoord, coordExtent));
    },
    [coordExtent],
  );

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
                onSelect={setSelectedEvent}
              />
            }
          >
            <Timeline
              events={EVENTS}
              onThisDayEvents={onThisDayEvents}
              showOnThisDayLabels={showOnThisDayLabels}
              showOtdLabels={showOtdLabels}
              otdLabelAlpha={otdLabelAlpha}
              otdLabelSampleCount={otdLabelSampleCount}
              selectedEvent={selectedEvent}
              lanes={visibleLanes}
              laneBands={laneLayout.bands}
              orientation={orientation}
              scale={scale}
              viewState={viewState}
              minSignificance={minSignificance}
              coordExtent={coordExtent}
              labelAlpha={labelAlpha}
              visibleCoordRange={visibleCoordRange}
              visiblePerpRange={visiblePerpRange}
              onViewStateChange={handleViewStateChange}
              onResize={handleResize}
              onSelect={setSelectedEvent}
              onExpandLane={toggleExpanded}
            />

            <div className="minimap-wrap">
              <Minimap
                events={EVENTS}
                orientation={orientation}
                scale={scale}
                coordExtent={coordExtent}
                visibleBounds={bounds}
                onNavigate={handleMinimapNavigate}
              />
            </div>
          </DeckGLErrorBoundary>
        ) : (
          <FallbackTimeline
            events={EVENTS}
            selectedId={selectedId}
            onSelect={setSelectedEvent}
          />
        )}

        {selectedEvent && (
          <EventDetail
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </main>
    </div>
  );
}
