// Phase 4: OpenRouter LLM enrichment. Generates one-line descriptions and
// lane classification for every entity, and extracts fuzzy dates (with
// citations) for entities still missing dates after Phase 3.
//
// Requires OPENROUTER_API_KEY (and optional OPENROUTER_MODEL).
//
// Usage: tsx src/enrich.ts [person|state|war|work|period|event ...]
// Reads data/infobox/{type}.jsonl, writes data/enriched/{type}.jsonl

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { readJsonl, DATA_DIR } from "./checkpoint";
import { fetchLeads } from "./wikipedia";
import type { EntityType, ScoredCandidate } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(DATA_DIR, "enriched");

// Load packages/ingestion/.env if present (OPENROUTER_API_KEY / OPENROUTER_MODEL).
try {
  loadEnvFile(resolve(__dirname, "..", ".env"));
} catch {
  // no .env — rely on the ambient environment
}

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const ALL_TYPES: EntityType[] = ["person", "state", "war", "work", "period", "event"];

const LANES = [
  "politics",
  "war",
  "science",
  "art",
  "technology",
  "philosophy",
  "religion",
  "disaster",
  "culture",
  "society",
];

export interface EnrichedCandidate extends ScoredCandidate {
  description: string;
  lanes: string[];
  citations?: string[]; // verbatim source for LLM-extracted dates
}

interface LlmDateResult {
  start: { year: number; estimated: boolean } | null;
  end: { year: number; estimated: boolean } | null;
  citation?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callLLM(system: string, user: string): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message?.content ?? "";
}

// Parse an LLM response that may be wrapped in markdown fences.
function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error(`no JSON object in response: ${text.slice(0, 120)}`);
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizeLanes(lanes: unknown): string[] {
  if (!Array.isArray(lanes)) return [];
  const out: string[] = [];
  for (const l of lanes) {
    if (typeof l !== "string") continue;
    const name = l.toLowerCase().trim();
    if (LANES.includes(name) && !out.includes(name)) out.push(name);
  }
  return out.slice(0, 2);
}

// A date is only trusted if the source citation actually contains its year
// (rejecting hallucinated or unverifiable years), the era (BCE vs CE) is
// consistent, and the year isn't implausibly recent (e.g. "as of 2026").
function citationSupportsYear(year: number, citation: string | undefined): boolean {
  if (!citation) return false;
  const digits = String(Math.abs(year));
  const stripped = citation.replace(/[^\d]/g, "");
  if (!stripped.includes(digits)) return false;
  const hasBce = /\bB\.?C\.?E?\.?\b/i.test(citation);
  if (year < 0 && !hasBce) return false; // negative year needs a BCE marker
  if (year >= 0 && hasBce && new RegExp(`${digits}[^0-9]{0,8}(?:B\\.?C\\.?E?\\.?)`, "i").test(citation)) {
    return false; // the matching digits are themselves labelled BCE
  }
  if (year >= new Date().getFullYear()) return false; // no future/"as of" years as a start
  return true;
}

