// Per-category configuration: which vital-articles list pages to source, and
// how to derive a span (start/end) from each entity's date claims.

import type { EntityType } from "./types";
import type { ParsedTime } from "./types";
import { precisionRank } from "./wikidata";

export const LISTS: Record<string, string> = {
  people: "Wikipedia:Vital articles/Level 4/People",
  history: "Wikipedia:Vital articles/Level 4/History",
  geography: "Wikipedia:Vital articles/Level 4/Geography",
  arts: "Wikipedia:Vital articles/Level 4/Arts",
};

// Which list pages may contain entities of each type.
export const TYPE_LISTS: Record<EntityType, string[]> = {
  person: ["people"],
  state: ["geography", "history"],
  war: ["history"],
  work: ["arts"],
  period: ["history"],
  event: ["history"],
};

export interface SpanConfig {
  spanKind: string;
  startPids: string[]; // priority order
  endPids: string[]; // priority order
  work?: boolean; // creative works: trim end when it doesn't postdate start
}

export const TYPE_CONFIG: Record<EntityType, SpanConfig> = {
  person: { spanKind: "life", startPids: ["P569"], endPids: ["P570"] },
  state: { spanKind: "existence", startPids: ["P571", "P580"], endPids: ["P576", "P582"] },
  war: { spanKind: "conflict", startPids: ["P580", "P585"], endPids: ["P582"] },
  work: { spanKind: "creation", startPids: ["P571", "P577"], endPids: ["P577"], work: true },
  period: { spanKind: "existence", startPids: ["P580"], endPids: ["P582"] },
  event: { spanKind: "occurrence", startPids: ["P580", "P585"], endPids: ["P582"] },
};

// Pick the finest-precision date among several candidates (e.g. a precise
// publication date should beat a century-level inception date).
function finest(list: (ParsedTime | undefined)[]): ParsedTime | undefined {
  let best: ParsedTime | undefined;
  for (const d of list) {
    if (!d) continue;
    if (!best || precisionRank(d.precision) > precisionRank(best.precision)) best = d;
  }
  return best;
}

export function spanFor(
  dates: Record<string, ParsedTime>,
  cfg: SpanConfig,
): { start?: ParsedTime; end?: ParsedTime } {
  let start = finest(cfg.startPids.map((p) => dates[p]));
  let end = finest(cfg.endPids.map((p) => dates[p]));
  if (cfg.work) {
    if (start && end && end.year <= start.year) end = undefined;
    if (!start && end) {
      start = end;
      end = undefined;
    }
  }
  return { start, end };
}
