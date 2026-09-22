// Wikidata API client: fetch claims (dates, coordinates) and sitelinks for a
// batch of QIDs via wbgetentities, parsed into a per-property date map.

import type { Coords, ParsedTime } from "./types";
import { apiFetch, chunk, precisionRank, parseWikidataTime, sleep, withRetry } from "./wikidata";
import { cacheGet, cacheSet } from "./cache";

const WD_API = "https://www.wikidata.org/w/api.php";

const THROTTLE_MS = 250;
const ENTITIES_CACHE = "entities";

interface EntityJson {
  id: string;
  missing?: "";
  claims?: Record<string, ClaimJson[]>;
  sitelinks?: Record<string, unknown>;
}

interface ClaimJson {
  rank?: string;
  mainsnak: {
    snaktype: string;
    datavalue?: { type: string; value: TimeValue | CoordValue };
  };
  qualifiers?: Record<string, QualifierJson[]>;
}

interface QualifierJson {
  datavalue?: { type: string; value: { id?: string } };
}

interface TimeValue {
  time: string;
  precision: number;
}

interface CoordValue {
  latitude: number;
  longitude: number;
}

const CIRCA_QID = "Q5727902";

function hasCirca(claim: ClaimJson): boolean {
  return (claim.qualifiers?.["P1480"] ?? []).some(
    (q) => q.datavalue?.value?.id === CIRCA_QID,
  );
}

function bestDate(
  claims: Record<string, ClaimJson[]> | undefined,
  pid: string,
): ParsedTime | undefined {
  const list = (claims?.[pid] ?? []).filter(
    (c) =>
      c.rank !== "deprecated" &&
      c.mainsnak.snaktype === "value" &&
      c.mainsnak.datavalue?.type === "time",
  );
  let best: ParsedTime | undefined;
  for (const c of list) {
    const v = c.mainsnak.datavalue!.value as TimeValue;
    const parsed = parseWikidataTime(v.time, v.precision, hasCirca(c));
    if (!best || precisionRank(parsed.precision) > precisionRank(best.precision)) {
      best = parsed;
    }
  }
  return best;
}

function coord(claims: Record<string, ClaimJson[]> | undefined): Coords | undefined {
  const c = (claims?.["P625"] ?? []).find(
    (c) => c.mainsnak.snaktype === "value" && c.mainsnak.datavalue?.type === "globecoordinate",
  );
  if (!c) return undefined;
  const v = c.mainsnak.datavalue!.value as CoordValue;
  return { lat: v.latitude, lng: v.longitude };
}

export interface EntityData {
  qid: string;
  dates: Record<string, ParsedTime>; // property id -> best date
  coord?: Coords;
  sitelinks: number;
}

// Fetch, for each QID, the best date for each requested property plus
// coordinates and sitelink count. Results are cached; a QID whose fetch came
// back degraded (missing entity, or zero sitelinks — impossible for a
// vital-articles subject) is retried once and not cached until it succeeds.
// NOTE: cache is valid for the standard date-property set (see categories.ts).
export async function fetchEntityDates(
  qids: string[],
  pids: string[],
): Promise<EntityData[]> {
  const cached = (await cacheGet<Record<string, EntityData>>(ENTITIES_CACHE)) ?? {};
  const result = new Map<string, EntityData>(Object.entries(cached));

  const toFetch = qids.filter((q) => !result.has(q));

  const fetchBatch = async (batch: string[]): Promise<EntityData[]> => {
    const params = new URLSearchParams({
      action: "wbgetentities",
      format: "json",
      formatversion: "2",
      props: "claims|sitelinks",
      ids: batch.join("|"),
    });
    const json = await withRetry(
      async () => {
        const res = await apiFetch(`${WD_API}?${params}`);
        return (await res.json()) as { entities: Record<string, EntityJson> };
      },
      "wbgetentities",
    );
    await sleep(THROTTLE_MS);

    const batchOut: EntityData[] = [];
    for (const qid of batch) {
      const e = json.entities[qid];
      if (!e || e.missing) {
        batchOut.push({ qid, dates: {}, sitelinks: 0 });
        continue;
      }
      const dates: Record<string, ParsedTime> = {};
      for (const pid of pids) {
        const d = bestDate(e.claims, pid);
        if (d) dates[pid] = d;
      }
      batchOut.push({
        qid,
        dates,
        coord: coord(e.claims),
        sitelinks: Object.keys(e.sitelinks ?? {}).length,
      });
    }
    return batchOut;
  };

  if (toFetch.length) {
    console.error(`  fetching ${toFetch.length} uncached entities...`);
    const degraded: string[] = [];
    for (const batch of chunk(toFetch, 50)) {
      for (const d of await fetchBatch(batch)) {
        if (d.sitelinks === 0) degraded.push(d.qid);
        else result.set(d.qid, d);
      }
    }
    if (degraded.length) {
      console.error(`  retrying ${degraded.length} degraded entities...`);
      for (const batch of chunk(degraded, 20)) {
        for (const d of await fetchBatch(batch)) {
          result.set(d.qid, d);
        }
      }
    }
    await cacheSet(ENTITIES_CACHE, Object.fromEntries(result));
  }

  return qids.map((q) => result.get(q) ?? { qid: q, dates: {}, sitelinks: 0 });
}
