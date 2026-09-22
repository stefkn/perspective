// Classify QIDs into our EntityType taxonomy via transitive
// instance-of/subclass-of (P31 / P279*) lookups. A bounded VALUES query makes
// this cheap regardless of the corpus size.

import type { EntityType } from "./types";
import { chunk } from "./wikidata";
import { sparqlRows } from "./sparql";

// Marker classes per type. An entity matches a type if any marker is in its
// transitive P31 closure.
const MARKERS: Record<EntityType, string[]> = {
  person: ["Q5"],
  state: ["Q3624078", "Q6256", "Q7275", "Q3024240"],
  war: ["Q198"], // "war" only — battles/attacks/operations are events, not spans
  work: ["Q17537576"],
  period: ["Q11514315", "Q15401699"],
  event: ["Q1656682", "Q13418847", "Q350604"], // armed conflict catches battles/attacks
};

// Priority order; first match wins (e.g. WWII is both a war and a period).
const PRIORITY: EntityType[] = ["person", "war", "state", "work", "period", "event"];

export async function classifyQids(
  qids: string[],
): Promise<Map<string, EntityType | null>> {
  const result = new Map<string, EntityType | null>();

  for (const batch of chunk(qids, 500)) {
    const values = batch.map((q) => `wd:${q}`).join(" ");
    const query = `
      SELECT ?item ?class WHERE {
        VALUES ?item { ${values} }
        ?item wdt:P31/wdt:P279* ?class .
      }
    `;
    const rows = await sparqlRows(query);

    const classes = new Map<string, Set<string>>();
    for (const r of rows) {
      const item = r.item.split("/").pop()!;
      const cls = r.class.split("/").pop()!;
      if (!classes.has(item)) classes.set(item, new Set());
      classes.get(item)!.add(cls);
    }

    for (const q of batch) {
      const set = classes.get(q);
      if (!set) {
        result.set(q, null);
        continue;
      }
      let assigned: EntityType | null = null;
      for (const t of PRIORITY) {
        if (MARKERS[t].some((m) => set.has(m))) {
          assigned = t;
          break;
        }
      }
      result.set(q, assigned);
    }
  }

  return result;
}
