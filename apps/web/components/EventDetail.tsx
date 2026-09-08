"use client";

import type { TimelineEvent } from "../lib/types";
import { formatFullDate, formatYear } from "../lib/time-transform";

interface EventDetailProps {
  event: TimelineEvent;
  onClose: () => void;
}

export default function EventDetail({ event, onClose }: EventDetailProps) {
  const yearLabel = Number.isInteger(event.year)
    ? formatYear(event.year)
    : formatFullDate(event.year);
  return (
    <div className="event-detail">
      <button className="event-detail-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="event-detail-year">{yearLabel}</div>
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
