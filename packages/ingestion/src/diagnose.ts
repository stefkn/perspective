// Diagnostic: report how a vital-articles list distributes across our
// EntityType taxonomy, plus a sample of unclassified titles. No date fetching.
//
// Usage: tsx src/diagnose.ts <listKey>   (e.g. history, arts, geography, people)

import { fetchVitalArticles } from "./vital-articles";
import { resolveTitles } from "./wikipedia";
import { classifyQids } from "./classify";
import { LISTS } from "./categories";
import type { EntityType } from "./types";

async function main() {
  const key = process.argv[2] ?? "history";
  const page = LISTS[key];
  if (!page) {
    console.error(`unknown list key "${key}"; options: ${Object.keys(LISTS).join(", ")}`);
    process.exit(1);
  }

  const entries = await fetchVitalArticles(page);
  const resolved = await resolveTitles(entries.map((e) => e.title));
  const qidByTitle = new Map(
    resolved.filter((r) => r.qid).map((r) => [r.title, r.qid as string]),
  );
  const qids = entries.filter((e) => qidByTitle.has(e.title)).map((e) => qidByTitle.get(e.title) as string);
  console.error(`${entries.length} entries, ${qids.length} resolved; classifying...`);

  const typeMap = await classifyQids(qids);

  const counts: Record<string, number> = {};
  const unclassified: string[] = [];
  for (const e of entries) {
    const q = qidByTitle.get(e.title);
    if (!q) continue;
    const t = typeMap.get(q) ?? "unclassified";
    counts[t] = (counts[t] ?? 0) + 1;
    if (t === "unclassified" || t === null) unclassified.push(e.title);
  }

  console.log(`\nclassification of "${key}":`);
  for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${n}`);
  }
  console.log(`\nunclassified (${unclassified.length}):`);
  for (const t of unclassified.slice(0, 80)) console.log("  - " + t);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
