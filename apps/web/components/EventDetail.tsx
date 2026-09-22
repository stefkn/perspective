"use client";

import type { EntityDetail } from "../lib/types";
import { formatFullDate, formatYear } from "../lib/time-transform";

interface EventDetailProps {
  event: EntityDetail;
  onClose: () => void;
}

function yearLabel(event: EntityDetail): string {
  if (event.year != null) {
    return Number.isInteger(event.year)
      ? formatYear(event.year)
      : formatFullDate(event.year);
  }
  if (event.startYear == null) return "";
  // Round: the minimum rendered span adds a fractional month to instantaneous
  // entities, which shouldn't surface in the label.
  const start = formatYear(Math.round(event.startYear));
  const end = Math.round(event.endYear ?? event.startYear);
  if (event.endYear == null || end === Math.round(event.startYear)) return start;
  return `${start} – ${formatYear(end)}`;
}

export default function EventDetail({ event, onClose }: EventDetailProps) {
  const label = yearLabel(event);
  const shown = event.estimated ? `≈ ${label}` : label;
  return (
    <div className="event-detail">
      <button className="event-detail-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="event-detail-year">{shown}</div>
      <h2 className="event-detail-title">{event.title}</h2>
      <p className="event-detail-desc">{event.description}</p>
      {event.significance != null && (
        <div className="event-detail-sig">
          <span className="event-detail-sig-label">Significance</span>
          <div className="event-detail-sig-track">
            <div
              className="event-detail-sig-fill"
              style={{ width: `${Math.round(event.significance * 100)}%` }}
            />
          </div>
          <span className="event-detail-sig-value">
            {Math.round(event.significance * 100)}%
          </span>
        </div>
      )}
      {event.wikipediaUrl && (
        <a
          className="event-detail-link"
          href={event.wikipediaUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read on Wikipedia →
        </a>
      )}
    </div>
  );
}
