// Generic extraction orchestrator. Fetches the relevant Vital articles lists,
// resolves titles to QIDs, classifies each by P31/P279*, fetches dates, and
// writes one JSONL checkpoint per category.
//
// Usage: tsx src/extract.ts [person|state|war|work|period|event ...]
// (no args = all categories)

import { writeJsonl } from "./checkpoint";
import { fetchVitalArticles } from "./vital-articles";
import { resolveTitles } from "./wikipedia";
import { classifyQids } from "./classify";
import { fetchEntityDates } from "./wikidata-api";
import { LISTS, TYPE_CONFIG, TYPE_LISTS, spanFor } from "./categories";
import type { Candidate, EntityType } from "./types";

const ALL_TYPES: EntityType[] = ["person", "state", "war", "work", "period", "event"];
const ALL_PIDS = ["P569", "P570", "P571", "P576", "P580", "P582", "P585", "P577"];

async function main() {
  const requested = process.argv.slice(2) as EntityType[];
  const targets = requested.length ? requested : ALL_TYPES;

  // 1. Fetch the union of relevant list pages, deduped by title.
  const listKeys = new Set<string>();
  for (const t of targets) for (const l of TYPE_LISTS[t]) listKeys.add(l);

  const entries: { title: string; topic: string }[] = [];
  const seen = new Set<string>();
  for (const key of listKeys) {
    console.error(`fetching vital articles: ${LISTS[key]}`);
    const list = await fetchVitalArticles(LISTS[key]);
    for (const e of list) {
      if (seen.has(e.title)) continue;
      seen.add(e.title);
      entries.push(e);
    }
  }
  console.error(`${entries.length} unique entries`);

  // 2. Resolve titles to QIDs.
  const titles = entries.map((e) => e.title);
  console.error(`resolving ${titles.length} titles to QIDs...`);
  const resolved = await resolveTitles(titles);
  const qidByTitle = new Map(
    resolved.filter((r) => r.qid).map((r) => [r.title, r.qid as string]),
  );
  const resolvable = entries.filter((e) => qidByTitle.has(e.title));
  console.error(`${resolvable.length}/${titles.length} resolved`);

  // 3. Classify all resolvable QIDs.
  const qids = resolvable.map((e) => qidByTitle.get(e.title) as string);
  console.error(`classifying ${qids.length} QIDs...`);
  const typeMap = await classifyQids(qids);

  // 4. Fetch dates only for entities classified into a target type.
  const wanted = resolvable.filter((e) => {
    const t = typeMap.get(qidByTitle.get(e.title) as string);
    return t != null && targets.includes(t);
  });
  const wantedQids = wanted.map((e) => qidByTitle.get(e.title) as string);
  console.error(`fetching dates for ${wantedQids.length} entities...`);
  const dataList = await fetchEntityDates(wantedQids, ALL_PIDS);
  const dataByQid = new Map(dataList.map((d) => [d.qid, d]));

  // 5. Build candidates and write per-type checkpoints.
  for (const t of targets) {
    const cfg = TYPE_CONFIG[t];
    const candidates: Candidate[] = [];
    wanted.forEach((e, i) => {
      const q = wantedQids[i];
      if (typeMap.get(q) !== t) return;
      const data = dataByQid.get(q);
      if (!data) return;
      const { start, end } = spanFor(data.dates, cfg);
      candidates.push({
        qid: q,
        label: e.title,
        wikipediaTitle: e.title,
        sitelinks: data.sitelinks,
        type: t,
        spanKind: cfg.spanKind,
        start,
        end,
        coord: data.coord,
        topic: e.topic || undefined,
      });
    });
    const path = await writeJsonl(`${t}.jsonl`, candidates);
    console.error(`wrote ${candidates.length} ${t} -> ${path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
