import type { RecipeUse } from "../solver/types";

/** Orders recipes from raw materials to final products. */
export function orderByDepth(uses: RecipeUse[]): RecipeUse[] {
  const producers = new Map<string, number[]>();
  uses.forEach((u, i) => u.outputs.forEach((o) => producers.set(o.item, [...(producers.get(o.item) ?? []), i])));
  const depth = uses.map(() => 0);
  for (let iter = 0; iter < uses.length; iter++) {
    let changed = false;
    uses.forEach((u, i) => {
      const upstream = u.inputs.flatMap((f) => (producers.get(f.item) ?? []).filter((j) => j !== i).map((j) => depth[j]));
      const d = 1 + Math.max(0, ...upstream);
      if (d > depth[i] && d <= uses.length) {
        depth[i] = d;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return uses.map((u, i) => ({ u, d: depth[i] })).sort((a, b) => a.d - b.d).map((x) => x.u);
}
