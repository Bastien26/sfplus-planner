import type { LP, Options, Result } from "glpk.js";
import type { GameData, Recipe } from "../data/types";
import type { Flow, RecipeUse, SolveRequest, SolveResult } from "./types";

/** The parts of a glpk.js instance we use; works with both the Node (sync) and browser (async) builds. */
export interface Glpk {
  readonly GLP_MIN: number;
  readonly GLP_MAX: number;
  readonly GLP_LO: number;
  readonly GLP_UP: number;
  readonly GLP_DB: number;
  readonly GLP_FX: number;
  readonly GLP_MSG_OFF: number;
  readonly GLP_OPT: number;
  readonly GLP_FEAS: number;
  solve(lp: LP, options?: Options): Result | Promise<Result>;
}

type Term = { name: string; coef: number };

const EPS = 1e-8;
const REL_TOL = 1e-8;
/** Upper bound on the inverse-mode scale, used to detect unbounded problems. */
const MAX_SCALE = 1e7;
const CHEAP_INPUTS: Record<string, number> = { Desc_Water: 0.1, Desc_Air: 0.1 };
/**
 * Tie-break weight per unit of surplus (and of free supply) in the last stage. Kept far below
 * machine power so the solver never builds machines just to turn waste into fewer units.
 */
const TIE_BREAK = 1e-4;

export const perMinute = (recipe: Recipe, amount: number) => (amount * 60) / recipe.duration;
const clean = (n: number) => (Math.abs(n) < 1e-6 ? 0 : Math.round(n * 1e5) / 1e5);

/** Enabled recipes that can contribute to the wanted items (backward closure through ingredients). */
function relevantRecipes(data: GameData, enabled: Set<string>, wanted: string[]): Recipe[] {
  const producers = new Map<string, Recipe[]>();
  for (const id of enabled) {
    const r = data.recipes[id];
    if (!r) continue;
    for (const o of r.outputs) producers.set(o.item, [...(producers.get(o.item) ?? []), r]);
  }
  const seenItems = new Set<string>();
  const picked = new Map<string, Recipe>();
  const queue = [...wanted];
  while (queue.length) {
    const item = queue.pop()!;
    if (seenItems.has(item)) continue;
    seenItems.add(item);
    for (const r of producers.get(item) ?? []) {
      if (picked.has(r.id)) continue;
      picked.set(r.id, r);
      for (const i of r.inputs) queue.push(i.item);
    }
  }
  return [...picked.values()];
}

/** Items reachable from the supply through the given recipes. */
function producibleItems(recipes: Recipe[], supplied: Set<string>): Set<string> {
  const ok = new Set(supplied);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of recipes) {
      if (r.inputs.every((i) => ok.has(i.item))) {
        for (const o of r.outputs) if (!ok.has(o.item)) { ok.add(o.item); changed = true; }
      }
    }
  }
  return ok;
}

function missingInputs(recipes: Recipe[], supplied: Set<string>, item: string, data: GameData): string[] {
  const produced = new Set(recipes.flatMap((r) => r.outputs.map((o) => o.item)));
  const consumed = new Set(recipes.flatMap((r) => r.inputs.map((i) => i.item)));
  const missing = [...consumed, item].filter((i) => !produced.has(i) && !supplied.has(i));
  return [...new Set(missing)].map((i) => data.items[i]?.name ?? i);
}

const failure = (status: SolveResult["status"], message: string): SolveResult => ({
  status, message, scale: 0, recipes: [], supplied: [], delivered: [], surplus: [], powerMW: 0,
});

