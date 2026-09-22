// Shared types for the ingestion pipeline. This is the *raw* candidate shape
// emitted by the SPARQL extractors and persisted to the JSONL checkpoints; it
// is later enriched into the final Entity schema described in DATA_ENRICHMENT.md.

export type EntityType = "person" | "state" | "war" | "work" | "period" | "event";

// Coarseness of a date, mirroring Wikidata's timePrecision values. Ordered
// finest -> coarsest.
export type TimePrecision =
  | "day"
  | "month"
  | "year"
  | "decade"
  | "century"
  | "millennium"
  | "coarse";

export interface ParsedTime {
  year: number; // negative = BCE
  precision: TimePrecision;
  estimated: boolean; // decade-or-coarser, or explicitly "circa"
}

export interface Coords {
  lat: number;
  lng: number;
}

export interface Candidate {
  qid: string; // e.g. "Q937"
  label: string; // derived from the English Wikipedia title
  wikipediaTitle: string;
  sitelinks: number; // total language editions covering the entity
  type: EntityType;
  start?: ParsedTime; // birth / inception / start
  end?: ParsedTime; // death / dissolved / end
  spanKind?: string; // "life" | "reign" | "existence" | ...
  coord?: Coords;
  topic?: string; // coarse source topic (e.g. "Entertainers > Actors")
}

// Raw significance signals (Phase 2). sitelinks comes from Wikidata; pageviews
// and articleLength from the Wikipedia API.
export interface Signals {
  sitelinks: number;
  pageviews: number; // trailing ~60-day total
  articleLength: number; // bytes
}

export interface ScoredCandidate extends Candidate {
  significance: number; // 0-1, weighted combination of the signals
  signals: Signals;
}
