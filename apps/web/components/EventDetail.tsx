"use client";

import type { EntityDetail } from "../lib/types";
import { formatFullDate, formatYear } from "../lib/time-transform";

interface EventDetailProps {
  event: EntityDetail;
  pinned: boolean;
  onTogglePin: () => void;
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

export default function EventDetail({
  event,
  pinned,
  onTogglePin,
  onClose,
}: EventDetailProps) {
  const label = yearLabel(event);
  const shown = event.estimated ? `≈ ${label}` : label;
  // On-this-day records are date entries with their own zoom-gated visibility,
  // so they aren't pinnable.
  const pinnable = !("dayIndex" in event && event.dayIndex != null);
  return (
    <div className="event-detail">
      <button className="event-detail-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {pinnable && (
        <button
          className="event-detail-pin"
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? "Unpin from timeline" : "Pin to timeline"}
          title={pinned ? "Unpin" : "Pin — keep visible at any zoom"}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-1.26a1 1 0 0 0-.72.31l-1.36 1.36a2 2 0 0 1-.7.44l-1.78.9A2 2 0 0 0 8 8.76V10.76" />
          </svg>
        </button>
      )}
      <div className="event-detail-year">{shown}</div>
      <h2 className="event-detail-title">{event.title}</h2>
      <p className="event-detail-desc">{event.description}</p>
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
