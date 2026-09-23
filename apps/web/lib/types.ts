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

// A collapsed set of intervals rendered as a single "+n more" bar. Carried on
// pickable layers so a hover can show a tooltip and a tap can zoom in.
export interface AggregateInfo {
  startYear: number;
  endYear: number;
  count: number;
  names: string[];
  unitNoun?: string;
}

// Raw "On this day" record as bundled in public/on-this-day.json.
export interface OnThisDayRecord {
  y: number;
  t: string;
  p: string | null;
}