async function main() {
  if (!API_KEY) {
    console.error("OPENROUTER_API_KEY is not set. Add it to packages/ingestion/.env or the environment.");
    process.exit(1);
  }

  const requested = process.argv.slice(2) as EntityType[];
  const targets = requested.length ? requested : ALL_TYPES;

  await mkdir(OUT_DIR, { recursive: true });

  for (const t of targets) {
    const rows = await readJsonl<ScoredCandidate>(`infobox/${t}.jsonl`);
    if (rows.length === 0) {
      console.error(`${t}: no infobox data (run Phase 3 first)`);
      continue;
    }
    console.error(`\n=== ${t}: ${rows.length} entities ===`);

    // Reuse descriptions/lanes/citations from a previous run so re-enriching
    // after a data fix only re-extracts dates, not every description.
    const existing = new Map<string, EnrichedCandidate>();
    try {
      for (const p of await readJsonl<EnrichedCandidate>(`enriched/${t}.jsonl`)) {
        if (p.description) existing.set(p.qid, p);
      }
    } catch {
      // no previous run
    }

    const leads = await fetchLeads(rows.map((r) => r.wikipediaTitle));
    const enriched = new Map<string, { description: string; lanes: string[] }>();

    // Pass 1: description + lanes for entities missing them, batched.
    const toDescribe = rows.filter((r) => !existing.has(r.qid));
    console.error(`  generating descriptions + lanes for ${toDescribe.length} new entities (${MODEL})...`);
    const BATCH = 8;
    for (let i = 0; i < toDescribe.length; i += BATCH) {
      const batch = toDescribe.slice(i, i + BATCH);
      const entities = batch.map((r) => ({
        id: r.qid,
        type: r.type,
        title: r.label,
        lead: (leads.get(r.wikipediaTitle) ?? "").slice(0, 500),
      }));
      const user = `Entities:\n${JSON.stringify(entities)}\n\n` +
        `For each entity id, return a JSON object keyed by id, each value ` +
        `{"description": "one encyclopedic sentence, ~15 words, no leading 'is/was a' filler", ` +
        `"lanes": [array of 1 or 2 strings, each exactly one of: ${LANES.join(", ")}]}. ` +
        `Output only JSON.`;
      const content = await callLLM(
        "You are a precise editor of a historical timeline. Respond with valid JSON only.",
        user,
      );
      const parsed = parseJsonObject(content);
      for (const e of batch) {
        const v = parsed[e.qid] as { description?: string; lanes?: unknown } | undefined;
        if (v?.description) {
          enriched.set(e.qid, { description: v.description, lanes: normalizeLanes(v.lanes) });
        }
      }
      await sleep(150);
    }
    console.error(`  got descriptions for ${enriched.size}/${rows.length}`);

    // Pass 2: fuzzy dates for entities still missing a start date. Missing
    // end dates are left alone: "no end" is the correct default for living
    // people, ongoing states/periods, and point-like works.
    const missingDates = rows.filter((r) => !r.start);
    const citations = new Map<string, string>();
    if (missingDates.length) {
      console.error(`  extracting dates for ${missingDates.length} entities missing dates...`);
      const D_BATCH = 5;
      for (let i = 0; i < missingDates.length; i += D_BATCH) {
        const batch = missingDates.slice(i, i + D_BATCH);
        const entities = batch.map((r) => ({
          id: r.qid,
          type: r.type,
          title: r.label,
          lead: (leads.get(r.wikipediaTitle) ?? "").slice(0, 900),
        }));
        const user = `Entities:\n${JSON.stringify(entities)}\n\n` +
          `For each entity, return a JSON object keyed by id with ` +
          `{"start": {"year": int, "estimated": bool} | null, ` +
          `"end": {"year": int, "estimated": bool} | null, ` +
          `"citation": "short verbatim quote from the text containing the year"}. ` +
          `Use negative years for BCE. Return null when the date is absent from the text. ` +
          `Output only JSON.`;
        const content = await callLLM(
          "You extract dates from Wikipedia text. Only report dates actually present in the provided text; otherwise null. Respond with valid JSON only.",
          user,
        );
        const parsed = parseJsonObject(content);
        for (const e of batch) {
          const v = parsed[e.qid] as LlmDateResult | undefined;
          if (!v) continue;
          if (!e.start && v.start && citationSupportsYear(v.start.year, v.citation)) {
            e.start = { year: v.start.year, precision: "year", estimated: v.start.estimated };
            if (v.citation) citations.set(e.qid, v.citation);
          }
          if (!e.end && v.end && citationSupportsYear(v.end.year, v.citation)) {
            e.end = { year: v.end.year, precision: "year", estimated: v.end.estimated };
            if (v.citation && !citations.has(e.qid)) citations.set(e.qid, v.citation);
          }
        }
        await sleep(150);
      }
    }

    const out: EnrichedCandidate[] = rows.map((r) => {
      const prev = existing.get(r.qid);
      const e = prev ?? enriched.get(r.qid);
      const c = citations.get(r.qid);
      return {
        ...r,
        description: e?.description ?? "",
        lanes: e?.lanes ?? [],
        ...(c
          ? { citations: [c] }
          : prev?.citations
            ? { citations: prev.citations }
            : {}),
      };
    });

    const path = resolve(OUT_DIR, `${t}.jsonl`);
    await writeFile(path, out.map((s) => JSON.stringify(s)).join("\n") + "\n");
    console.error(`wrote ${out.length} enriched ${t} -> ${path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
