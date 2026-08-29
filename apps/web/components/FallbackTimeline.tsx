"use client";

import type { TimelineEvent } from "../lib/types";
import { formatYear } from "../lib/time-transform";
import { significanceColor } from "../lib/significance";

interface FallbackTimelineProps {
  events: TimelineEvent[];
  selectedId: string | null;
  onSelect: (event: TimelineEvent | null) => void;
}

export default function FallbackTimeline({
  events,
  selectedId,
  onSelect,
}: FallbackTimelineProps) {
  const sorted = [...events].sort((a, b) => b.year - a.year);

  return (
    <div className="fallback-timeline">
      <div className="fallback-note">
        WebGL isn&apos;t available, so showing a simplified timeline.
      </div>
      <ul className="fallback-list">
        {sorted.map((event) => {
          const color = significanceColor(event.significance, 1);
          const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
          const selected = event.id === selectedId;
          return (
            <li
              key={event.id}
              className={selected ? "fallback-item selected" : "fallback-item"}
              onClick={() => onSelect(selected ? null : event)}
            >
              <div className="fallback-year" style={{ color: rgb }}>
                {formatYear(event.year)}
              </div>
              <div className="fallback-body">
                <div className="fallback-title">{event.title}</div>
                <div className="fallback-desc">{event.description}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
