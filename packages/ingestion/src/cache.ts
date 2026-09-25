// Simple JSON-file cache for expensive, stable lookups (vital-articles list
// pages and title→QID resolution). Keeps re-runs cheap and rate-limit friendly.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "./checkpoint";

const CACHE_DIR = resolve(DATA_DIR, "cache");

function keyPath(key: string): string {
  return resolve(CACHE_DIR, `${key}.json`);
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const path = keyPath(key);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(keyPath(key), JSON.stringify(value));
}

// Load a whole title→QID map, returning the known entries (persisted across runs).
export async function cacheGetMap(key: string): Promise<Map<string, string | null>> {
  const raw = await cacheGet<Record<string, string | null>>(key);
  return new Map(Object.entries(raw ?? {}));
}

export async function cacheSetMap(key: string, map: Map<string, string | null>): Promise<void> {
  await cacheSet(key, Object.fromEntries(map));
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9-]+/g, "_");
}

export const cacheKeyForPage = (page: string) => `vital-${sanitize(page)}`;
export const RESOLVED_CACHE_KEY = "resolved-title-qid";
