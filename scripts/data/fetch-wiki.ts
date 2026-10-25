import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const WIKI_API = "https://dev.k-mods.com/api/v2/wiki";
export const RAW_ROOT = join("data-raw", "wiki");
export const USER_AGENT = "sfplus-planner/0.1 (outil perso)";
export const RAW_TYPES = ["recipe", "item", "building", "schematic"] as const;

const LATEST_FILE = join(RAW_ROOT, "latest.txt");
const PAUSE_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.text();
}

/** Downloads the raw wiki export into data-raw/wiki/<exportId>/ unless already cached. */
export async function fetchWiki(force: boolean): Promise<string> {
  const metaText = await getText(`${WIKI_API}/raw?identifiers=%2Fmeta`);
  const meta = JSON.parse(metaText)[0];
  if (!meta?.exportId) throw new Error("Méta du wiki illisible (pas d'exportId)");

  const dir = join(RAW_ROOT, meta.exportId);
  const cached = RAW_TYPES.every((t) => existsSync(join(dir, `${t}.json`)));
  console.log(`Export wiki ${meta.exportId} (SF+ ${meta.version}, ${meta.timestamp})`);

  if (cached && !force) {
    console.log(`  déjà en cache dans ${dir}, aucun téléchargement`);
  } else {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "meta.json"), metaText);
    for (const type of RAW_TYPES) {
      await sleep(PAUSE_MS);
      process.stdout.write(`  ${type}… `);
      const text = await getText(`${WIKI_API}/raw/by-types?typeFilter=${type}`);
      writeFileSync(join(dir, `${type}.json`), text);
      console.log(`${(text.length / 1e6).toFixed(1)} Mo`);
    }
  }
  writeFileSync(LATEST_FILE, meta.exportId);
  return dir;
}

export function latestRawDir(): string {
  if (!existsSync(LATEST_FILE)) throw new Error("Aucun export en cache : lance d'abord `npm run data`");
  return join(RAW_ROOT, readFileSync(LATEST_FILE, "utf8").trim());
}

export function readRaw(dir: string) {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
  return {
    meta: read("meta")[0],
    recipe: read("recipe"),
    item: read("item"),
    building: read("building"),
    schematic: read("schematic"),
  };
}
