// English Wikipedia API client: resolve article titles to Wikidata QIDs.

import { apiFetch, chunk, sleep, withRetry } from "./wikidata";
import { cacheGet, cacheGetMap, cacheSet, cacheSetMap, RESOLVED_CACHE_KEY } from "./cache";

const WIKI_API = "https://en.wikipedia.org/w/api.php";

// Small inter-request delay to stay within Wikipedia's rate limits.
const THROTTLE_MS = 400;

export interface ResolvedTitle {
  title: string; // requested title
  qid: string | null; // null when not resolvable
}

// Resolve titles to Wikidata QIDs via pageprops. Handles redirects so the
// returned QID is for the target article. Unresolvable titles get qid=null.
// Results are persisted across runs keyed by title.
export async function resolveTitles(titles: string[]): Promise<ResolvedTitle[]> {
  const cache = await cacheGetMap(RESOLVED_CACHE_KEY);
  const out: ResolvedTitle[] = [];

  const missing = titles.filter((t) => !cache.has(t));
  console.error(`  ${titles.length - missing.length}/${titles.length} already resolved`);

  for (const batch of chunk(missing, 50)) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "pageprops",
      ppprop: "wikibase_item",
      redirects: "1",
      titles: batch.join("|"),
    });
    const json = await withRetry(
      async () => {
        const res = await apiFetch(`${WIKI_API}?${params}`);
        return (await res.json()) as ResolveResponse;
      },
      "pageprops",
    );
    await sleep(THROTTLE_MS);

    const byTitle = new Map<string, string | null>();
    for (const page of json.query.pages) {
      byTitle.set(page.title, page.pageprops?.wikibase_item ?? null);
    }
    // Map back to requested titles; redirect targets are keyed by their title.
    for (const title of batch) {
      cache.set(title, byTitle.get(title) ?? null);
    }
    // Persist after each batch so interrupted runs can resume.
    await cacheSetMap(RESOLVED_CACHE_KEY, cache);
  }

  await cacheSetMap(RESOLVED_CACHE_KEY, cache);

  for (const title of titles) {
    out.push({ title, qid: cache.get(title) ?? null });
  }
  return out;
}

interface ResolveResponse {
  query: {
    pages: { title: string; pageprops?: { wikibase_item?: string } }[];
  };
}

export interface PageSignals {
  length: number; // bytes
  pageviews: number; // trailing ~60-day total
}

interface PageSignalsResponse {
  query: {
    pages: {
      title: string;
      missing?: boolean;
      length?: number;
      pageviews?: Record<string, number | null>;
    }[];
    redirects?: { from: string; to: string }[];
  };
}

interface SignalsBatchPage {
  title: string;
  length: number;
  pageviews: number | null; // null when pageviews data is absent (flaky under load)
}

const PAGE_SIGNALS_CACHE = "page-signals";

async function fetchSignalsBatch(batch: string[]): Promise<SignalsBatchPage[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "info|pageviews",
    pvipdays: "60",
    redirects: "1",
    titles: batch.join("|"),
  });
  const json = await withRetry(
    async () => {
      const res = await apiFetch(`${WIKI_API}?${params}`);
      return (await res.json()) as PageSignalsResponse;
    },
    "page signals",
  );
  await sleep(THROTTLE_MS);

  const out: SignalsBatchPage[] = [];
  for (const page of json.query.pages) {
    if (page.missing) continue;
    const pv = page.pageviews
      ? Object.values(page.pageviews).reduce<number>((sum, v) => sum + (v ?? 0), 0)
      : null;
    out.push({ title: page.title, length: page.length ?? 0, pageviews: pv });
  }
  // Propagate redirect targets back to the requested titles.
  for (const r of json.query.redirects ?? []) {
    const target = out.find((p) => p.title === r.to);
    if (target) out.push({ ...target, title: r.from });
  }
  return out;
}

