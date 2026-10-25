import type { GameData, Item, ItemForm, Machine, Recipe, Schematic, SchematicType, Stack } from "../../../src/data/types";

interface RawStack {
  item: string;
  amount: number;
  chance?: number;
}
interface RawRecipe {
  name: string;
  classPath: string;
  input: RawStack[];
  output: RawStack[];
  duration: number;
  producedIn?: string[];
  producerPower?: { producer: string; isVariable: boolean; powerMin: number; powerMax: number; powerAvg: number }[];
  powerAverage?: number;
  isAlternate: boolean;
  isCustomization: boolean;
  isBuildGunRecipe: boolean;
  plannerExclude: boolean;
  classData?: { mIngredients?: { ItemClass: string; amount: number }[]; mProduct?: { ItemClass: string; amount: number }[] };
}
interface RawItem {
  name: string;
  classPath: string;
  form: string;
  image?: string;
  sinkPoints?: number;
  tags?: string[];
}
interface RawBuilding {
  name: string;
  classPath: string;
  image?: string;
  factory?: {
    powerConsumption: number;
    powerConsumptionExponent: number;
    canChangePotential: boolean;
    potentialShardSlots: number;
    hasPowerDynamic: boolean;
    powerConsumptionMin: number;
    powerConsumptionMax: number;
  };
}
interface RawSchematic {
  name: string;
  classPath: string;
  type: string;
  tier: number;
  recipes?: unknown;
  unlocksRaw?: { classData?: { mRecipes?: string[] } }[];
}
export interface RawWiki {
  meta: { version: string; exportId: string; timestamp: string; loadedMods: { ref: string; name: string; version: string }[] };
  recipe: RawRecipe[];
  item: RawItem[];
  building: RawBuilding[];
  schematic: RawSchematic[];
}

export interface BuildReport {
  rawCounts: Record<string, number>;
  skipped: { buildGun: number; customization: number; handcraftOnly: number; noDuration: number; plannerExclude: string[] };
  unknownProducers: string[];
  multiMachine: string[];
  duplicateStacks: string[];
  classDataMismatch: string[];
  inputChance: string[];
  randomOutputs: string[];
  idCollisions: string[];
  invalidForm: string[];
  missingItems: string[];
  externalInputs: string[];
  unusedRawResources: string[];
  notUnlocked: string[];
  machinesWithoutPower: string[];
}

export const ICON_BASE_URL = "https://k-mods.com/static/wiki";
const NON_MACHINE = /WorkBench|BuildGun|Workshop/i;
const RAW_TAG = "KMods.PlannerResource";
/** All wiki mods are SF+ dependencies; when a recipe runs in several machines, prefer these mods' machines. */
const PREFERRED_MACHINE_MODS = new Set(["FactoryGame", "SatisfactoryPlus", "KLib"]);

const shortName = (path: string) => path.split("/").pop()!;
const modOf = (path: string) => {
  const seg = path.split("/")[1];
  return seg === "Game" ? "FactoryGame" : seg;
};
const preferredFirst = (a: string, b: string) =>
  Number(!PREFERRED_MACHINE_MODS.has(modOf(a))) - Number(!PREFERRED_MACHINE_MODS.has(modOf(b)));

const FORMS: Record<string, ItemForm> = {
  "EResourceForm::RF_SOLID": "solid",
  "EResourceForm::RF_LIQUID": "liquid",
  "EResourceForm::RF_GAS": "gas",
};

const SCHEMATIC_TYPES: Record<string, SchematicType> = {
  "ESchematicType::EST_Tutorial": "tutorial",
  "ESchematicType::EST_Milestone": "milestone",
  "ESchematicType::EST_MAM": "mam",
  "ESchematicType::EST_Alternate": "alternate",
  "ESchematicType::EST_HardDrive": "harddrive",
  "ESchematicType::EST_ResourceSink": "sink",
  "ESchematicType::EST_Custom": "custom",
  "ESchematicType::EST_Customization": "customization",
  "ESchematicType::EST_Cheat": "cheat",
};

