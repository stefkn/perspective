import { OrthographicViewport } from "@deck.gl/core";
import { coordToYear, type Orientation, type Scale } from "./time-transform";

export interface TimeViewState {
  target: [number, number];
  zoomX: number;
  zoomY: number;
}

export function buildViewport(
  viewState: TimeViewState,
  width: number,
  height: number,
): OrthographicViewport {
  return new OrthographicViewport({
    width,
    height,
    target: [viewState.target[0], viewState.target[1], 0],
    zoomX: viewState.zoomX,
    zoomY: viewState.zoomY,
  });
}

export function visibleTimeCoordRange(
  viewState: TimeViewState,
  width: number,
  height: number,
  orientation: Orientation,
): [number, number] {
  const vp = buildViewport(viewState, width, height);
  const [minX, minY, maxX, maxY] = vp.getBounds();
  return orientation === "horizontal" ? [minX, maxX] : [-maxY, -minY];
}

export function visibleYearSpan(
  viewState: TimeViewState,
  width: number,
  height: number,
  orientation: Orientation,
  scale: Scale,
  coordExtent?: [number, number],
): number {
  const [cMin, cMax] = visibleTimeCoordRange(viewState, width, height, orientation);
  const lo = coordExtent ? Math.max(cMin, coordExtent[0]) : cMin;
  const hi = coordExtent ? Math.min(cMax, coordExtent[1]) : cMax;
  if (hi <= lo) return 0;
  return coordToYear(hi, scale) - coordToYear(lo, scale);
}

export function visibleBounds(
  viewState: TimeViewState,
  width: number,
  height: number,
  orientation: Orientation,
): [number, number, number, number] {
  const vp = buildViewport(viewState, width, height);
  return vp.getBounds();
}
