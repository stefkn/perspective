// Downloads Wikipedia's "On this day" events feed for every calendar day and
// writes a compact snapshot to public/on-this-day.json for offline bundling.
//
// Usage: node scripts/fetch-on-this-day.mjs
//
// Source: https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{MM}/{DD}
// The raw feed carries verbose page metadata (thumbnails, extracts); we strip
// each event down to { year, text, title } to keep the snapshot small (~4 MB).
//
// The endpoint rate-limits aggressively, so requests are paced, failures are
// retried with backoff, and progress is checkpointed so the script can resume.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const API = "https://en.wikipedia.org/api/rest_v1/feed/onthisday/events";
const USER_AGENT = "perspective/0.1 (personal history-exploration project)";
const DELAY_MS = 500;
const MAX_ATTEMPTS = 8;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "on-this-day.json");

const pad = (n) => String(n).padStart(2, "0");

function daysInMonth(month) {
  // month is 1-12; year 2000 is a leap year and has every day we care about.
  return new Date(2000, month, 0).getDate();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDay(month, day) {
  const url = `${API}/${pad(month)}/${pad(day)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const err = new Error(`HTTP ${res.status} for ${pad(month)}/${pad(day)}`);
    if (Number.isFinite(retryAfter)) err.retryAfterMs = retryAfter * 1000;
    throw err;
  }
  const json = await res.json();
  return (json.events ?? []).map((e) => {
    const page = e.pages?.find((p) => p.type === "standard") ?? e.pages?.[0];
    return {
      y: e.year,
      t: e.text,
      p: page?.normalizedtitle ?? page?.title ?? null,
    };
  });
}

async function fetchWithRetry(month, day) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchDay(month, day);
    } catch (err) {
      const key = `${pad(month)}${pad(day)}`;
      if (attempt >= MAX_ATTEMPTS) throw err;
      const backoff = Math.min(err.retryAfterMs ?? 4000 * 2 ** attempt, 60_000);
      console.error(`retrying ${key} (attempt ${attempt}): ${err.message}`);
      await sleep(backoff);
    }
  }
}

async function save(data) {
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(data));
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const data = await loadExisting();
  const done = new Set(Object.keys(data));

  const todo = [];
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= daysInMonth(month); day++) {
      const key = `${pad(month)}${pad(day)}`;
      if (!done.has(key)) todo.push({ month, day });
    }
  }

  console.error(
    `${Object.keys(data).length}/366 already fetched, ${todo.length} remaining`,
  );

  for (let i = 0; i < todo.length; i++) {
    const { month, day } = todo[i];
    const key = `${pad(month)}${pad(day)}`;
    try {
      data[key] = await fetchWithRetry(month, day);
    } catch (err) {
      console.error(`FAILED ${key}: ${err.message}`);
    }
    if ((i + 1) % 20 === 0 || i === todo.length - 1) {
      console.error(
        `${Object.keys(data).length}/366 done (${todo.length - i - 1} left)`,
      );
      await save(data);
    }
    await sleep(DELAY_MS);
  }

  await save(data);
  const totalEvents = Object.values(data).reduce((n, e) => n + e.length, 0);
  console.error(
    `wrote ${OUT_PATH}: ${Object.keys(data).length} days, ${totalEvents} events`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
