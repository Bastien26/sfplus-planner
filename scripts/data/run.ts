import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GameData } from "../../src/data/types";
import { fromWiki, type BuildReport, type RawWiki } from "./adapters/wiki";
import { ICON_DIR, downloadIcons, resizeIcons } from "./download-icons";
import { fetchWiki, latestRawDir, readRaw } from "./fetch-wiki";

const OUT_FILE = join("src", "data", "sfplus.json");

const args = new Set(process.argv.slice(2));
const offline = args.has("--offline");
const force = args.has("--force");

const dir = offline ? latestRawDir() : await fetchWiki(force);
const { data, report, icons } = fromWiki(readRaw(dir) as RawWiki);

if (!offline) await downloadIcons(icons);
await resizeIcons(icons.keys());
for (const entity of [...Object.values(data.items), ...Object.values(data.machines)]) {
  if (entity.icon && !existsSync(join(ICON_DIR, entity.icon))) entity.icon = null;
}

mkdirSync(join("src", "data"), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(data, null, 1) + "\n");
printReport(data, report);
console.log(`\nÉcrit : ${OUT_FILE}`);

function printReport(d: GameData, r: BuildReport) {
  const recipes = Object.values(d.recipes);
  const count = <T>(list: T[], key: (x: T) => string | string[]) => {
    const acc: Record<string, number> = {};
    for (const x of list) for (const k of [key(x)].flat()) acc[k] = (acc[k] ?? 0) + 1;
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
  };
  const list = (title: string, items: string[], max = 15) => {
    if (items.length === 0) return;
    console.log(`\n${title} (${items.length})`);
    for (const x of items.slice(0, max)) console.log(`  - ${x}`);
    if (items.length > max) console.log(`  … et ${items.length - max} de plus`);
  };

  console.log(`\n=== Données SF+ ${d.meta.sfVersion} (export ${d.meta.exportId}, ${d.meta.exportedAt}) ===`);
  console.log(`Brut : ${Object.entries(r.rawCounts).map(([k, n]) => `${n} ${k}`).join(", ")}`);
  console.log(
    `Écartées : ${r.skipped.buildGun} recettes de construction, ${r.skipped.customization} cosmétiques, ` +
      `${r.skipped.handcraftOnly} à la main seulement, ${r.skipped.noDuration} sans durée (extraction, générateurs), ` +
      `${r.skipped.plannerExclude.length} marquées plannerExclude`,
  );
  console.log(
    `Gardées : ${recipes.length} recettes (${recipes.filter((x) => x.alternate).length} alternatives), ` +
      `${Object.keys(d.items).length} objets (${Object.values(d.items).filter((i) => i.raw).length} bruts), ` +
      `${Object.keys(d.machines).length} machines, ${Object.keys(d.schematics).length} schémas`,
  );
  console.log(`Recettes par mod : ${count(recipes, (x) => x.mods)}`);
  console.log(`Recettes par machine : ${count(recipes, (x) => d.machines[x.machine].name)}`);
  console.log(`Objets par forme : ${count(Object.values(d.items), (i) => i.form)}`);
  console.log(`Schémas par type : ${count(Object.values(d.schematics), (s) => s.type)}`);
  console.log(`Icônes : ${[...Object.values(d.items), ...Object.values(d.machines)].filter((x) => x.icon).length} sur ${Object.keys(d.items).length + Object.keys(d.machines).length}`);

  list("Ressources brutes (tag KMods.PlannerResource)", Object.values(d.items).filter((i) => i.raw && !r.externalInputs.includes(i.name)).map((i) => `${i.name} [${i.form}]`), 40);
  list("Ressources brutes du tag non utilisées par les recettes gardées", r.unusedRawResources);
  list("Entrées externes (consommées, produites par aucune recette gardée) → traitées comme brutes", r.externalInputs, 40);
  list("Recettes plannerExclude écartées", r.skipped.plannerExclude, 30);
  list("Recettes faisables dans plusieurs machines (la 1re est retenue)", r.multiMachine);
  list("Sorties aléatoires (moyenne retenue)", r.randomOutputs);
  list("Objet en double dans une recette", r.duplicateStacks);
  list("Écarts entre données calculées et classData", r.classDataMismatch);
  list("Entrées avec probabilité ≠ 100 %", r.inputChance);
  list("Collisions d'identifiants", r.idCollisions);
  list("Objets à forme invalide", r.invalidForm);
  list("Objets introuvables", r.missingItems);
  list("Machines inconnues", r.unknownProducers);
  list("Machines sans puissance", r.machinesWithoutPower);
  list("Recettes débloquées par aucun schéma", r.notUnlocked, 30);
}
