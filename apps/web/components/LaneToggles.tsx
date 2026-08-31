"use client";

import { useEffect, useRef, useState } from "react";
import type { LaneDefinition, LaneId } from "../lib/lanes";

interface LaneTogglesProps {
  lanes: LaneDefinition[];
  visibility: Record<LaneId, boolean>;
  onToggle: (id: LaneId) => void;
}

function rgb(color: [number, number, number]): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

export default function LaneToggles({
  lanes,
  visibility,
  onToggle,
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

  const visibleCount = lanes.filter((l) => visibility[l.id]).length;

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
          <div className="lane-toggles-heading">Show lanes</div>
          {lanes.map((lane) => (
            <label key={lane.id} className="lane-toggle-item">
              <input
                type="checkbox"
                checked={visibility[lane.id]}
                onChange={() => onToggle(lane.id)}
              />
              <span
                className="lane-toggle-swatch"
                style={{ background: rgb(lane.color) }}
              />
              <span className="lane-toggle-label">{lane.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
