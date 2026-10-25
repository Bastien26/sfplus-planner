import GLPK from "glpk.js/node";
import { describe, expect, it } from "vitest";
import raw from "../src/data/sfplus.json";
import type { GameData } from "../src/data/types";
import { standardRecipesUpToTier } from "../src/solver/recipes";
import { solve } from "../src/solver/solve";
import { itemDistributions, planDistribution, type Endpoint } from "../src/splitters/distribution";
import { planSplit, type SplitNode } from "../src/splitters/split";

const data = raw as GameData;

/** Sum of the leaf rates per destination. */
function leafRates(node: SplitNode, acc: Record<string, number> = {}) {
  if (node.kind === "out") acc[node.dest] = (acc[node.dest] ?? 0) + node.rate;
  else node.children.forEach((c) => leafRates(c, acc));
  return acc;
}

describe("montage des splitters", () => {
  it("exemple : étain concassé 30/min → 15 fonderie A, 7,5 fonderie B, 7,5 sink", () => {
    const plan = planSplit(30, [
      { key: "A", rate: 15 },
      { key: "B", rate: 7.5 },
      { key: "sink", rate: 7.5 },
    ]);
    expect(plan.exact).toBe(true);
    expect(plan.splitters).toBe(2);
    expect(plan.mergers).toBe(0);
    expect(plan.root).toEqual({
      kind: "split",
      ways: 2,
      rate: 30,
      children: [
        { kind: "out", dest: "A", rate: 15 },
        { kind: "split", ways: 2, rate: 15, children: [{ kind: "out", dest: "B", rate: 7.5 }, { kind: "out", dest: "sink", rate: 7.5 }] },
      ],
    });
  });

  it("3/4 + 1/4 : deux splitters et un merger pour regrouper les 3/4", () => {
    const plan = planSplit(20, [{ key: "fonderie", rate: 15 }, { key: "sink", rate: 5 }]);
    expect(plan.exact).toBe(true);
    expect(plan.splitters).toBe(2);
    expect(plan.merges).toEqual({ fonderie: 2 });
    expect(plan.mergers).toBe(1);
    expect(leafRates(plan.root)).toEqual({ fonderie: 15, sink: 5 });
  });

  it("1/3 + 2/3 : un splitter en 3 et un merger", () => {
    const plan = planSplit(30, [{ key: "a", rate: 10 }, { key: "b", rate: 20 }]);
    expect(plan.root).toMatchObject({ kind: "split", ways: 3 });
    expect(plan.splitters).toBe(1);
    expect(plan.mergers).toBe(1);
  });

  it("moitié-moitié : un seul splitter", () => {
    const plan = planSplit(30, [{ key: "a", rate: 15 }, { key: "b", rate: 15 }]);
    expect(plan.splitters).toBe(1);
    expect(plan.mergers).toBe(0);
  });

  it("6 parts égales : 3 splitters (1 en 2 puis 2 en 3, ou l'inverse)", () => {
    const plan = planSplit(60, Array.from({ length: 6 }, (_, i) => ({ key: `m${i}`, rate: 10 })));
    expect(plan.exact).toBe(true);
    expect(plan.splitters).toBe(3);
    expect(plan.mergers).toBe(0);
  });

  it("ratio impossible (1/5) : montage approché, écart signalé", () => {
    const plan = planSplit(50, [{ key: "a", rate: 10 }, { key: "b", rate: 40 }]);
    expect(plan.exact).toBe(false);
    expect(plan.maxError).toBeGreaterThan(0);
    expect(plan.maxError).toBeLessThan(0.05);
    const rates = leafRates(plan.root);
    expect(rates.a + rates.b).toBeCloseTo(50, 6);
  });

  it("les débits des feuilles font toujours le total", () => {
    const plan = planSplit(48, [{ key: "a", rate: 18 }, { key: "b", rate: 12 }, { key: "c", rate: 12 }, { key: "d", rate: 6 }]);
    expect(plan.exact).toBe(true);
    expect(leafRates(plan.root)).toEqual({ a: 18, b: 12, c: 12, d: 6 });
  });
});

