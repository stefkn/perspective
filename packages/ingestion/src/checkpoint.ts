// JSONL checkpoint read/write. Checkpoints are append-only and keyed by QID so
// a re-run can resume without re-querying (though SPARQL is cheap enough that
// the extractors currently just overwrite).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(__dirname, "..", "data");

export async function writeJsonl<T>(
  name: string,
  rows: T[],
): Promise<string> {
  await mkdir(DATA_DIR, { recursive: true });
  const path = resolve(DATA_DIR, name);
  const content = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  await writeFile(path, content);
  return path;
}

export async function readJsonl<T>(name: string): Promise<T[]> {
  const path = resolve(DATA_DIR, name);
  try {
    const text = await readFile(path, "utf8");
    return text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}
