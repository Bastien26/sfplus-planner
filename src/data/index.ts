import raw from "./sfplus.json";
import type { GameData, Item, Recipe } from "./types";

export const data = raw as GameData;

export const mainProduct = (r: Recipe) => r.outputs[0].item;

const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);

export const recipesByMainProduct = new Map<string, Recipe[]>();
export const recipesByOutput = new Map<string, Recipe[]>();
export const recipesByInput = new Map<string, Recipe[]>();
for (const r of Object.values(data.recipes)) {
  const push = (map: Map<string, Recipe[]>, item: string) => map.set(item, [...(map.get(item) ?? []), r]);
  push(recipesByMainProduct, mainProduct(r));
  for (const o of r.outputs) push(recipesByOutput, o.item);
  for (const i of r.inputs) push(recipesByInput, i.item);
}

export const allItems: Item[] = Object.values(data.items).sort(byName);
export const producibleItems: Item[] = allItems.filter((i) => recipesByOutput.has(i.id));

export const isFluid = (id: string) => data.items[id]?.form !== "solid";
export const itemName = (id: string) => data.items[id]?.name ?? id;
export const iconUrl = (file: string | null | undefined) => (file ? `${import.meta.env.BASE_URL}icons/${file}` : undefined);

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
