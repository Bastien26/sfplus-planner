import type { GameData } from "../data/types";
import type { RecipeUse, SolveResult } from "../solver/types";

export type GraphNode =
  | { id: string; kind: "recipe"; use: RecipeUse }
  | { id: string; kind: "supply" | "output" | "surplus" | "belt"; item: string; rate: number };

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  item: string;
  rate: number;
  /** Not the main product of the machine that makes it (or headed for the sink). */
  byproduct: boolean;
  fluid: boolean;
}

export interface FlowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface End {
  node: string;
  rate: number;
  byproduct: boolean;
}

const EPS = 1e-6;

/**
 * One node per recipe, raw input, delivered output and surplus. Items with several producers and several
 * consumers go through a "belt" node, so no made-up machine-to-machine split is drawn.
 */
export function buildGraph(data: GameData, result: SolveResult): FlowGraph {
  const nodes: GraphNode[] = [];
  const producers = new Map<string, End[]>();
  const consumers = new Map<string, End[]>();
  const push = (map: Map<string, End[]>, item: string, end: End) => {
    if (end.rate > EPS) map.set(item, [...(map.get(item) ?? []), end]);
  };

  for (const u of result.recipes) {
    const id = `r:${u.recipe}`;
    nodes.push({ id, kind: "recipe", use: u });
    const main = data.recipes[u.recipe].outputs[0].item;
    for (const f of u.outputs) push(producers, f.item, { node: id, rate: f.rate, byproduct: f.item !== main });
    for (const f of u.inputs) push(consumers, f.item, { node: id, rate: f.rate, byproduct: false });
  }
  for (const f of result.supplied) {
    nodes.push({ id: `in:${f.item}`, kind: "supply", item: f.item, rate: f.rate });
    push(producers, f.item, { node: `in:${f.item}`, rate: f.rate, byproduct: false });
  }
  for (const f of result.delivered) {
    if (f.rate <= EPS) continue;
    nodes.push({ id: `out:${f.item}`, kind: "output", item: f.item, rate: f.rate });
    push(consumers, f.item, { node: `out:${f.item}`, rate: f.rate, byproduct: false });
  }
  for (const f of result.surplus) {
    nodes.push({ id: `sink:${f.item}`, kind: "surplus", item: f.item, rate: f.rate });
    push(consumers, f.item, { node: `sink:${f.item}`, rate: f.rate, byproduct: true });
  }

  const edges: GraphEdge[] = [];
  const fluid = (item: string) => data.items[item]?.form !== "solid";
  const edge = (source: string, target: string, item: string, rate: number, byproduct: boolean) => {
    if (source === target || rate <= EPS) return;
    edges.push({ id: `${source}>${target}:${item}`, source, target, item, rate, byproduct, fluid: fluid(item) });
  };

  for (const [item, outs] of producers) {
    const ins = consumers.get(item) ?? [];
    if (outs.length >= 2 && ins.length >= 2) {
      const belt = `belt:${item}`;
      nodes.push({ id: belt, kind: "belt", item, rate: outs.reduce((s, o) => s + o.rate, 0) });
      for (const o of outs) edge(o.node, belt, item, o.rate, o.byproduct);
      const allByproduct = outs.every((o) => o.byproduct);
      for (const i of ins) edge(belt, i.node, item, i.rate, allByproduct || i.byproduct);
    } else if (outs.length === 1) {
      for (const i of ins) edge(outs[0].node, i.node, item, i.rate, outs[0].byproduct || i.byproduct);
    } else {
      for (const o of outs) edge(o.node, ins[0].node, item, o.rate, o.byproduct || ins[0].byproduct);
    }
  }
  return { nodes, edges };
}