describe("choix du montage (arbre exact ou manifold)", () => {
  const machine = (key: string, rate: number): Endpoint => ({ key, kind: "machine", rate });

  it("que des machines, ratio impossible (4/5 – 1/5) : manifold d'un seul splitter", () => {
    const plan = planDistribution([machine("sorter", 30), machine("smelter", 7.5)]);
    expect(plan).toEqual({ kind: "manifold", order: ["sorter", "smelter"], splitters: 1 });
  });

  it("ton exemple avec un sink : l'arbre exact (2 splitters)", () => {
    const plan = planDistribution([machine("A", 15), machine("B", 7.5), { key: "sink", kind: "surplus", rate: 7.5 }]);
    expect(plan?.kind).toBe("tree");
    if (plan?.kind === "tree") expect(plan.plan.splitters).toBe(2);
  });

  it("une machine + sink en 1/5 : manifold, le sink en bout de chaîne", () => {
    const plan = planDistribution([machine("m", 10), { key: "sink", kind: "surplus", rate: 40 }]);
    expect(plan).toEqual({ kind: "manifold", order: ["m", "sink"], splitters: 1 });
  });

  it("une machine qui veut plus de la moitié avant un sink : arbre exact avec merger", () => {
    const plan = planDistribution([machine("m", 15), { key: "sink", kind: "surplus", rate: 5 }]);
    expect(plan?.kind).toBe("tree");
    if (plan?.kind === "tree") expect(plan.plan.mergers).toBe(1);
  });

  it("5 réservés sur 7,5 + 2,5 en stock : splitter en 3 et merger", () => {
    const plan = planDistribution([{ key: "reserved", kind: "reserved", rate: 5 }, { key: "stock", kind: "stock", rate: 2.5 }]);
    expect(plan?.kind).toBe("tree");
    if (plan?.kind === "tree") expect(plan.plan.root).toMatchObject({ kind: "split", ways: 3 });
  });

  it("deux sorties ouvertes et ratio impossible : montage approché", () => {
    const plan = planDistribution([{ key: "out", kind: "delivered", rate: 10 }, { key: "sink", kind: "surplus", rate: 40 }]);
    expect(plan?.kind).toBe("approx");
  });
});

describe("répartitions d'une vraie chaîne (cas 1)", async () => {
  const glpk = await GLPK();
  const recipes = [...standardRecipesUpToTier(data, 2)].filter((id) => id !== "Recipe_Smelter_Dirty_IronIngots");
  const res = await solve(data, glpk, { recipes, targets: [{ item: "Desc_IronPlateReinforced", rate: 5 }] });
  const dist = itemDistributions(data, res);
  const of = (item: string) => dist.find((d) => d.item === item);

  it("lingots de fer : 30/min partagés en deux (Iron Rod / Iron Plate)", () => {
    const d = of("Desc_IronIngot")!;
    expect(d.total).toBeCloseTo(30, 6);
    expect(d.plan?.kind).toBe("tree");
    if (d.plan?.kind === "tree") expect(d.plan.plan.splitters).toBe(1);
  });

  it("étain concassé : 15 vers la fonderie, 5 au sink", () => {
    const d = of("Desc_CrushedTin")!;
    expect(d.destinations.map((x) => [x.kind, x.rate])).toEqual(expect.arrayContaining([["machine", 15], ["surplus", 5]]));
    expect(d.plan?.kind).toBe("tree");
    if (d.plan?.kind === "tree") expect(d.plan.plan.mergers).toBe(1);
  });

  it("un objet qui va à une seule machine n'a pas besoin de splitter", () => {
    expect(of("Desc_CrushedIron")).toBeUndefined();
  });

  it("plusieurs machines identiques : répartition égale ou manifold", async () => {
    const big = await solve(data, glpk, { recipes, targets: [{ item: "Desc_IronPlate", rate: 100 }] });
    const d = itemDistributions(data, big).find((x) => x.item === "Desc_IronIngot")!;
    const group = d.groups.find((g) => g.machines === 5)!;
    expect(group.plan).toBe("manifold");
    expect(group.perMachine).toBeCloseTo(30, 6);
  });
});
