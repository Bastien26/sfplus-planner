import type { GameData } from "../data/types";
import type { SolveResult } from "../solver/types";
import { isSplittable, planSplit, type SplitPlan } from "./split";

export type EndpointKind = "machine" | "supply" | "delivered" | "reserved" | "stock" | "surplus";

export interface Endpoint {
  key: string;
  kind: EndpointKind;
  rate: number;
  /** Machine groups: recipe id and number of identical machines. */
  recipe?: string;
  machines?: number;
}

/** Machines back up when full, so a splitter sends their share onward; sinks, stock and factory outputs never do. */
export const backsUp = (e: Endpoint) => e.kind === "machine" || e.kind === "reserved";

export type DistributionPlan =
  /** Exact tree of splitters (and mergers): right from the start, whatever backs up or not. */
  | { kind: "tree"; plan: SplitPlan }
  /**
   * Chain of 2-way splitters, one output per destination, in this order; the last destination takes the end
   * of the belt. Works because full machines push their excess further down the line.
   */
  | { kind: "manifold"; order: string[]; splitters: number }
  /** No exact tree exists and a manifold cannot work: closest tree. */
  | { kind: "approx"; plan: SplitPlan };

export interface GroupSplit {
  key: string;
  machines: number;
  perMachine: number;
  /** Exact equal split (n = 2^a·3^b), or a manifold that balances once machines fill up. */
  plan: SplitPlan | "manifold";
}

export interface ItemDistribution {
  item: string;
  total: number;
  sources: Endpoint[];
  destinations: Endpoint[];
  /** How to split the merged belt between destinations; null when everything goes to one place. */
  plan: DistributionPlan | null;
  groups: GroupSplit[];
}

const EPS = 1e-6;

const treeCost = (p: SplitPlan) => p.splitters + p.mergers;

/** Manifold order (biggest machines first, the open output last), or null if a machine would get less than its rate. */
function manifoldOrder(dests: Endpoint[]): string[] | null {
  const open = dests.filter((d) => !backsUp(d));
  if (open.length > 1) return null;
  const machines = dests.filter(backsUp).sort((a, b) => b.rate - a.rate);
  if (open.length === 0) return machines.map((d) => d.key);
  let remaining = dests.reduce((s, d) => s + d.rate, 0);
  for (const m of machines) {
    if (m.rate > remaining / 2 + EPS) return null;
    remaining -= m.rate;
  }
  return [...machines.map((d) => d.key), open[0].key];
}

export function planDistribution(dests: Endpoint[]): DistributionPlan | null {
  if (dests.length < 2) return null;
  const total = dests.reduce((s, d) => s + d.rate, 0);
  const tree = planSplit(total, dests.map((d) => ({ key: d.key, rate: d.rate })));
  const order = manifoldOrder(dests);
  if (tree.exact && (!order || treeCost(tree) <= order.length - 1)) return { kind: "tree", plan: tree };
  if (order) return { kind: "manifold", order, splitters: order.length - 1 };
  return { kind: tree.exact ? "tree" : "approx", plan: tree };
}

export function itemDistributions(
  data: GameData,
  result: SolveResult,
  reserved: Record<string, number> = {},
): ItemDistribution[] {
  const sources = new Map<string, Endpoint[]>();
  const dests = new Map<string, Endpoint[]>();
  const add = (map: Map<string, Endpoint[]>, item: string, e: Endpoint) => {
    if (e.rate > EPS) map.set(item, [...(map.get(item) ?? []), e]);
  };

  for (const u of result.recipes) {
    for (const f of u.outputs) add(sources, f.item, { key: `src:${u.recipe}`, kind: "machine", rate: f.rate, recipe: u.recipe, machines: u.count });
    for (const f of u.inputs) add(dests, f.item, { key: `dst:${u.recipe}`, kind: "machine", rate: f.rate, recipe: u.recipe, machines: u.count });
  }
  for (const f of result.supplied) add(sources, f.item, { key: "supply", kind: "supply", rate: f.rate });
  for (const f of result.delivered) {
    const r = reserved[f.item];
    if (r !== undefined && r > EPS && r < f.rate - EPS) {
      add(dests, f.item, { key: "reserved", kind: "reserved", rate: r });
      add(dests, f.item, { key: "stock", kind: "stock", rate: f.rate - r });
    } else {
      add(dests, f.item, { key: "delivered", kind: "delivered", rate: f.rate });
    }
  }
  for (const f of result.surplus) add(dests, f.item, { key: "surplus", kind: "surplus", rate: f.rate });

  const out: ItemDistribution[] = [];
  for (const [item, list] of dests) {
    if (data.items[item]?.form !== "solid") continue;
    const groups: GroupSplit[] = list
      .filter((d) => (d.machines ?? 1) > 1)
      .map((d) => {
        const n = d.machines!;
        const plan = isSplittable(n)
          ? planSplit(d.rate, Array.from({ length: n }, (_, i) => ({ key: `${d.key}#${i + 1}`, rate: d.rate / n })))
          : ("manifold" as const);
        return { key: d.key, machines: n, perMachine: d.rate / n, plan };
      });
    if (list.length < 2 && groups.length === 0) continue;
    out.push({
      item,
      total: list.reduce((s, d) => s + d.rate, 0),
      sources: sources.get(item) ?? [],
      destinations: list,
      plan: planDistribution(list),
      groups,
    });
  }
  return out;
}
