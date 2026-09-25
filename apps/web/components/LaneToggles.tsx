"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LANE_HALF_MIN,
  LANE_HALF_MAX,
  LANE_SIZES,
  LANE_SIZE_HALF,
  MAIN_AXIS_ID,
  type LaneConfig,
  type LaneDefinition,
  type LaneId,
  type LaneItem,
  type LaneSize,
} from "../lib/lanes";

interface LaneTogglesProps {
  lanes: LaneDefinition[];
  items: LaneItem[];
  configs: Record<LaneId, LaneConfig>;
  onToggle: (id: LaneId) => void;
  onReorder: (item: LaneItem, toIndex: number) => void;
  onSetHalf: (id: LaneId, half: number) => void;
}

function rgb(color: [number, number, number]): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

const SIZE_LABEL: Record<LaneSize, string> = {
  compact: "S",
  normal: "M",
  large: "L",
};

interface DragState {
  id: LaneItem;
  pointerId: number;
  startIndex: number;
  index: number;
  pointerStartY: number;
  rowHeight: number;
  count: number;
}

export default function LaneToggles({
  lanes,
  items,
  configs,
  onToggle,
  onReorder,
  onSetHalf,
}: LaneTogglesProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const [dragId, setDragId] = useState<LaneItem | null>(null);
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
  const visibleCount = items.filter(
    (item) => item !== MAIN_AXIS_ID && configs[item].visible,
  ).length;

  const handleDragStart = useCallback(
    (e: React.PointerEvent, item: LaneItem, index: number) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const row = (e.currentTarget as HTMLElement).closest(
        ".lane-row",
      ) as HTMLElement | null;
      const rowHeight = row?.offsetHeight ?? 40;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        id: item,
        pointerId: e.pointerId,
        startIndex: index,
        index,
        pointerStartY: e.clientY,
        rowHeight,
        count: items.length,
      };
      setDragId(item);
      setDragShift(0);
    },
    [items.length],
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
    item: LaneItem,
    index: number,
  ) => {
    let to: number | null = null;
    if (e.key === "ArrowUp") to = index - 1;
    else if (e.key === "ArrowDown") to = index + 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = items.length - 1;
    if (to != null) {
      e.preventDefault();
      if (to >= 0 && to < items.length) onReorder(item, to);
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
          {items.map((item, index) => {
            const dragging = dragId === item;

            if (item === MAIN_AXIS_ID) {
              return (
                <div
                  key={item}
                  className={`lane-row lane-row-main${dragging ? " dragging" : ""}`}
                  style={
                    dragging
                      ? { transform: `translateY(${dragShift}px)` }
                      : undefined
                  }
                >
                  <button
                    className="lane-row-grip"
                    aria-label="Main timeline: drag to reposition"
                    title="Drag to reposition"
                    onPointerDown={(e) => handleDragStart(e, item, index)}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    onKeyDown={(e) => handleGripKeyDown(e, item, index)}
                  >
                    ⋮⋮
                  </button>
                  <span className="lane-row-main-label">Main timeline</span>
                </div>
              );
            }

            const lane = byId.get(item);
            if (!lane) return null;
            const cfg = configs[item];
            return (
              <div
                key={item}
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
                  onPointerDown={(e) => handleDragStart(e, item, index)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  onKeyDown={(e) => handleGripKeyDown(e, item, index)}
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
                <div
                  className="lane-row-size"
                  role="group"
                  aria-label={`${lane.title} size`}
                >
                  <input
                    type="range"
                    className="lane-row-size-slider"
                    min={LANE_HALF_MIN}
                    max={LANE_HALF_MAX}
                    step={4}
                    value={cfg.half}
                    aria-label={`${lane.title} size`}
                    onChange={(e) => onSetHalf(item, Number(e.target.value))}
                  />
                  {LANE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`lane-row-size-preset${
                        cfg.half === LANE_SIZE_HALF[size] ? " active" : ""
                      }`}
                      aria-label={`${lane.title}: ${size}`}
                      title={size}
                      onClick={() => onSetHalf(item, LANE_SIZE_HALF[size])}
                    >
                      {SIZE_LABEL[size]}
                    </button>
                  ))}
                </div>
                <input
                  type="checkbox"
                  className="lane-row-visible"
                  checked={cfg.visible}
                  aria-label={`Show ${lane.title}`}
                  onChange={() => onToggle(item)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
