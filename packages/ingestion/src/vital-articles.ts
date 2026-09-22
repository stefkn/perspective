// Fetch and parse a Wikipedia "Vital articles" list page into a flat list of
// { title, topic } pairs. Vital articles are the human-curated set of most
// important topics, organized by subject — a ready-made significance ranking
// that also gives us a coarse category signal via the level-3 section headers.

import { withRetry, USER_AGENT } from "./wikidata";
import { cacheGet, cacheKeyForPage, cacheSet } from "./cache";

const WIKI_API = "https://en.wikipedia.org/w/api.php";

export interface VitalEntry {
  title: string;
  topic: string; // level-3 section, e.g. "Scientists" | "Actors"
}

// Namespaces we never want (vital entries are main-namespace articles).
const NON_ARTICLE = /^(Wikipedia|Category|File|Template|Portal|Help|Draft|User|Talk|Wikipedia talk|Template talk|Category talk):/i;

const LINK = /\[\[([^\]|#<>]+)(?:\|[^\]]*)?\]\]/;

export async function fetchVitalArticles(page: string): Promise<VitalEntry[]> {
  const cached = await cacheGet<VitalEntry[]>(cacheKeyForPage(page));
  if (cached) {
    console.error(`  (cached) ${cached.length} entries from ${page}`);
    return cached;
  }

  const params = new URLSearchParams({
    action: "parse",
    page,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });
  const json = await withRetry(
    async () => {
      const res = await fetch(`${WIKI_API}?${params}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { parse: { wikitext: string } };
    },
    "vital articles",
  );

  const entries: VitalEntry[] = [];
  let topic = "";
  for (const raw of json.parse.wikitext.split("\n")) {
    const line = raw.trim();
    const header = line.match(/^(={2,6})(.*?)\1\s*$/);
    if (header) {
      if (header[1].length === 3) topic = header[2].trim();
      continue;
    }
    if (!/^#/.test(line)) continue;
    const m = line.match(LINK);
    if (!m) continue;
    const title = m[1].trim();
    if (!title || NON_ARTICLE.test(title)) continue;
    entries.push({ title, topic });
  }

  await cacheSet(cacheKeyForPage(page), entries);
  return entries;
}
