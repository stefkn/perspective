// Phase 3: deterministic infobox/wikitext date extraction. For entities whose
// Wikidata dates are missing, parse the article's section-0 wikitext for
// infobox date fields and fill in clean years. Fuzzy cases are left for Phase 4.
//
// Usage: tsx src/infobox.ts [person|state|war|work|period|event ...]
// Reads data/scored/{type}.jsonl, writes data/infobox/{type}.jsonl

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonl, DATA_DIR } from "./checkpoint";
import { fetchSection0 } from "./wikipedia";
import type { EntityType, ParsedTime, ScoredCandidate } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(DATA_DIR, "infobox");

const ALL_TYPES: EntityType[] = ["person", "state", "war", "work", "period", "event"];

// Infobox parameter names to try, in order, for start and end dates.
const PARAMS: Record<EntityType, { start: string[]; end: string[] }> = {
  person: {
    start: ["birth_date", "birth_year", "born", "birth", "flourished"],
    end: ["death_date", "death_year", "died", "death"],
  },
  state: {
    start: ["established_date", "established", "founded", "formed", "inception"],
    end: ["dissolved", "dissolution_date", "abolished"],
  },
  war: {
    start: ["start_date", "date_began", "began", "date_started", "date"],
    end: ["end_date", "date_ended", "ended"],
  },
  work: {
    start: ["publication_date", "published", "created", "written", "released", "date"],
    end: [],
  },
  period: { start: ["start", "began", "start_date", "date"], end: ["end", "ended", "end_date"] },
  event: { start: ["founded", "established", "date", "occurred", "start_date", "start"], end: ["end", "end_date"] },
};

// Extract a single year (with precision + estimated flag) from a raw infobox
// value. Handles {{birth date|...}} templates, "c. 570", "570 BC", "4th
// century", and plain years.
function yearFromValue(raw: string): ParsedTime | undefined {
  const v = raw.replace(/,/g, "").trim();
  if (!v) return undefined;
  // Skip prehistoric / geological date forms we can't place cleanly.
  if (/\b(?:BP|ka|mya)\b|Before Present|years? ago/i.test(v)) return undefined;
  const bce = /\b(?:BC|BCE)\b/i.test(v);
  const circa = /\bc(?:irca)?\.?/i.test(v) || /\b(?:approx(?:imately)?|flourished|fl\.)\b/i.test(v);

  let m = v.match(/\{\{\s*(?:birth|death)[ _]date[^|}]*\|\s*(\d{3,4})/i);
  if (m) return { year: Number(m[1]), precision: "year", estimated: false };
  m = v.match(/\{\{\s*(?:birth|death)[ _]year[^|}]*\|\s*(\d{3,4})/i);
  if (m) return { year: Number(m[1]), precision: "year", estimated: false };

  m = v.match(/(\d{1,2})(?:st|nd|rd|th)[ -]centur(?:y|ies)/i);
  if (m) {
    const c = Number(m[1]);
    return { year: bce ? -c * 100 : c * 100, precision: "century", estimated: true };
  }

  m = v.match(/(\d{3,4})/);
  if (m) return { year: bce ? -Number(m[1]) : Number(m[1]), precision: "year", estimated: circa };
  return undefined;
}

// Extract the value of a single infobox parameter (value may span lines and
// contain templates).
function paramValue(wt: string, param: string): string | undefined {
  const re = new RegExp(`\\|\\s*${param}\\s*=\\s*((?:(?!\\n\\s*[|}])[\\s\\S])*)`, "i");
  return re.exec(wt)?.[1]?.trim();
}

// Strip <ref>…</ref> citations, whose |date= fields would otherwise be mistaken
// for the entity's own date.
function stripRefs(wt: string): string {
  return wt
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
}

// Extract the {{Infobox ...}} template (with balanced nested braces) from the
// wikitext. Restricting parameter parsing to this block avoids matching
// maintenance templates like {{Use dmy dates|date=April 2022}} that sit above
// the infobox and would otherwise leak a spurious date.
function extractInfobox(wt: string): string | null {
  const start = wt.search(/\{\{\s*[Ii]nfobox\b/);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < wt.length; i++) {
    if (wt[i] === "{" && wt[i + 1] === "{" && wt[i + 2] === "{") {
      i += 2; // skip {{{ param reference
      continue;
    }
    if (wt[i] === "{" && wt[i + 1] === "{") {
      depth++;
      i++;
      continue;
    }
    if (wt[i] === "}" && wt[i + 1] === "}") {
      depth--;
      i++;
      if (depth === 0) return wt.slice(start, i + 1);
    }
  }
  return null;
}

async function main() {
  const requested = process.argv.slice(2) as EntityType[];
  const targets = requested.length ? requested : ALL_TYPES;

  await mkdir(OUT_DIR, { recursive: true });

  for (const t of targets) {
    const rows = await readJsonl<ScoredCandidate>(`scored/${t}.jsonl`);
    const needing = rows.filter((r) => !r.start || !r.end);
    console.error(`${t}: ${needing.length}/${rows.length} missing a date`);

    if (needing.length === 0) continue;

    const wtMap = await fetchSection0(needing.map((r) => r.wikipediaTitle));

    let filledStart = 0;
    let filledEnd = 0;
    const out: ScoredCandidate[] = rows.map((r) => {
      if (r.start && r.end) return r;
      const wt = wtMap.get(r.wikipediaTitle);
      if (!wt) return r;
      const infobox = extractInfobox(wt);
      if (!infobox) return r;
      const ib = stripRefs(infobox);
      const cfg = PARAMS[t];
      let start = r.start;
      let end = r.end;
      if (!start) {
        for (const p of cfg.start) {
          const v = paramValue(ib, p);
          if (!v) continue;
          const y = yearFromValue(v);
          if (y) {
            start = y;
            filledStart++;
            break;
          }
        }
      }
      if (!end) {
        for (const p of cfg.end) {
          const v = paramValue(ib, p);
          if (!v) continue;
          const y = yearFromValue(v);
          if (y) {
            end = y;
            filledEnd++;
            break;
          }
        }
      }
      return { ...r, start, end };
    });

    const path = resolve(OUT_DIR, `${t}.jsonl`);
    await writeFile(path, out.map((s) => JSON.stringify(s)).join("\n") + "\n");
    console.error(`wrote ${out.length} ${t} (filled start=${filledStart}, end=${filledEnd}) -> ${path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
