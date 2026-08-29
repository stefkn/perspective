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

const COS45 = Math.SQRT1_2;
const SIN45 = Math.SQRT1_2;

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

function measureWidth(text: string): number {
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
      significance: e.significance,
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
