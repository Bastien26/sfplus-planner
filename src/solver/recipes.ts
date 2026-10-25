import type { GameData, Schematic } from "../data/types";

/** Schematics owned at a given milestone tier: Hub tutorials, game-start unlocks and milestones up to `maxTier`. */
export function progressionSchematics(data: GameData, maxTier: number): Schematic[] {
  return Object.values(data.schematics).filter(
    (s) =>
      s.type === "tutorial" ||
      (s.type === "custom" && s.tier === 0) ||
      (s.type === "milestone" && s.tier <= maxTier),
  );
}

export function unlockedRecipes(schematics: Iterable<Schematic>): Set<string> {
  const ids = new Set<string>();
  for (const s of schematics) for (const r of s.recipes) ids.add(r);
  return ids;
}

/** Standard (non-alternate) recipes unlocked up to a milestone tier. */
export function standardRecipesUpToTier(data: GameData, maxTier: number): Set<string> {
  const ids = unlockedRecipes(progressionSchematics(data, maxTier));
  for (const id of ids) if (data.recipes[id].alternate) ids.delete(id);
  return ids;
}