export async function solve(data: GameData, glpk: Glpk, req: SolveRequest): Promise<SolveResult> {
  const targets = (req.targets ?? []).filter((t) => t.rate > 0);
  const maximize = (req.maximize ?? []).map((m) => ({ item: m.item, ratio: m.ratio ?? 1 })).filter((m) => m.ratio > 0);
  const inverse = maximize.length > 0;
  if (targets.length === 0 && !inverse) return failure("error", "Aucun objet demandé.");

  const wanted = [...new Set([...targets.map((t) => t.item), ...maximize.map((m) => m.item)])];
  for (const item of wanted) if (!data.items[item]) return failure("error", `Objet inconnu : ${item}`);

  const enabled = new Set(req.recipes);
  const recipes = relevantRecipes(data, enabled, wanted);

  // Supply: explicit entries, plus raw resources depending on the default policy.
  const supplyLimit = new Map<string, number | null>();
  const allItems = new Set<string>(wanted);
  for (const r of recipes) for (const s of [...r.inputs, ...r.outputs]) allItems.add(s.item);
  if ((req.defaultRawSupply ?? "unlimited") === "unlimited") {
    for (const item of allItems) if (data.items[item]?.raw) supplyLimit.set(item, null);
  }
  for (const [item, limit] of Object.entries(req.supply ?? {})) {
    if (limit === null || limit > 0) supplyLimit.set(item, limit);
    else supplyLimit.delete(item);
    allItems.add(item);
  }

  const producible = producibleItems(recipes, new Set(supplyLimit.keys()));
  for (const item of wanted) {
    if (!producible.has(item)) {
      const missing = missingInputs(recipes, new Set(supplyLimit.keys()), item, data);
      return failure(
        "infeasible",
        `Impossible de produire ${data.items[item].name} avec les recettes et ressources choisies.` +
          (missing.length ? ` Il manque : ${missing.join(", ")}.` : ""),
      );
    }
  }

  // Variables: x<i> recipe machine-equivalents, s<j> supply, e<j> surplus, k scale.
  const items = [...allItems];
  const itemIndex = new Map(items.map((item, j) => [item, j]));
  const rows = new Map<string, Map<string, number>>(items.map((item) => [item, new Map()]));
  const add = (item: string, name: string, coef: number) => {
    const row = rows.get(item)!;
    row.set(name, (row.get(name) ?? 0) + coef);
  };
  recipes.forEach((r, i) => {
    for (const s of r.inputs) add(s.item, `x${i}`, -perMinute(r, s.amount));
    for (const s of r.outputs) add(s.item, `x${i}`, perMinute(r, s.amount));
  });
  for (const [item, j] of itemIndex) {
    if (supplyLimit.has(item)) add(item, `s${j}`, 1);
    add(item, `e${j}`, -1);
  }
  for (const m of maximize) add(m.item, "k", -m.ratio);

  const demand = new Map<string, number>();
  for (const t of targets) demand.set(t.item, (demand.get(t.item) ?? 0) + t.rate);

  const subjectTo: LP["subjectTo"] = items.map((item) => {
    const d = demand.get(item) ?? 0;
    const vars = [...rows.get(item)!].filter(([, coef]) => coef !== 0).map(([name, coef]) => ({ name, coef }));
    return { name: `bal_${itemIndex.get(item)}`, vars, bnds: { type: glpk.GLP_FX, lb: d, ub: d } };
  });
  const bounds: NonNullable<LP["bounds"]> = [];
  for (const [item, limit] of supplyLimit) {
    if (limit !== null) bounds.push({ name: `s${itemIndex.get(item)}`, type: glpk.GLP_DB, lb: 0, ub: limit });
  }
  if (inverse) bounds.push({ name: "k", type: glpk.GLP_DB, lb: 0, ub: MAX_SCALE });

  const weight = (item: string) =>
    req.weights?.[item] ?? (data.items[item]?.raw ? (CHEAP_INPUTS[item] ?? 1) : 0);
  // Lexicographic objectives: [max production], then min resources, then min power (+ tiny surplus tie-break).
  const stages: { direction: number; vars: Term[]; label: string }[] = [];
  if (inverse) stages.push({ direction: glpk.GLP_MAX, vars: [{ name: "k", coef: 1 }], label: "production maximale" });
  stages.push({
    direction: glpk.GLP_MIN,
    vars: [...supplyLimit.keys()].map((item) => ({ name: `s${itemIndex.get(item)}`, coef: weight(item) })).filter((t) => t.coef > 0),
    label: "ressources",
  });
  stages.push({
    direction: glpk.GLP_MIN,
    vars: [
      ...recipes.map((r, i) => ({ name: `x${i}`, coef: Math.max(r.powerMW, 0.01) })),
      ...items.map((_, j) => ({ name: `e${j}`, coef: TIE_BREAK })),
      ...[...supplyLimit.keys()].filter((item) => weight(item) === 0).map((item) => ({ name: `s${itemIndex.get(item)}`, coef: TIE_BREAK })),
    ],
    label: "énergie",
  });

  const generals = req.allAt100 ? recipes.map((_, i) => `x${i}`) : undefined;
  let values: Record<string, number> = {};
  for (const [n, stage] of stages.entries()) {
    if (stage.vars.length === 0) continue;
    const lp: LP = {
      name: "sfplus",
      objective: { direction: stage.direction, name: "obj", vars: stage.vars },
      subjectTo,
      bounds,
      ...(generals ? { generals } : {}),
    };
    // Presolve hides infeasible/unbounded statuses for LPs; MILPs need it in glpk.js.
    const res = await glpk.solve(lp, { msglev: glpk.GLP_MSG_OFF, presol: !!generals, tmlim: 20 });
    const { status, z, vars } = res.result;
    if (status !== glpk.GLP_OPT && status !== glpk.GLP_FEAS) {
      const capped = [...supplyLimit.values()].some((l) => l !== null);
      return failure(
        "infeasible",
        capped
          ? "Pas assez de ressources disponibles pour cette demande : augmente les quantités, ou passe en mode « Maximiser »."
          : `Aucune solution (étape « ${stage.label} », statut GLPK ${status}).`,
      );
    }
    if (inverse && n === 0 && z >= MAX_SCALE * 0.999) {
      return failure("unbounded", "Production illimitée : limite au moins une des ressources utilisées.");
    }
    values = vars;
    const slack = Math.abs(z) * REL_TOL + EPS;
    subjectTo.push({
      name: `stage${n}`,
      vars: stage.vars,
      bnds: stage.direction === glpk.GLP_MAX
        ? { type: glpk.GLP_LO, lb: z - slack, ub: 0 }
        : { type: glpk.GLP_UP, lb: 0, ub: z + slack },
    });
  }

  return buildResult(data, req, recipes, items, supplyLimit, values, targets, maximize);
}

