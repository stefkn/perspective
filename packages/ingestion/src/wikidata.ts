// Shared Wikidata value parsers and helpers.

import type { Coords, ParsedTime, TimePrecision } from "./types";

export const USER_AGENT = "perspective/0.1 (personal history-exploration project)";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chunk a list into batches of `size`.
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Error that records whether an API failure is transient and any Retry-After
// hint, so withRetry can back off sensibly.
export class ApiError extends Error {
  transient: boolean;
  retryAfterMs?: number;
  constructor(message: string, transient: boolean, retryAfterMs?: number) {
    super(message);
    this.transient = transient;
    this.retryAfterMs = retryAfterMs;
  }
}

// Retry a fetch-based operation with exponential backoff on transient errors.
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 6,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const transient =
        err instanceof ApiError ? err.transient : /timeout|fetch failed/i.test(String(err));
      if (!transient || attempt >= maxAttempts) throw err;
      const retryAfterMs = err instanceof ApiError ? err.retryAfterMs : undefined;
      const backoff = retryAfterMs ?? 2000 * 2 ** attempt;
      console.error(`${label} retry ${attempt} (${(err as Error).message}), waiting ${backoff}ms`);
      await sleep(backoff);
    }
  }
}

// Shared fetch wrapper that turns HTTP statuses into ApiError with Retry-After.
export async function apiFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    throw new ApiError("HTTP 429", true, ra ? Number(ra) * 1000 : undefined);
  }
  if (res.status >= 500) throw new ApiError(`HTTP ${res.status}`, true);
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, false);
  return res;
}

// Numeric rank of each precision so "prefer the finer one" is a comparison.
const PRECISION_RANK: Record<TimePrecision, number> = {
  coarse: 0,
  millennium: 1,
  century: 2,
  decade: 3,
  year: 4,
  month: 5,
  day: 6,
};

export function precisionRank(p: TimePrecision): number {
  return PRECISION_RANK[p];
}

function precisionToEnum(p: number): TimePrecision {
  if (p >= 11) return "day";
  if (p === 10) return "month";
  if (p === 9) return "year";
  if (p === 8) return "decade";
  if (p === 7) return "century";
  if (p === 6) return "millennium";
  return "coarse";
}

// Parse a Wikidata time literal (e.g. "+1955-03-14T00:00:00Z") plus its
// timePrecision into our ParsedTime shape. `circa` comes from the P1480
// "sourcing circumstances" qualifier (wd:Q5727902 = circa).
export function parseWikidataTime(
  value: string,
  precision: number,
  circa: boolean,
): ParsedTime {
  const m = value.match(/^([+-])(\d{1,16})-(\d{2})-(\d{2})T/);
  if (!m) throw new Error(`Unparseable Wikidata time: ${value}`);
  const sign = m[1] === "-" ? -1 : 1;
  const year = sign * parseInt(m[2], 10);
  const prec = precisionToEnum(precision);
  const estimated = !(prec === "day" || prec === "month" || prec === "year") || circa;
  return { year, precision: prec, estimated };
}

export function toInt(value: string | undefined): number {
  return Number.parseInt(value ?? "0", 10);
}