/** Maps class paths to short ids; on collision both get a "@mod" suffix. */
function makeIds(paths: Iterable<string>, label: string, collisions: string[]) {
  const byShort = new Map<string, string[]>();
  for (const p of new Set(paths)) {
    const s = shortName(p);
    byShort.set(s, [...(byShort.get(s) ?? []), p]);
  }
  const ids = new Map<string, string>();
  for (const [s, list] of byShort) {
    if (list.length > 1) collisions.push(`${label} ${s} : ${list.join(", ")}`);
    for (const p of list) ids.set(p, list.length > 1 ? `${s}@${modOf(p)}` : s);
  }
  return ids;
}

/** Local icon file names, keyed by remote image path; basename unless two paths share it. */
class IconRegistry {
  readonly files = new Map<string, string>();
  private readonly owner = new Map<string, string>();

  add(imagePath: string | undefined): string | null {
    if (!imagePath) return null;
    const existing = this.files.get(imagePath);
    if (existing) return existing;
    let file = `${shortName(imagePath)}.png`;
    if (this.owner.has(file)) file = `${imagePath.slice(1).replaceAll("/", "_")}.png`;
    this.owner.set(file, imagePath);
    this.files.set(imagePath, file);
    return file;
  }

  /** local file name → remote URL */
  downloads(): Map<string, string> {
    return new Map([...this.files].map(([path, file]) => [file, `${ICON_BASE_URL}${path}.png`]));
  }
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function sortRecord<T>(rec: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).sort(([a], [b]) => a.localeCompare(b)));
}

