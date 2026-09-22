// Validation gate for a category checkpoint. Usage:
//   tsx src/validate.ts [person|state|war|work|period|event]
// Checks: in-memory plausibility, top-N eyeball, and a small set of known
// entities with expected dates (printed for review; does not exit non-zero on
// mismatch).

import { readJsonl } from "./checkpoint";
import type { Candidate, EntityType, ParsedTime } from "./types";

function fmt(t?: ParsedTime): string {
  if (!t) return "?";
  const y = t.year < 0 ? `${-t.year} BCE` : `${t.year}`;
  return `${t.estimated ? "~" : ""}${y} (${t.precision})`;
}

function describe(c: Candidate): string {
  return `${c.label} [${c.qid}] sl=${c.sitelinks}  start=${fmt(c.start)}  end=${fmt(c.end)}` +
    (c.coord ? `  coord=(${c.coord.lat.toFixed(2)}, ${c.coord.lng.toFixed(2)})` : "");
}

interface Known {
  label: string;
  start?: number;
  end?: number;
  estimated?: boolean;
}

const KNOWN: Record<EntityType, Known[]> = {
  person: [
    { label: "Albert Einstein", start: 1879, end: 1955 },
    { label: "William Shakespeare", start: 1564, end: 1616 },
    { label: "Nelson Mandela", start: 1918, end: 2013 },
    { label: "Cleopatra", end: -30 },
    { label: "Socrates", start: -470, estimated: true },
    { label: "Hammurabi", estimated: true },
  ],
  state: [
    { label: "Roman Empire", start: -27, end: 476 },
    { label: "Soviet Union", start: 1922, end: 1991 },
    { label: "Ottoman Empire", start: 1299, end: 1922 },
    { label: "United States", start: 1776 },
  ],
  war: [
    { label: "World War I", start: 1914, end: 1918 },
    { label: "World War II", start: 1939, end: 1945 },
    { label: "American Civil War", start: 1861, end: 1865 },
  ],
  work: [
    { label: "Mona Lisa", start: 1503 },
    { label: "Don Quixote", start: 1605 },
    { label: "Moby-Dick", start: 1851 },
  ],
  period: [
    { label: "Renaissance", estimated: true },
    { label: "Industrial Revolution", start: 1760 },
  ],
  event: [
    { label: "French Revolution", start: 1789 },
    { label: "Magna Carta", start: 1215 },
  ],
};

async function main() {
  const category = (process.argv[2] as EntityType | undefined) ?? "person";
  const candidates = await readJsonl<Candidate>(`${category}.jsonl`);
  if (candidates.length === 0) {
    console.error(`no candidates for "${category}" — run \`pnpm extract ${category}\` first`);
    process.exit(1);
  }

  // Plausibility
  let badOrder = 0;
  let outOfRange = 0;
  for (const c of candidates) {
    if (c.start && c.end && c.start.year > c.end.year) badOrder++;
    for (const t of [c.start, c.end]) {
      if (t && (t.year < -10000 || t.year > 2026)) outOfRange++;
    }
  }
  const withEnd = candidates.filter((c) => c.end).length;
  const estimated = candidates.filter((c) => c.start?.estimated).length;
  const withCoord = candidates.filter((c) => c.coord).length;
  console.log(`loaded ${candidates.length} ${category}`);
  console.log(`  with end: ${withEnd}, estimated start: ${estimated}, with coords: ${withCoord}`);
  console.log(`  start>end violations: ${badOrder}, out-of-range years: ${outOfRange}`);

  // Top 30 by sitelinks
  console.log("\ntop 30 by sitelinks:");
  const top = [...candidates].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, 30);
  for (const c of top) console.log("  " + describe(c));

  // Known figures
  const known = KNOWN[category] ?? [];
  if (known.length) {
    console.log("\nknown entities:");
    for (const k of known) {
      const c = candidates.find((x) => x.label.toLowerCase().includes(k.label.toLowerCase()));
      if (!c) {
        console.log(`  ${k.label}: NOT FOUND`);
        continue;
      }
      const startOk = k.start === undefined || c.start?.year === k.start;
      const endOk = k.end === undefined || c.end?.year === k.end;
      const estOk = k.estimated === undefined || c.start?.estimated === k.estimated;
      console.log(
        `  ${startOk && endOk && estOk ? "OK " : "MISMATCH"} ${k.label}: ${describe(c)}` +
          `  (expected start=${k.start ?? "-"} end=${k.end ?? "-"} estimated=${k.estimated ?? "-"})`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
