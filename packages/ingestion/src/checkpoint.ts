// JSONL checkpoint read/write. Checkpoints are append-only and keyed by QID so
// a re-run can resume without re-querying (though SPARQL is cheap enough that
// the extractors currently just overwrite). Writes go through a temp file +
// rename so a crash mid-write can never leave a truncated file behind.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(__dirname, "..", "data");

// Replace `path` atomically: write a sibling temp file, then rename it over the
// target. A kill between the two leaves the old file intact.
export async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmp, content);
  await rename(tmp, path);
}

export async function writeJsonl<T>(
  name: string,
  rows: T[],
): Promise<string> {
  const path = resolve(DATA_DIR, name);
  const content = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  await writeAtomic(path, content);
  return path;
}

export async function readJsonl<T>(name: string): Promise<T[]> {
  const path = resolve(DATA_DIR, name);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    // A file that doesn't exist yet is an empty checkpoint; anything else
    // (corruption, permissions, wrong path) must fail loudly rather than
    // masquerade as an empty category.
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l, i) => {
      try {
        return JSON.parse(l) as T;
      } catch (err) {
        throw new Error(`${path}:${i + 1}: ${(err as Error).message}`);
      }
    });
}
