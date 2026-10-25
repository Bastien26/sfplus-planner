import GLPK from "glpk.js/node";
import { describe, expect, it } from "vitest";
import { compressToEncodedURIComponent } from "lz-string";
import raw from "../src/data/sfplus.json";
import type { GameData } from "../src/data/types";
import { effectiveSchematics, hubUpgrades, ownUpToTier, unlockedRecipes } from "../src/progression";
import { solve } from "../src/solver/solve";
import { allowedRecipes, decodeState, DEFAULT_STATE, encodeState, toSolveRequest, type PlannerState } from "../src/state";

const state = (patch: Partial<PlannerState>): PlannerState => ({ ...DEFAULT_STATE, ...patch });

describe("lien de partage", () => {
  it("aller-retour encode/decode", () => {
    const s = state({
      mode: "inverse",
      maximize: [{ item: "Desc_IronPlateReinforced", ratio: 1, reserved: 5 }],
      supply: [{ item: "Desc_OreIron", rate: 60, nodes: 2, perNode: 30 }, { item: "Desc_Water", rate: null }],
      maxClock: 2.5,
      recipeToggles: { Recipe_Alternative_CastScrews: true, Recipe_Smelter_Dirty_IronIngots: false },
      pinned: { Desc_IronIngot: "Recipe_Smelter_IronIngot" },
    });
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it("ignore les objets et recettes inconnus (ancienne version des données)", () => {
    const raw = {
      ...DEFAULT_STATE,
      targets: [{ item: "Desc_Inexistant", rate: 3 }, { item: "Desc_IronPlate", rate: 10 }],
      recipeToggles: { Recipe_Disparue: true, Recipe_Alternative_CastScrews: true },
      pinned: { Desc_IronIngot: "Recipe_Disparue" },
      maxClock: 99,
    };
    const s = decodeState(compressToEncodedURIComponent(JSON.stringify(raw)))!;
    expect(s.targets).toEqual([{ item: "Desc_IronPlate", rate: 10 }]);
    expect(s.recipeToggles).toEqual({ Recipe_Alternative_CastScrews: true });
    expect(s.pinned).toEqual({});
    expect(s.maxClock).toBe(1);
  });

  it("lien abîmé : null", () => {
    expect(decodeState("n'importe quoi")).toBeNull();
  });
});

describe("progression", () => {
  const t1 = ownUpToTier([], 1);

  it("jusqu'au palier 1 : HUB + paliers 1, déblocages de départ inclus", () => {
    const eff = effectiveSchematics(t1);
    for (const h of hubUpgrades) expect(eff.has(h.id)).toBe(true);
    expect(eff.has("Schem_GameStart_new")).toBe(true);
    const recipes = unlockedRecipes(t1);
    expect(recipes.has("Recipe_Sorter_T1_Iron")).toBe(true);
    expect(recipes.has("Recipe_Smelter_Dirty_IronIngots")).toBe(true);
    expect(recipes.has("Recipe_Reformer_IronIngot")).toBe(false);
    expect(recipes.has("Recipe_Sorter_T2_Tin")).toBe(false);
  });

  it("garde les nœuds MAM déjà cochés", () => {
    const owned = ownUpToTier(["Schematic_AlternateRecipe_Tree_1_0"], 2);
    expect(owned).toContain("Schematic_AlternateRecipe_Tree_1_0");
    expect(unlockedRecipes(owned).has("Recipe_Alternative_CastScrews")).toBe(true);
  });

  it("cas 1 avec la progression (palier 1, Impure Iron Ingot décoché) : 40 sitérite", async () => {
    const s = state({
      progression: { enabled: true, owned: t1 },
      recipeToggles: { Recipe_Smelter_Dirty_IronIngots: false },
    });
    const res = await solve(raw as GameData, await GLPK(), toSolveRequest(s));
    expect(res.status).toBe("ok");
    expect(res.supplied).toEqual([{ item: "Desc_OreIron", rate: 40 }]);
    expect(Object.fromEntries(res.surplus.map((f) => [f.item, f.rate]))).toEqual({ Desc_Gangue: 30, Desc_CrushedTin: 5 });
  });

  it("progression active sans rien coché : seulement les recettes de départ", () => {
    const ids = allowedRecipes(state({ progression: { enabled: true, owned: [] } }));
    expect(ids).toContain("Recipe_IronPlate");
    expect(ids).not.toContain("Recipe_Assembler_RIP");
  });
});

describe("recettes autorisées", () => {
  it("par défaut : standard oui, alternatives non", () => {
    const ids = new Set(allowedRecipes(DEFAULT_STATE));
    expect(ids.has("Recipe_Smelter_IronIngot")).toBe(true);
    expect(ids.has("Recipe_Alternative_CastScrews")).toBe(false);
  });

  it("activer une alternative, désactiver une standard", () => {
    const ids = new Set(allowedRecipes(state({ recipeToggles: { Recipe_Alternative_CastScrews: true, Recipe_Smelter_Dirty_IronIngots: false } })));
    expect(ids.has("Recipe_Alternative_CastScrews")).toBe(true);
    expect(ids.has("Recipe_Smelter_Dirty_IronIngots")).toBe(false);
  });

  it("recette choisie pour un objet : les autres recettes de cet objet sont retirées, la choisie est ajoutée", () => {
    const ids = new Set(allowedRecipes(state({ pinned: { Desc_IronScrew: "Recipe_Alternative_CastScrews" } })));
    expect(ids.has("Recipe_Alternative_CastScrews")).toBe(true);
    expect(ids.has("Recipe_Constructor_IronScrew")).toBe(false);
    // Recipes whose main product is something else are untouched.
    expect(ids.has("Recipe_Constructor_IronRod")).toBe(true);
  });

  it("requête du solveur selon le mode", () => {
    const direct = toSolveRequest(state({ supply: [{ item: "Desc_OreIron", rate: 30 }] }));
    expect(direct.targets).toEqual(DEFAULT_STATE.targets);
    expect(direct.maximize).toEqual([]);
    expect(direct.defaultRawSupply).toBe("unlimited");
    expect(direct.supply).toEqual({ Desc_OreIron: 30 });

    const inverse = toSolveRequest(state({ mode: "inverse", supply: [{ item: "Desc_OreIron", rate: 60 }] }));
    expect(inverse.targets).toEqual([]);
    expect(inverse.maximize).toEqual([{ item: "Desc_IronPlateReinforced", ratio: 1 }]);
    expect(inverse.defaultRawSupply).toBe("none");
  });
});
