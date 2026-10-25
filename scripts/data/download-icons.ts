import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { USER_AGENT } from "./fetch-wiki";

/** Original PNGs from the wiki (cache, not published). */
export const ICON_SRC_DIR = join("data-raw", "icons");
/** Published icons, resized. */
export const ICON_DIR = join("public", "icons");
/** Icons show at 14–40 px; 96 px stays sharp on high-density screens. */
const ICON_SIZE = 96;
const PAUSE_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Downloads missing originals one at a time. Returns the file names that failed. */
export async function downloadIcons(icons: Map<string, string>): Promise<Set<string>> {
  mkdirSync(ICON_SRC_DIR, { recursive: true });
  const todo = [...icons].filter(([file]) => !existsSync(join(ICON_SRC_DIR, file)));
  console.log(`Icônes : ${icons.size - todo.length} déjà en cache, ${todo.length} à télécharger`);
  const failed = new Set<string>();
  let done = 0;
  for (const [file, url] of todo) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) throw new Error(`HTTP ${res.status} ${type}`);
      writeFileSync(join(ICON_SRC_DIR, file), Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      failed.add(file);
      console.warn(`  échec ${file} : ${(e as Error).message}`);
    }
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${todo.length}`);
    await sleep(PAUSE_MS);
  }
  return failed;
}

/** Writes resized copies of the cached originals into public/icons (only new or changed ones). */
export async function resizeIcons(files: Iterable<string>) {
  mkdirSync(ICON_DIR, { recursive: true });
  let resized = 0;
  for (const file of files) {
    const src = join(ICON_SRC_DIR, file);
    const dest = join(ICON_DIR, file);
    if (!existsSync(src)) continue;
    if (existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs) continue;
    await sharp(src)
      .resize(ICON_SIZE, ICON_SIZE, { fit: "inside", withoutEnlargement: true })
      .png({ palette: true, compressionLevel: 9 })
      .toFile(dest);
    resized++;
  }
  if (resized) console.log(`Icônes réduites à ${ICON_SIZE} px : ${resized}`);
}
