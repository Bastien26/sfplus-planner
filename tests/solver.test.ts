import GLPK from "glpk.js/node";
import { beforeAll, describe, expect, it } from "vitest";
import raw from "../src/data/sfplus.json";
import type { GameData } from "../src/data/types";
import { standardRecipesUpToTier } from "../src/solver/recipes";
import { solve, type Glpk } from "../src/solver/solve";
import type { SolveRequest, SolveResult } from "../src/solver/types";

const data = raw as GameData;
const RIP = "Desc_IronPlateReinforced";
const ORE = "Desc_OreIron";
const IMPURE_IRON = "Recipe_Smelter_Dirty_IronIngots";

// The test cases use what is unlocked early in a survival game: Hub upgrades, game start and milestones T1–T2.
const early = [...standardRecipesUpToTier(data, 2)];
const earlyNoImpure = early.filter((id) => id !== IMPURE_IRON);

let glpk: Glpk;
beforeAll(async () => {
  glpk = await GLPK();
});

const run = (req: SolveRequest) => solve(data, glpk, req);
const rate = (flows: { item: string; rate: number }[], item: string) => flows.find((f) => f.item === item)?.rate ?? 0;
const asMap = (flows: { item: string; rate: number }[]) => Object.fromEntries(flows.map((f) => [f.item, f.rate]));
const use = (res: SolveResult, recipe: string) => {
  const u = res.recipes.find((x) => x.recipe === recipe);
  expect(u, `recette ${recipe} non utilisée`).toBeDefined();
  return u!;
};

/** For every item: produced − consumed + supplied − surplus = delivered. */
function expectBalanced(res: SolveResult) {
  const net = new Map<string, number>();
  const add = (item: string, v: number) => net.set(item, (net.get(item) ?? 0) + v);
  for (const u of res.recipes) {
    for (const f of u.outputs) add(f.item, f.rate);
    for (const f of u.inputs) add(f.item, -f.rate);
  }
  for (const f of res.supplied) add(f.item, f.rate);
  for (const f of res.surplus) add(f.item, -f.rate);
  for (const f of res.delivered) add(f.item, -f.rate);
  for (const [item, v] of net) expect(Math.abs(v), `bilan ${item}`).toBeLessThan(1e-3);
}

function expectClock(res: SolveResult, recipe: string, count: number, clock: number) {
  const u = use(res, recipe);
  expect(u.count).toBe(count);
  expect(u.clock).toBeCloseTo(clock, 3);
}

describe("cas 1 : 5 Reinforced Iron Plate/min, recettes standard, sans Impure Iron Ingot", () => {
  let res: SolveResult;
  beforeAll(async () => {
    res = await run({ recipes: earlyNoImpure, targets: [{ item: RIP, rate: 5 }] });
  });

  it("40 sitérite/min", () => {
    expect(res.status).toBe("ok");
    expect(asMap(res.supplied)).toEqual({ [ORE]: 40 });
    expect(asMap(res.delivered)).toEqual({ [RIP]: 5 });
  });

  it("machines et horloges", () => {
    expectClock(res, "Recipe_Crusher_CrushedSiterite", 1, 2 / 3);
    expectClock(res, "Recipe_Sorter_T1_Iron", 1, 1 / 3);
    expectClock(res, "Recipe_Smelter_IronIngot", 1, 1);
    expectClock(res, "Recipe_Smelter_TinIngot", 1, 1);
    expectClock(res, "Recipe_IronPlate", 1, 0.5);
    expectClock(res, "Recipe_Constructor_IronRod", 1, 1);
    expectClock(res, "Recipe_Constructor_IronScrew", 1, 0.75);
    expectClock(res, "Recipe_Assembler_TinPlates", 1, 0.5);
    expectClock(res, "Recipe_Assembler_RIP", 1, 1);
    expect(res.recipes).toHaveLength(9);
  });

  it("surplus : 30 gangue + 5 étain concassé", () => {
    expect(asMap(res.surplus)).toEqual({ Desc_Gangue: 30, Desc_CrushedTin: 5 });
    expectBalanced(res);
  });

  it("énergie = somme des machines (P × horloge^exposant)", () => {
    const sorter = use(res, "Recipe_Sorter_T1_Iron");
    expect(sorter.powerMW).toBeCloseTo(15 * Math.pow(1 / 3, 1.6), 4);
    expect(res.powerMW).toBeCloseTo(res.recipes.reduce((s, u) => s + u.powerMW, 0), 4);
  });
});

