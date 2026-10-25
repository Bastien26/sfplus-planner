import { data } from "./data";
import type { Schematic, SchematicType } from "./data/types";

export interface Progression {
  /** Only use recipes unlocked by owned schematics. */
  enabled: boolean;
  /** Schematic ids the player has unlocked (Hub upgrades, milestones, MAM nodes, hard drives). */
  owned: string[];
}

const ofType = (type: SchematicType) => Object.values(data.schematics).filter((s) => s.type === type);
const byName = (a: Schematic, b: Schematic) => a.name.localeCompare(b.name, "fr", { numeric: true });

export const hubUpgrades = ofType("tutorial").sort(byName);
export const hardDrives = ofType("alternate").sort(byName);

export const milestonesByTier = new Map<number, Schematic[]>();
for (const s of ofType("milestone").sort(byName)) milestonesByTier.set(s.tier, [...(milestonesByTier.get(s.tier) ?? []), s]);
export const tiers = [...milestonesByTier.keys()].sort((a, b) => a - b);

export const mamByGroup = new Map<string, Schematic[]>();
for (const s of ofType("mam").sort(byName)) mamByGroup.set(s.group, [...(mamByGroup.get(s.group) ?? []), s]);

export const MAM_GROUP_LABELS: Record<string, string> = {
  AlternateRecipes: "Recettes alternatives",
  Alien: "Alien",
  AlienTech: "Technologie alien",
  Cryolite: "Cryolite",
  Enemy: "Créatures",
  Evo: "Évolution",
  Farming: "Agriculture",
  Faxit: "FaxIT",
  Satmonium: "Satmonium",
  Slugs: "Limaces",
  Sulfur: "Soufre",
  XMas: "FICSMAS",
};

/**
 * Owned schematics plus the ones that come for free: game-start and per-tier "custom" unlocks
 * (Packager fluids…) up to the highest milestone tier, and every Hub upgrade once a milestone is bought.
 */
export function effectiveSchematics(owned: Iterable<string>): Set<string> {
  const result = new Set([...owned].filter((id) => data.schematics[id]));
  const milestoneTiers = [...result].map((id) => data.schematics[id]).filter((s) => s.type === "milestone").map((s) => s.tier);
  const maxTier = Math.max(0, ...milestoneTiers);
  for (const s of Object.values(data.schematics)) {
    if (s.type === "custom" && s.tier <= maxTier) result.add(s.id);
    if (s.type === "tutorial" && maxTier >= 1) result.add(s.id);
  }
  return result;
}

export function unlockedRecipes(owned: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const id of effectiveSchematics(owned)) for (const r of data.schematics[id].recipes) ids.add(r);
  return ids;
}

/** Every Hub upgrade and every milestone up to `tier`, keeping MAM nodes and hard drives already owned. */
export function ownUpToTier(owned: string[], tier: number): string[] {
  const keep = owned.filter((id) => {
    const t = data.schematics[id]?.type;
    return t !== "tutorial" && t !== "milestone";
  });
  const progression = [...hubUpgrades, ...tiers.filter((t) => t <= tier).flatMap((t) => milestonesByTier.get(t)!)];
  return [...keep, ...progression.map((s) => s.id)];
}