function buildResult(
  data: GameData,
  req: SolveRequest,
  recipes: Recipe[],
  items: string[],
  supplyLimit: Map<string, number | null>,
  values: Record<string, number>,
  targets: Flow[],
  maximize: { item: string; ratio: number }[],
): SolveResult {
  const scale = maximize.length ? clean(values.k ?? 0) : 0;
  const maxClock = req.maxClock ?? 1;

  const uses: RecipeUse[] = [];
  recipes.forEach((r, i) => {
    const amount = values[`x${i}`] ?? 0;
    if (clean(amount) <= 0) return;
    const machine = data.machines[r.machine];
    const fixedClock = !machine.canChangeClock;
    const limit = fixedClock || req.allAt100 ? 1 : maxClock;
    const count = req.allAt100 ? Math.round(amount) : Math.max(1, Math.ceil(amount / limit - 1e-6));
    const clock = amount / count;
    uses.push({
      recipe: r.id,
      machine: r.machine,
      amount: clean(amount),
      count,
      clock: clean(clock),
      fixedClock,
      powerMW: clean(count * r.powerMW * Math.pow(clock, machine.powerExponent)),
      inputs: r.inputs.map((s) => ({ item: s.item, rate: clean(perMinute(r, s.amount) * amount) })),
      outputs: r.outputs.map((s) => ({ item: s.item, rate: clean(perMinute(r, s.amount) * amount) })),
    });
  });

  const flows = (prefix: string) =>
    items
      .map((item, j) => ({ item, rate: clean(values[`${prefix}${j}`] ?? 0) }))
      .filter((f) => f.rate > 0)
      .sort((a, b) => b.rate - a.rate);

  const delivered = new Map<string, number>();
  for (const t of targets) delivered.set(t.item, (delivered.get(t.item) ?? 0) + t.rate);
  for (const m of maximize) delivered.set(m.item, (delivered.get(m.item) ?? 0) + m.ratio * scale);

  return {
    status: "ok",
    scale,
    recipes: uses,
    supplied: flows("s").filter((f) => supplyLimit.has(f.item)),
    delivered: [...delivered].map(([item, rate]) => ({ item, rate: clean(rate) })),
    surplus: flows("e"),
    powerMW: clean(uses.reduce((sum, u) => sum + u.powerMW, 0)),
  };
}
