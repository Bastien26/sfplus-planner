import GLPK from "glpk.js/node";
import { describe, expect, it } from "vitest";
import raw from "../src/data/sfplus.json";
import type { GameData } from "../src/data/types";
import { buildGraph } from "../src/diagram/graph";
import { standardRecipesUpToTier } from "../src/solver/recipes";
import { solve } from "../src/solver/solve";

const data = raw as GameData;

describe("schéma de la chaîne (cas 1)", async () => {
  const glpk = await GLPK();
  const recipes = [...standardRecipesUpToTier(data, 2)].filter((id) => id !== "Recipe_Smelter_Dirty_IronIngots");
  const res = await solve(data, glpk, { recipes, targets: [{ item: "Desc_IronPlateReinforced", rate: 5 }] });
  const g = buildGraph(data, res);
  const edge = (source: string, target: string) => g.edges.find((e) => e.source === source && e.target === target);

  it("un nœud par machine, ressource, sortie et surplus", () => {
    const kinds = g.nodes.map((n) => n.kind);
    expect(kinds.filter((k) => k === "recipe")).toHaveLength(9);
    expect(g.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["in:Desc_OreIron", "out:Desc_IronPlateReinforced", "sink:Desc_Gangue", "sink:Desc_CrushedTin"]),
    );
  });

  it("tapis avec leur débit", () => {
    expect(edge("in:Desc_OreIron", "r:Recipe_Crusher_CrushedSiterite")?.rate).toBeCloseTo(40, 6);
    expect(edge("r:Recipe_Smelter_IronIngot", "r:Recipe_Constructor_IronRod")?.rate).toBeCloseTo(15, 6);
    expect(edge("r:Recipe_Assembler_RIP", "out:Desc_IronPlateReinforced")?.rate).toBeCloseTo(5, 6);
  });

  it("sous-produits en pointillés : gangue et étain concassé", () => {
    expect(edge("r:Recipe_Crusher_CrushedSiterite", "sink:Desc_Gangue")?.byproduct).toBe(true);
    expect(edge("r:Recipe_Sorter_T1_Iron", "r:Recipe_Smelter_TinIngot")?.byproduct).toBe(true);
    expect(edge("r:Recipe_Sorter_T1_Iron", "r:Recipe_Smelter_IronIngot")?.byproduct).toBe(false);
  });

  it("plusieurs sources vers une seule destination : flèches directes, sans tapis commun", () => {
    const gangue = g.nodes.find((n) => n.id === "belt:Desc_Gangue");
    expect(gangue).toBeUndefined();
    const inBelt = g.edges.filter((e) => e.target === "sink:Desc_Gangue");
    expect(inBelt.reduce((s, e) => s + e.rate, 0)).toBeCloseTo(30, 6);
  });

  it("chaque objet est équilibré entre flèches entrantes et sortantes des tapis communs", async () => {
    const big = await solve(data, glpk, { recipes: [...standardRecipesUpToTier(data, 1)], targets: [{ item: "Desc_IronPlateReinforced", rate: 5 }] });
    const gb = buildGraph(data, big);
    const belts = gb.nodes.filter((n) => n.kind === "belt");
    expect(belts.length).toBeGreaterThan(0);
    for (const b of belts) {
      const inRate = gb.edges.filter((e) => e.target === b.id).reduce((s, e) => s + e.rate, 0);
      const outRate = gb.edges.filter((e) => e.source === b.id).reduce((s, e) => s + e.rate, 0);
      expect(inRate).toBeCloseTo(outRate, 6);
    }
  });
});
