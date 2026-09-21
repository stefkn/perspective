"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LANE_SIZES,
  type LaneConfig,
  type LaneDefinition,
  type LaneId,
  type LaneSize,
} from "../lib/lanes";
import type { Orientation } from "../lib/time-transform";

interface LaneTogglesProps {
  lanes: LaneDefinition[];
  order: LaneId[];
  configs: Record<LaneId, LaneConfig>;
  orientation: Orientation;
  onToggle: (id: LaneId) => void;
  onReorder: (id: LaneId, toIndex: number) => void;
  onSetSize: (id: LaneId, size: LaneSize) => void;
  onFlipSide: (id: LaneId) => void;
}

function rgb(color: [number, number, number]): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

const SIZE_LABEL: Record<LaneSize, string> = {
  compact: "S",
  normal: "M",
  large: "L",
};

function sideLabel(orientation: Orientation, side: -1 | 1): string {
  if (orientation === "horizontal") return side === -1 ? "Above" : "Below";
  return side === -1 ? "Left" : "Right";
}

interface DragState {
  id: LaneId;
  pointerId: number;
  startIndex: number;
  index: number;
  pointerStartY: number;
  rowHeight: number;
  count: number;
}

export default function LaneToggles({
  lanes,
  order,
  configs,
  orientation,
  onToggle,
  onReorder,
  onSetSize,
  onFlipSide,
}: LaneTogglesProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const [dragId, setDragId] = useState<LaneId | null>(null);
  const [dragShift, setDragShift] = useState(0);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const byId = new Map(lanes.map((lane) => [lane.id, lane]));
  const visibleCount = order.filter((id) => configs[id].visible).length;

  const stepSize = (id: LaneId, dir: -1 | 1) => {
    const idx = LANE_SIZES.indexOf(configs[id].size);
    const next = Math.min(Math.max(idx + dir, 0), LANE_SIZES.length - 1);
    if (next !== idx) onSetSize(id, LANE_SIZES[next]);
  };

  const handleDragStart = useCallback(
    (e: React.PointerEvent, id: LaneId, index: number) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const row = (e.currentTarget as HTMLElement).closest(
        ".lane-row",
      ) as HTMLElement | null;
      const rowHeight = row?.offsetHeight ?? 40;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        id,
        pointerId: e.pointerId,
        startIndex: index,
        index,
        pointerStartY: e.clientY,
        rowHeight,
        count: order.length,
      };
      setDragId(id);
      setDragShift(0);
    },
    [order.length],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dy = e.clientY - drag.pointerStartY;
      const raw = drag.startIndex + Math.round(dy / drag.rowHeight);
      const target = Math.min(Math.max(raw, 0), drag.count - 1);
      if (target !== drag.index) {
        drag.index = target;
        onReorder(drag.id, target);
      }
      setDragShift(dy - (drag.index - drag.startIndex) * drag.rowHeight);
    },
    [onReorder],
  );

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragId(null);
    setDragShift(0);
  }, []);

  const handleGripKeyDown = (
    e: React.KeyboardEvent,
    id: LaneId,
    index: number,
  ) => {
    let to: number | null = null;
    if (e.key === "ArrowUp") to = index - 1;
    else if (e.key === "ArrowDown") to = index + 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = order.length - 1;
    if (to != null) {
      e.preventDefault();
      if (to >= 0 && to < order.length) onReorder(id, to);
    }
  };

  return (
    <div className="lane-toggles" ref={rootRef}>
      <button
        className={`lane-toggles-button${open ? " active" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Lanes
        <span className="lane-toggles-count">{visibleCount}</span>
      </button>
      {open && (
        <div className="lane-toggles-panel">
          <div className="lane-toggles-heading">Manage lanes</div>
          {order.map((id, index) => {
            const lane = byId.get(id);
            if (!lane) return null;
            const cfg = configs[id];
            const side = cfg.side;
            const sizeLabel = SIZE_LABEL[cfg.size];
            const otherSide = (side === -1 ? 1 : -1) as -1 | 1;
            const dragging = dragId === id;
            return (
              <div
                key={id}
                className={`lane-row${dragging ? " dragging" : ""}`}
                style={
                  dragging
                    ? { transform: `translateY(${dragShift}px)` }
                    : undefined
                }
              >
                <button
                  className="lane-row-grip"
                  aria-label={`${lane.title}: drag to reorder`}
                  title="Drag to reorder"
                  onPointerDown={(e) => handleDragStart(e, id, index)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  onKeyDown={(e) => handleGripKeyDown(e, id, index)}
                >
                  ⋮⋮
                </button>
                <span
                  className="lane-row-swatch"
                  style={{ background: rgb(lane.color) }}
                />
                <span className="lane-row-title" title={lane.title}>
                  {lane.title}
                </span>
                <button
                  className="lane-row-side"
                  title={`Flip to ${sideLabel(orientation, otherSide)}`}
                  aria-label={`${lane.title}: ${sideLabel(orientation, side)}, flip to ${sideLabel(orientation, otherSide)}`}
                  onClick={() => onFlipSide(id)}
                >
                  {sideLabel(orientation, side)}
                </button>
                <div
                  className="lane-row-size"
                  role="group"
                  aria-label={`${lane.title} size`}
                >
                  <button
                    aria-label={`${lane.title}: smaller`}
                    disabled={cfg.size === LANE_SIZES[0]}
                    onClick={() => stepSize(id, -1)}
                  >
                    −
                  </button>
                  <span className="lane-row-size-level" title={cfg.size}>
                    {sizeLabel}
                  </span>
                  <button
                    aria-label={`${lane.title}: larger`}
                    disabled={cfg.size === LANE_SIZES[LANE_SIZES.length - 1]}
                    onClick={() => stepSize(id, 1)}
                  >
                    +
                  </button>
                </div>
                <input
                  type="checkbox"
                  className="lane-row-visible"
                  checked={cfg.visible}
                  aria-label={`Show ${lane.title}`}
                  onChange={() => onToggle(id)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