export function fromWiki(raw: RawWiki): { data: GameData; report: BuildReport; icons: Map<string, string> } {
  const report: BuildReport = {
    rawCounts: {
      recipes: raw.recipe.length,
      items: raw.item.length,
      buildings: raw.building.length,
      schematics: raw.schematic.length,
    },
    skipped: { buildGun: 0, customization: 0, handcraftOnly: 0, noDuration: 0, plannerExclude: [] },
    unknownProducers: [],
    multiMachine: [],
    duplicateStacks: [],
    classDataMismatch: [],
    inputChance: [],
    randomOutputs: [],
    idCollisions: [],
    invalidForm: [],
    missingItems: [],
    externalInputs: [],
    unusedRawResources: [],
    notUnlocked: [],
    machinesWithoutPower: [],
  };

  const itemByPath = new Map(raw.item.map((i) => [i.classPath, i]));
  const buildingByPath = new Map(raw.building.map((b) => [b.classPath, b]));
  const unknownProducers = new Set<string>();

  // 1. Keep production recipes only.
  const kept: { r: RawRecipe; machines: string[] }[] = [];
  for (const r of raw.recipe) {
    if (r.isBuildGunRecipe) { report.skipped.buildGun++; continue; }
    if (r.isCustomization) { report.skipped.customization++; continue; }
    const producers = (r.producedIn ?? []).filter((p) => !NON_MACHINE.test(p));
    for (const p of producers) if (!buildingByPath.has(p)) unknownProducers.add(p);
    const machines = producers.filter((p) => buildingByPath.get(p)?.factory).sort(preferredFirst);
    if (machines.length === 0) { report.skipped.handcraftOnly++; continue; }
    if (!(r.duration > 0)) { report.skipped.noDuration++; continue; }
    if (r.plannerExclude) {
      report.skipped.plannerExclude.push(`${r.name} (${machines.map((m) => buildingByPath.get(m)!.name).join(", ")})`);
      continue;
    }
    kept.push({ r, machines });
  }
  report.unknownProducers = [...unknownProducers].map(shortName);

  // 2. Ids.
  const usedItemPaths = new Set<string>();
  const usedMachinePaths = new Set<string>();
  for (const { r, machines } of kept) {
    for (const s of [...r.input, ...r.output]) usedItemPaths.add(s.item);
    for (const m of machines) usedMachinePaths.add(m);
  }
  const itemIds = makeIds(usedItemPaths, "objet", report.idCollisions);
  const machineIds = makeIds(usedMachinePaths, "machine", report.idCollisions);
  const recipeIds = makeIds(kept.map((k) => k.r.classPath), "recette", report.idCollisions);

  const icons = new IconRegistry();

  // 3. Items.
  const items: Record<string, Item> = {};
  for (const path of usedItemPaths) {
    const it = itemByPath.get(path);
    const id = itemIds.get(path)!;
    if (!it) {
      report.missingItems.push(path);
      items[id] = { id, name: shortName(path), form: "solid", icon: null, sinkPoints: 0, raw: false, mod: modOf(path) };
      continue;
    }
    const form = FORMS[it.form];
    if (!form) report.invalidForm.push(`${it.name || id} (${it.form})`);
    items[id] = {
      id,
      name: it.name || id,
      form: form ?? "solid",
      icon: icons.add(it.image),
      sinkPoints: it.sinkPoints ?? 0,
      raw: (it.tags ?? []).includes(RAW_TAG),
      mod: modOf(path),
    };
  }
  report.unusedRawResources = raw.item
    .filter((i) => (i.tags ?? []).includes(RAW_TAG) && !usedItemPaths.has(i.classPath))
    .map((i) => i.name);

  // 4. Machines.
  const machines: Record<string, Machine> = {};
  for (const path of usedMachinePaths) {
    const b = buildingByPath.get(path)!;
    const f = b.factory!;
    const id = machineIds.get(path)!;
    if (!f.hasPowerDynamic && !(f.powerConsumption > 0)) report.machinesWithoutPower.push(b.name);
    machines[id] = {
      id,
      name: b.name,
      powerMW: f.powerConsumption,
      powerExponent: round(f.powerConsumptionExponent),
      maxClockDefault: f.canChangePotential ? 2.5 : 1,
      canChangeClock: f.canChangePotential,
      shardSlots: f.potentialShardSlots,
      ...(f.hasPowerDynamic ? { variablePower: { min: f.powerConsumptionMin, max: f.powerConsumptionMax } } : {}),
      icon: icons.add(b.image),
      mod: modOf(path),
    };
  }

  // 5. Recipes.
  const isFluid = (path: string) => {
    const f = FORMS[itemByPath.get(path)?.form ?? ""];
    return f === "liquid" || f === "gas";
  };
  const toStacks = (list: RawStack[], applyChance: boolean, recipeName: string): Stack[] => {
    const sums = new Map<string, number>();
    for (const s of list) {
      let amount = s.amount * (applyChance ? (s.chance ?? 100) / 100 : 1);
      if (isFluid(s.item)) amount /= 1000;
      const id = itemIds.get(s.item)!;
      if (sums.has(id)) report.duplicateStacks.push(`${recipeName} : ${id} apparaît plusieurs fois (additionné)`);
      sums.set(id, (sums.get(id) ?? 0) + amount);
    }
    return [...sums].map(([item, amount]) => ({ item, amount: round(amount) }));
  };

  const recipes: Record<string, Recipe> = {};
  for (const { r, machines: producers } of kept) {
    const id = recipeIds.get(r.classPath)!;
    const machinePath = producers[0];
    if (producers.length > 1) {
      report.multiMachine.push(`${r.name} : ${producers.map((p) => buildingByPath.get(p)!.name).join(" / ")}`);
    }
    if (r.input.some((s) => (s.chance ?? 100) !== 100)) report.inputChance.push(r.name);
    if (r.output.some((s) => (s.chance ?? 100) !== 100)) {
      report.randomOutputs.push(
        `${r.name} : ${r.output.map((s) => `${s.amount} ${itemByPath.get(s.item)?.name ?? shortName(s.item)} @${round(s.chance ?? 100)}%`).join(" + ")}`,
      );
    }

    const cd = r.classData;
    if (cd?.mIngredients && cd?.mProduct) {
      const key = (l: { item: string; amount: number }[]) =>
        l.map((s) => `${s.item}:${s.amount}`).sort().join("|");
      const top = key([...r.input, ...r.output.map((s) => ({ ...s, item: `out:${s.item}` }))]);
      const cls = key([
        ...cd.mIngredients.map((s) => ({ item: s.ItemClass, amount: s.amount })),
        ...cd.mProduct.map((s) => ({ item: `out:${s.ItemClass}`, amount: s.amount })),
      ]);
      if (top !== cls) report.classDataMismatch.push(r.name);
    }

    const pp = r.producerPower?.find((p) => p.producer === machinePath);
    const building = buildingByPath.get(machinePath)!;
    const mods = new Set([modOf(r.classPath), modOf(machinePath)]);
    recipes[id] = {
      id,
      name: r.name.replace(/^Alternate: /, ""),
      alternate: r.isAlternate,
      machine: machineIds.get(machinePath)!,
      machines: producers.map((p) => machineIds.get(p)!),
      duration: r.duration,
      inputs: toStacks(r.input, false, r.name),
      outputs: toStacks(r.output, true, r.name),
      powerMW: pp?.powerAvg ?? r.powerAverage ?? building.factory!.powerConsumption,
      ...(pp?.isVariable ? { powerRange: { min: pp.powerMin, max: pp.powerMax } } : {}),
      mods: [...mods].sort(),
      unlockedBy: [],
    };
  }

  // 6. Items consumed but never produced by a kept recipe and not tagged raw: treat as external inputs.
  const produced = new Set(Object.values(recipes).flatMap((r) => r.outputs.map((s) => s.item)));
  for (const r of Object.values(recipes)) {
    for (const s of r.inputs) {
      const it = items[s.item];
      if (!it.raw && !produced.has(s.item)) {
        it.raw = true;
        report.externalInputs.push(it.name);
      }
    }
  }
  report.externalInputs = [...new Set(report.externalInputs)].sort();

  // 7. Schematics (only those unlocking at least one kept recipe).
  const recipeIdByPath = recipeIds;
  const schematics: Record<string, Schematic> = {};
  const schematicIds = makeIds(raw.schematic.map((s) => s.classPath), "schéma", report.idCollisions);
  for (const s of raw.schematic) {
    const paths = new Set<string>();
    for (const u of s.unlocksRaw ?? []) for (const p of u.classData?.mRecipes ?? []) paths.add(p);
    if (Array.isArray(s.recipes)) for (const p of s.recipes) if (typeof p === "string") paths.add(p);
    const unlocked = [...paths].map((p) => recipeIdByPath.get(p)).filter((x): x is string => !!x).sort();
    if (unlocked.length === 0) continue;
    const id = schematicIds.get(s.classPath)!;
    const tree = s.classPath.match(/\/MAM\/Schematics\/([^/]+)\//) ?? s.classPath.match(/\/Research\/([^/]+?)_RS\//);
    schematics[id] = {
      id,
      name: s.name || id,
      type: SCHEMATIC_TYPES[s.type] ?? "other",
      tier: s.tier,
      group: tree?.[1] ?? "",
      recipes: unlocked,
    };
    for (const rid of unlocked) recipes[rid].unlockedBy.push(id);
  }
  for (const r of Object.values(recipes)) {
    r.unlockedBy.sort();
    if (r.unlockedBy.length === 0) report.notUnlocked.push(r.name);
  }

  const mod = (ref: string) => raw.meta.loadedMods.find((m) => m.ref === ref)?.version ?? "?";
  const data: GameData = {
    meta: {
      source: "k-mods-wiki",
      exportId: raw.meta.exportId,
      sfVersion: mod("SatisfactoryPlus"),
      gameBuild: mod("FactoryGame"),
      exportedAt: raw.meta.timestamp,
      generatedAt: new Date().toISOString(),
      mods: raw.meta.loadedMods.map(({ ref, name, version }) => ({ ref, name, version })),
    },
    items: sortRecord(items),
    machines: sortRecord(machines),
    recipes: sortRecord(recipes),
    schematics: sortRecord(schematics),
  };
  return { data, report, icons: icons.downloads() };
}
