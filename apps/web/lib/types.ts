export interface TimelineEvent {
  id: string;
  year: number;
  title: string;
  description: string;
  significance?: number;
  wikipediaUrl: string | null;
  // Index of this event among others that fall on the same calendar day, used
  // to spread coincident dots slightly apart so each is individually selectable.
  dayIndex?: number;
}

// Raw "On this day" record as bundled in public/on-this-day.json.
export interface OnThisDayRecord {
  y: number;
  t: string;
  p: string | null;
}
