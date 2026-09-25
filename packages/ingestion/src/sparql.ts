// Minimal Wikidata SPARQL client. Used only for cheap, bounded lookups
// (VALUES-based classification), never for full-corpus ranking (which timed
// out on the public endpoint — see DATA_ENRICHMENT.md §4).

import { ApiError, withRetry, USER_AGENT } from "./wikidata";

const SPARQL = "https://query.wikidata.org/sparql";

export interface Row {
  [variable: string]: string;
}

export async function sparqlRows(query: string): Promise<Row[]> {
  const json = await withRetry(
    async () => {
      const res = await fetch(SPARQL, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ query, format: "json" }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after") ?? "0") * 1000;
        throw new ApiError("HTTP 429", true, ra || undefined);
      }
      if (res.status >= 500) throw new ApiError(`HTTP ${res.status}`, true);
      if (!res.ok) throw new ApiError(`HTTP ${res.status}`, false);
      return (await res.json()) as {
        results: { bindings: Record<string, { value: string }>[] };
      };
    },
    "sparql",
  );

  return json.results.bindings.map((b) => {
    const row: Row = {};
    for (const [k, v] of Object.entries(b)) row[k] = v.value;
    return row;
  });
}