describe("cas 2 : 60 sitérite/min, maximiser, Impure Iron Ingot autorisé", () => {
  let res: SolveResult;
  beforeAll(async () => {
    res = await run({ recipes: early, maximize: [{ item: RIP }], supply: { [ORE]: 60 }, defaultRawSupply: "none" });
  });

  it("8 Reinforced Iron Plate/min", () => {
    expect(res.status).toBe("ok");
    expect(res.scale).toBeCloseTo(8, 6);
    expect(rate(res.delivered, RIP)).toBeCloseTo(8, 6);
    expect(rate(res.supplied, ORE)).toBeCloseTo(60, 6);
  });

  it("48 lingots de fer et 24 lingots d'étain", () => {
    const made = (item: string) =>
      res.recipes.flatMap((u) => u.outputs).filter((f) => f.item === item).reduce((s, f) => s + f.rate, 0);
    expect(made("Desc_IronIngot")).toBeCloseTo(48, 4);
    expect(made("Desc_TinIngot")).toBeCloseTo(24, 4);
    use(res, IMPURE_IRON);
  });

  it("seul surplus : 41 gangue", () => {
    expect(asMap(res.surplus)).toEqual({ Desc_Gangue: 41 });
    expectBalanced(res);
  });

  it("horloge ≤ 100 %", () => {
    for (const u of res.recipes) expect(u.clock).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("cas 3 : 60 sitérite/min, maximiser, sans Impure Iron Ingot", () => {
  let res: SolveResult;
  beforeAll(async () => {
    res = await run({ recipes: earlyNoImpure, maximize: [{ item: RIP }], supply: { [ORE]: 60 }, defaultRawSupply: "none" });
  });

  it("7,5 Reinforced Iron Plate/min", () => {
    expect(res.status).toBe("ok");
    expect(rate(res.delivered, RIP)).toBeCloseTo(7.5, 6);
  });

  it("surplus : 45 gangue + 7,5 étain concassé", () => {
    expect(asMap(res.surplus)).toEqual({ Desc_Gangue: 45, Desc_CrushedTin: 7.5 });
    expectBalanced(res);
  });
});

describe("options", () => {
  it("tout à 100 % : nombres entiers de machines, horloge exacte, l'excédent part en surplus", async () => {
    const res = await run({ recipes: earlyNoImpure, targets: [{ item: RIP, rate: 5 }], allAt100: true });
    expect(res.status).toBe("ok");
    for (const u of res.recipes) {
      expect(Number.isInteger(u.amount)).toBe(true);
      expect(u.clock).toBe(1);
    }
    expect(rate(res.delivered, RIP)).toBe(5);
    expect(res.surplus.length).toBeGreaterThan(2);
    expectBalanced(res);
  });

  it("overclock 250 % : moins de machines, puissance P × horloge^exposant", async () => {
    const res = await run({ recipes: earlyNoImpure, targets: [{ item: RIP, rate: 10 }], maxClock: 2.5 });
    const assembler = use(res, "Recipe_Assembler_RIP");
    expect(assembler.count).toBe(1);
    expect(assembler.clock).toBeCloseTo(2, 6);
    expect(assembler.powerMW).toBeCloseTo(15 * Math.pow(2, data.machines.Build_AssemblerMk1.powerExponent), 3);
    expectBalanced(res);
  });

  it("sans overclock, la même demande prend 2 machines à 100 %", async () => {
    const res = await run({ recipes: earlyNoImpure, targets: [{ item: RIP, rate: 10 }] });
    expectClock(res, "Recipe_Assembler_RIP", 2, 1);
  });

  it("utilise d'abord un objet intermédiaire fourni (lingots dispo)", async () => {
    const res = await run({ recipes: earlyNoImpure, targets: [{ item: "Desc_IronPlate", rate: 20 }], supply: { Desc_IronIngot: 30 } });
    expect(asMap(res.supplied)).toEqual({ Desc_IronIngot: 30 });
    expect(res.recipes.map((u) => u.recipe)).toEqual(["Recipe_IronPlate"]);
  });

  it("impossible : aucune recette ni ressource", async () => {
    const res = await run({ recipes: [], targets: [{ item: RIP, rate: 5 }] });
    expect(res.status).toBe("infeasible");
    expect(res.message).toContain("Reinforced Iron Plate");
  });

  it("mode inverse sans limite : signalé comme illimité", async () => {
    const res = await run({ recipes: early, maximize: [{ item: RIP }] });
    expect(res.status).toBe("unbounded");
  });
});
