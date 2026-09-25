// Phase 2: significance scoring. Reads the extracted category checkpoints,
// fetches article length + recent pageviews, and combines them with sitelinks
// into a single significance score (weights per DATA_ENRICHMENT.md §5).
//
// Usage: tsx src/score.ts [person|state|war|work|period|event ...]
// Writes data/scored/{type}.jsonl

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonl, DATA_DIR } from "./checkpoint";
import { fetchPageSignals } from "./wikipedia";
import type { Candidate, EntityType, ScoredCandidate, Signals } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCORED_DIR = resolve(DATA_DIR, "scored");

const ALL_TYPES: EntityType[] = ["person", "state", "war", "work", "period", "event"];

// Weights from the design doc §6.2.
const W_SITELINKS = 0.45;
const W_PAGEVIEWS = 0.35;
const W_LENGTH = 0.2;

function logNorm(values: number[]): number[] {
  const logs = values.map((v) => Math.log1p(v));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  if (max <= min) return values.map(() => 0.5);
  return logs.map((l) => (l - min) / (max - min));
}

function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

async function main() {
  const requested = process.argv.slice(2) as EntityType[];
  const targets = requested.length ? requested : ALL_TYPES;

  // Load all target categories in a fixed order.
  const candidates: Candidate[] = [];
  for (const t of targets) {
    candidates.push(...(await readJsonl<Candidate>(`${t}.jsonl`)));
  }
  console.error(`loaded ${candidates.length} candidates across ${targets.join(", ")}`);

  // Fetch article length + pageviews for all unique titles.
  const titles = [...new Set(candidates.map((c) => c.wikipediaTitle))];
  console.error(`fetching page signals for ${titles.length} titles...`);
  const signals = await fetchPageSignals(titles);
  console.error(`  got signals for ${signals.size}/${titles.length}`);

  // Global normalization across the full set (not per category).
  const nS = logNorm(candidates.map((c) => c.sitelinks));
  const nP = logNorm(candidates.map((c) => signals.get(c.wikipediaTitle)?.pageviews ?? 0));
  const nL = logNorm(candidates.map((c) => signals.get(c.wikipediaTitle)?.length ?? 0));

  const scored: ScoredCandidate[] = candidates.map((c, i) => {
    const sig: Signals = {
      sitelinks: c.sitelinks,
      pageviews: signals.get(c.wikipediaTitle)?.pageviews ?? 0,
      articleLength: signals.get(c.wikipediaTitle)?.length ?? 0,
    };
    return {
      ...c,
      significance: clamp01(W_SITELINKS * nS[i] + W_PAGEVIEWS * nP[i] + W_LENGTH * nL[i]),
      signals: sig,
    };
  });

  await mkdir(SCORED_DIR, { recursive: true });

  // Group back by type and write one file per category.
  for (const t of targets) {
    const rows = scored.filter((s) => s.type === t);
    const path = resolve(SCORED_DIR, `${t}.jsonl`);
    await writeFile(path, rows.map((s) => JSON.stringify(s)).join("\n") + "\n");
    console.error(`wrote ${rows.length} scored ${t} -> ${path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