// Fetch article byte length and recent pageviews, with a persistent cache and
// a retry pass for titles whose pageviews came back empty (the pageviews prop
// is occasionally dropped under rate-limit load).
export async function fetchPageSignals(titles: string[]): Promise<Map<string, PageSignals>> {
  const cached = (await cacheGet<Record<string, PageSignals>>(PAGE_SIGNALS_CACHE)) ?? {};
  const result = new Map<string, PageSignals>(Object.entries(cached));

  const toFetch = titles.filter((t) => !result.has(t));
  if (toFetch.length) {
    console.error(`  fetching ${toFetch.length} uncached titles...`);
    const retry: string[] = [];
    for (const batch of chunk(toFetch, 25)) {
      for (const p of await fetchSignalsBatch(batch)) {
        if (p.pageviews === null) retry.push(p.title);
        else result.set(p.title, { length: p.length, pageviews: p.pageviews });
      }
    }
    if (retry.length) {
      console.error(`  retrying ${retry.length} titles with missing pageviews...`);
      for (const batch of chunk(retry, 10)) {
        for (const p of await fetchSignalsBatch(batch)) {
          result.set(p.title, { length: p.length, pageviews: p.pageviews ?? 0 });
        }
      }
    }
    await cacheSet(PAGE_SIGNALS_CACHE, Object.fromEntries(result));
  }

  return result;
}

interface LeadsResponse {
  query: {
    pages: { title: string; missing?: boolean; extract?: string }[];
    redirects?: { from: string; to: string }[];
  };
}

const LEADS_CACHE = "leads";

// Fetch the plain-text intro extract for a set of titles, batched and cached.
// Used by Phase 4 as the LLM's source text.
export async function fetchLeads(titles: string[]): Promise<Map<string, string>> {
  const cached = (await cacheGet<Record<string, string>>(LEADS_CACHE)) ?? {};
  const result = new Map<string, string>(Object.entries(cached));

  const toFetch = titles.filter((t) => !result.has(t));
  if (toFetch.length) {
    console.error(`  fetching leads for ${toFetch.length} titles...`);
    for (const batch of chunk(toFetch, 20)) {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        exchars: "1000",
        redirects: "1",
        titles: batch.join("|"),
      });
      const json = await withRetry(
        async () => {
          const res = await apiFetch(`${WIKI_API}?${params}`);
          return (await res.json()) as LeadsResponse;
        },
        "leads",
      );
      await sleep(THROTTLE_MS);

      const byTitle = new Map<string, string>();
      for (const page of json.query.pages) {
        if (!page.missing && page.extract) byTitle.set(page.title, page.extract);
      }
      for (const r of json.query.redirects ?? []) {
        const e = byTitle.get(r.to);
        if (e) byTitle.set(r.from, e);
      }
      for (const [t, e] of byTitle) result.set(t, e);
    }
    await cacheSet(LEADS_CACHE, Object.fromEntries(result));
  }

  return result;
}

interface Section0Response {
  query: {
    pages: { title: string; missing?: boolean; revisions?: { slots?: { main?: { content?: string } } }[] }[];
    redirects?: { from: string; to: string }[];
  };
}

const SECTION0_CACHE = "section0-wikitext";

// Fetch section-0 wikitext (the intro + infobox) for a set of titles, batched
// and cached. Used by Phase 3 infobox date extraction.
export async function fetchSection0(titles: string[]): Promise<Map<string, string>> {
  const cached = (await cacheGet<Record<string, string>>(SECTION0_CACHE)) ?? {};
  const result = new Map<string, string>(Object.entries(cached));

  const toFetch = titles.filter((t) => !result.has(t));
  if (toFetch.length) {
    console.error(`  fetching section-0 for ${toFetch.length} titles...`);
    for (const batch of chunk(toFetch, 50)) {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "revisions",
        rvprop: "content",
        rvslots: "main",
        rvsection: "0",
        redirects: "1",
        titles: batch.join("|"),
      });
      const json = await withRetry(
        async () => {
          const res = await apiFetch(`${WIKI_API}?${params}`);
          return (await res.json()) as Section0Response;
        },
        "section0",
      );
      await sleep(THROTTLE_MS);

      const byTitle = new Map<string, string>();
      for (const page of json.query.pages) {
        if (page.missing) continue;
        const content = page.revisions?.[0]?.slots?.main?.content ?? "";
        if (content) byTitle.set(page.title, content);
      }
      for (const r of json.query.redirects ?? []) {
        const c = byTitle.get(r.to);
        if (c) byTitle.set(r.from, c);
      }
      for (const [t, c] of byTitle) result.set(t, c);
    }
    await cacheSet(SECTION0_CACHE, Object.fromEntries(result));
  }

  return result;
}
