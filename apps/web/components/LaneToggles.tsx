"use client";

import { useEffect, useRef, useState } from "react";
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
  onMove: (id: LaneId, dir: -1 | 1) => void;
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

export default function LaneToggles({
  lanes,
  order,
  configs,
  orientation,
  onToggle,
  onMove,
  onSetSize,
  onFlipSide,
}: LaneTogglesProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
            return (
              <div key={id} className="lane-row">
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
                <div className="lane-row-size" role="group" aria-label={`${lane.title} size`}>
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
                <div className="lane-row-move" role="group" aria-label={`${lane.title} order`}>
                  <button
                    aria-label={`${lane.title}: move up`}
                    disabled={index === 0}
                    onClick={() => onMove(id, -1)}
                  >
                    ▲
                  </button>
                  <button
                    aria-label={`${lane.title}: move down`}
                    disabled={index === order.length - 1}
                    onClick={() => onMove(id, 1)}
                  >
                    ▼
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
