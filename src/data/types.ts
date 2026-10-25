export type ItemForm = "solid" | "liquid" | "gas";

export type SchematicType =
  | "tutorial"
  | "milestone"
  | "mam"
  | "alternate"
  | "harddrive"
  | "sink"
  | "custom"
  | "customization"
  | "cheat"
  | "other";

export interface ModInfo {
  ref: string;
  name: string;
  version: string;
}

export interface Item {
  id: string;
  name: string;
  form: ItemForm;
  icon: string | null;
  sinkPoints: number;
  raw: boolean;
  mod: string;
}

export interface Machine {
  id: string;
  name: string;
  powerMW: number;
  powerExponent: number;
  maxClockDefault: number;
  canChangeClock: boolean;
  shardSlots: number;
  variablePower?: { min: number; max: number };
  icon: string | null;
  mod: string;
}

/** Amounts are per cycle; fluids in m³. */
export interface Stack {
  item: string;
  amount: number;
}

export interface Recipe {
  id: string;
  name: string;
  alternate: boolean;
  machine: string;
  machines: string[];
  duration: number;
  inputs: Stack[];
  outputs: Stack[];
  powerMW: number;
  powerRange?: { min: number; max: number };
  mods: string[];
  unlockedBy: string[];
}

export interface Schematic {
  id: string;
  name: string;
  type: SchematicType;
  tier: number;
  /** MAM research tree (folder name, e.g. "AlternateRecipes", "Slugs"); empty otherwise. */
  group: string;
  recipes: string[];
}

export interface GameData {
  meta: {
    source: string;
    exportId: string;
    sfVersion: string;
    gameBuild: string;
    exportedAt: string;
    generatedAt: string;
    mods: ModInfo[];
  };
  items: Record<string, Item>;
  machines: Record<string, Machine>;
  recipes: Record<string, Recipe>;
  schematics: Record<string, Schematic>;
}
