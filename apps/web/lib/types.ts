// A selectable entity shown in the info box: either a point event (year) or an
// interval (startYear/endYear), e.g. a person, state, war, work, or period.
export interface EntityDetail {
  id: string;
  title: string;
  description: string;
  significance?: number;
  wikipediaUrl: string | null;
  year?: number; // point events
  startYear?: number; // intervals
  endYear?: number;
  estimated?: boolean;
}

export interface TimelineEvent extends EntityDetail {
  year: number;
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
