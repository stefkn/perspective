import type { TimelineEvent } from "./types";
import {
  yearToCoord,
  type Orientation,
  type Scale,
} from "./time-transform";
import { buildViewport, type TimeViewState } from "./view-state";

export const LABEL_FONT_SIZE = 13;
export const LABEL_HEIGHT = LABEL_FONT_SIZE * 1.2;
const LABEL_PADDING_PX = 6;
const OFF_SCREEN_MARGIN = 300;

// On-this-day labels render at a slightly smaller size than the main event
// labels. Their vertical extent and the gap between adjacent labels drive the
// lane staggering, so they are kept here (in pixels) rather than spread across
// the renderer.
export const OTD_LABEL_FONT_SIZE = 12;
export const OTD_LABEL_HEIGHT = OTD_LABEL_FONT_SIZE * 1.2;
const OTD_LABEL_GAP = 4;
export const OTD_LABEL_STEP = OTD_LABEL_HEIGHT + OTD_LABEL_GAP;
const OTD_LABEL_PAD_X = 6;
export const OTD_LABEL_BASE = 20;
export const PORTRAIT_LABEL_CLEARANCE = 36;

const COS45 = Math.SQRT1_2;
const SIN45 = Math.SQRT1_2;

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

export function measureWidth(text: string): number {
  const cached = widthCache.get(text);
  if (cached !== undefined) return cached;

  let width: number;
  if (typeof document !== "undefined") {
    if (!measureCtx) {
      const canvas = document.createElement("canvas");
      measureCtx = canvas.getContext("2d");
    }
    if (measureCtx) {
      measureCtx.font = `${LABEL_FONT_SIZE}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      width = measureCtx.measureText(text).width;
    } else {
      width = text.length * LABEL_FONT_SIZE * 0.6;
    }
  } else {
    width = text.length * LABEL_FONT_SIZE * 0.6;
  }

  widthCache.set(text, width);
  return width;
}

export interface LabelBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  significance: number;
  selected: boolean;
}

export function computeLabelBoxes(
  events: TimelineEvent[],
  viewState: TimeViewState,
  size: { width: number; height: number },
  orientation: Orientation,
  scale: Scale,
  selectedId: string | null,
): LabelBox[] {
  if (size.width <= 0 || size.height <= 0) return [];

  const vp = buildViewport(viewState, size.width, size.height);
  const boxes: LabelBox[] = [];
  for (const e of events) {
    const coord = yearToCoord(e.year, scale);
    const perp = orientation === "horizontal" ? -18 : 18;
    const wx = orientation === "horizontal" ? coord : perp;
    const wy = orientation === "horizontal" ? perp : -coord;
    const p = vp.project([wx, wy, 0]);

    if (
      p[0] < -OFF_SCREEN_MARGIN ||
      p[0] > size.width + OFF_SCREEN_MARGIN ||
      p[1] < -OFF_SCREEN_MARGIN ||
      p[1] > size.height + OFF_SCREEN_MARGIN
    ) {
      continue;
    }

    boxes.push({
      id: e.id,
      x: p[0],
      y: p[1],
      w: measureWidth(e.title),
      h: LABEL_HEIGHT,
      significance: e.significance ?? 0,
      selected: e.id === selectedId,
    });
  }
  return boxes;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectOf(box: LabelBox, orientation: Orientation): Rect {
  if (orientation === "horizontal") {
    const t1 = box.x * COS45 - box.y * SIN45;
    const t2 = -box.x * SIN45 - box.y * COS45;
    return {
      x: t1 - LABEL_PADDING_PX,
      y: t2 - LABEL_PADDING_PX,
      w: box.w + LABEL_PADDING_PX * 2,
      h: box.h + LABEL_PADDING_PX * 2,
    };
  }
  return {
    x: box.x - LABEL_PADDING_PX,
    y: box.y - box.h / 2 - LABEL_PADDING_PX,
    w: box.w + LABEL_PADDING_PX * 2,
    h: box.h + LABEL_PADDING_PX * 2,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

export function resolveLabelTargets(
  boxes: LabelBox[],
  orientation: Orientation,
): Record<string, number> {
  const sorted = [...boxes].sort((a, b) => {
    if (a.selected !== b.selected) return a.selected ? -1 : 1;
    if (b.significance !== a.significance) {
      return b.significance - a.significance;
    }
    return a.id < b.id ? -1 : 1;
  });

  const kept: Rect[] = [];
  const targets: Record<string, number> = {};

  for (const box of sorted) {
    const rect = rectOf(box, orientation);
    const collide = kept.some((k) => intersects(rect, k));
    targets[box.id] = collide ? 0 : 1;
    if (!collide) kept.push(rect);
  }

  return targets;
}

// Alternate staggered labels above and below the axis so a cluster stays
// compact: lane 0 -> 0, lane 1 -> -1, lane 2 -> +1, lane 3 -> -2, ...
export function staggerUnits(lane: number): number {
  if (lane <= 0) return 0;
  const level = Math.floor((lane + 1) / 2);
  return (lane % 2 === 1 ? -1 : 1) * level;
}

// Perpendicular offset (in pixels) of a landscape on-this-day label for a
// lane: labels alternate above and below the axis and stack outward.
export function otdPerpOffset(lane: number): number {
  const level = Math.floor(lane / 2);
  const dir = lane % 2 === 0 ? -1 : 1;
  return dir * (OTD_LABEL_BASE + level * OTD_LABEL_STEP);
}

// Time-axis shift (in pixels) of a portrait on-this-day label for a lane.
export function otdTimeShiftPx(lane: number): number {
  return staggerUnits(lane) * OTD_LABEL_STEP;
}

// Assign lanes to on-this-day labels so no two rendered labels overlap. Lanes
// are chosen greedily in time order, but the overlap test uses the label's
// *staggered* position rather than just its raw time extent. This matters in
// portrait, where the stagger shifts labels along the time axis and can land
// one label on top of a neighbour in a different lane.
//
// All sizes are expressed in screen pixels: the time coordinate is scaled by
// the zoom while the perpendicular offset and the label height are already
// pixel-sized, so collisions are checked in a single consistent space.
export function computeOtdLabelLanes(
  events: TimelineEvent[],
  zoom: number,
  scale: Scale,
  orientation: Orientation,
): Record<string, number> {
  const zoomScale = 2 ** zoom;

  const items = events
    .map((event) => {
      const coord = yearToCoord(event.year, scale);
      return {
        id: event.id,
        t: coord * zoomScale,
        w: orientation === "horizontal" ? measureWidth(event.title) : 0,
      };
    })
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));

  const placed: Array<{ t: number; perp: number; w: number }> = [];
  const lanes: Record<string, number> = {};

  for (const item of items) {
    let lane = 0;
    for (;; lane++) {
      const t =
        orientation === "horizontal"
          ? item.t
          : item.t + otdTimeShiftPx(lane);
      const perp =
        orientation === "horizontal" ? otdPerpOffset(lane) : PORTRAIT_LABEL_CLEARANCE;

      let collides = false;
      for (const p of placed) {
        if (orientation === "horizontal") {
          const xGap = (item.w + p.w) / 2 + OTD_LABEL_PAD_X;
          if (Math.abs(t - p.t) < xGap && Math.abs(perp - p.perp) < OTD_LABEL_STEP) {
            collides = true;
            break;
          }
        } else if (Math.abs(t - p.t) < OTD_LABEL_STEP) {
          collides = true;
          break;
        }
      }

      if (!collides) {
        placed.push({ t, perp, w: item.w });
        break;
      }
    }
    lanes[item.id] = lane;
  }

  return lanes;
}
