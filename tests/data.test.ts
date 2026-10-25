import { describe, expect, it } from "vitest";
import raw from "../src/data/sfplus.json";
import type { GameData } from "../src/data/types";

const data = raw as GameData;

type Ref = [id: string, machine: string, duration: number, inputs: Record<string, number>, outputs: Record<string, number>, powerMW?: number];

// Hand-checked on the SF+ wiki (quantities per cycle, fluids in m³).
const REFERENCE: Ref[] = [
  ["Recipe_Assembler_RIP", "Build_AssemblerMk1", 24, { Desc_TinPlates: 8, Desc_IronScrew: 15 }, { Desc_IronPlateReinforced: 2 }],
  ["Recipe_Alternative_CompactedIronPlate", "Build_ConstructorMk1", 40, { Desc_IronPlate: 20 }, { Desc_IronPlateReinforced: 2 }],
  ["Recipe_Alternative_StitchedIronPlate", "Build_AssemblerMk1", 40, { Desc_IronPlate: 8, Desc_TinnedWire: 18 }, { Desc_IronPlateReinforced: 6 }],
  ["Recipe_Alternative_WeldedIronPlate", "Build_Blender", 4, { Desc_IronPlate: 4, Desc_IronWire: 3, Desc_Ethylene: 1 }, { Desc_IronPlateReinforced: 2 }, 75],
  ["Recipe_Assembler_TinPlates", "Build_AssemblerMk1", 18, { Desc_TinIngot: 9, Desc_IronPlate: 6 }, { Desc_TinPlates: 12 }],
  ["Recipe_Constructor_IronScrew", "Build_ConstructorMk1", 6, { Desc_IronRod: 2 }, { Desc_IronScrew: 5 }],
  ["Recipe_Alternative_CastScrews", "Build_SmelterMk1", 6, { Desc_IronIngot: 2 }, { Desc_IronScrew: 4 }],
  ["Recipe_Constructor_IronRod", "Build_ConstructorMk1", 4, { Desc_IronIngot: 1 }, { Desc_IronRod: 1 }],
  ["Recipe_IronPlate", "Build_ConstructorMk1", 6, { Desc_IronIngot: 3 }, { Desc_IronPlate: 2 }],
  ["Recipe_Smelter_IronIngot", "Build_SmelterMk1", 6, { Desc_CrushedIron: 3 }, { Desc_IronIngot: 3 }],
  ["Recipe_Smelter_Dirty_IronIngots", "Build_SmelterMk1", 2, { Desc_CrushedSiterite: 1 }, { Desc_IronIngot: 1 }],
  ["Recipe_Smelter_TinIngot", "Build_SmelterMk1", 4, { Desc_CrushedTin: 1 }, { Desc_TinIngot: 1 }],
  ["Recipe_Crusher_CrushedSiterite", "Build_Crusher", 12, { Desc_OreIron: 12 }, { Desc_CrushedSiterite: 12, Desc_Gangue: 5 }],
  ["Recipe_Sorter_T1_Iron", "Build_SorterMk1", 12, { Desc_CrushedSiterite: 24 }, { Desc_CrushedIron: 18, Desc_CrushedTin: 12, Desc_Gangue: 8 }, 15],
  ["Recipe_Sorter_T2_Tin", "Build_SorterMk1", 8, { Desc_CrushedSiterite: 24, Desc_Air: 5 }, { Desc_CrushedTin: 18, Desc_CrushedIron: 9, Desc_Gangue: 8 }],
];

const asRecord = (stacks: { item: string; amount: number }[]) => Object.fromEntries(stacks.map((s) => [s.item, s.amount]));

describe("recettes de référence", () => {
  it.each(REFERENCE)("%s", (id, machine, duration, inputs, outputs, powerMW) => {
    const r = data.recipes[id];
    expect(r, `recette ${id} absente`).toBeDefined();
    expect(r.machine).toBe(machine);
    expect(r.duration).toBe(duration);
    expect(asRecord(r.inputs)).toEqual(inputs);
    expect(asRecord(r.outputs)).toEqual(outputs);
    if (powerMW !== undefined) expect(r.powerMW).toBe(powerMW);
  });

  it("noms et formes des objets clés", () => {
    expect(data.items.Desc_OreIron).toMatchObject({ name: "Siterite Ore", form: "solid", raw: true });
    expect(data.items.Desc_Air).toMatchObject({ name: "Air", form: "gas", raw: true });
    expect(data.items.Desc_Ethylene.form).toBe("gas");
    expect(data.items.Desc_Gangue.raw).toBe(false);
  });
});

describe("cohérence", () => {
  const recipes = Object.values(data.recipes);

  it("chaque recette référence des objets et machines connus", () => {
    for (const r of recipes) {
      expect(data.machines[r.machine], `${r.id} → ${r.machine}`).toBeDefined();
      for (const m of r.machines) expect(data.machines[m], `${r.id} → ${m}`).toBeDefined();
      for (const s of [...r.inputs, ...r.outputs]) expect(data.items[s.item], `${r.id} → ${s.item}`).toBeDefined();
    }
  });

  it("durées et quantités positives, au moins un produit", () => {
    for (const r of recipes) {
      expect(r.duration, r.id).toBeGreaterThan(0);
      expect(r.outputs.length, r.id).toBeGreaterThan(0);
      for (const s of [...r.inputs, ...r.outputs]) expect(s.amount, `${r.id} ${s.item}`).toBeGreaterThan(0);
    }
  });

  it("machines avec puissance et exposant", () => {
    for (const m of Object.values(data.machines)) {
      expect(m.powerExponent, m.id).toBeGreaterThan(0);
      if (!m.variablePower) expect(m.powerMW, m.id).toBeGreaterThan(0);
    }
  });

  it("schémas et déblocages se répondent", () => {
    for (const s of Object.values(data.schematics)) {
      for (const rid of s.recipes) expect(data.recipes[rid].unlockedBy, `${s.id} → ${rid}`).toContain(s.id);
    }
  });
});
