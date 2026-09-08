import type { OnThisDayRecord, TimelineEvent } from "./types";
import { dateToFractionalYear } from "./time-transform";

// Visible span (in days) at or below which "On this day" events surface as
// small dots. Set well above the intro zoom's end span so the dots are already
// visible when the intro settles.
export const OTD_DOT_SPAN_DAYS = 120 * 365.25;

// Visible span (in days) at or below which those events grow into labeled,
// fully-detailed points.
export const OTD_LABEL_SPAN_DAYS = 45;

export type OnThisDayData = Record<string, OnThisDayRecord[]>;

let cachedData: Promise<OnThisDayData> | null = null;
let cachedEvents: Promise<TimelineEvent[]> | null = null;

const wiki = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

export function loadOnThisDayData(): Promise<OnThisDayData> {
  if (!cachedData) {
    cachedData = fetch("/on-this-day.json").then((res) => {
      if (!res.ok) throw new Error(`Failed to load On This Day data: ${res.status}`);
      return res.json() as Promise<OnThisDayData>;
    });
  }
  return cachedData;
}

// Flatten every calendar day's records into a single event list. Each event
// keeps its precise date as a fractional year, so it can be placed on the
// timeline at day resolution and culled naturally as the view narrows.
export function allOnThisDayEvents(data: OnThisDayData): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const [key, records] of Object.entries(data)) {
    const month = Number(key.slice(0, 2));
    const day = Number(key.slice(2, 4));
    const yearCounts = new Map<number, number>();
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const dayIndex = yearCounts.get(r.y) ?? 0;
      yearCounts.set(r.y, dayIndex + 1);
      events.push({
        id: `otd-${key}-${i}`,
        year: dateToFractionalYear(r.y, month, day),
        dayIndex,
        title: r.p ?? r.t,
        description: r.t,
        wikipediaUrl: r.p ? wiki(r.p) : null,
      });
    }
  }
  return events;
}

export function loadOnThisDayEvents(): Promise<TimelineEvent[]> {
  if (!cachedEvents) {
    cachedEvents = loadOnThisDayData().then(allOnThisDayEvents);
  }
  return cachedEvents;
}
