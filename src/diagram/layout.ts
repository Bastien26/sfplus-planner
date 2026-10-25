import ELK, { type ElkExtendedEdge, type ElkNode, type ElkPoint } from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import type { FlowGraph, GraphNode } from "./graph";

export const NODE_SIZE: Record<GraphNode["kind"], { width: number; height: number }> = {
  recipe: { width: 230, height: 76 },
  supply: { width: 240, height: 48 },
  output: { width: 240, height: 48 },
  surplus: { width: 240, height: 48 },
  belt: { width: 170, height: 36 },
};

const LABEL_HEIGHT = 20;
/** Rough width of a "[icon] 37,5/min" edge label. */
export const labelWidth = (text: string) => 30 + text.length * 7;

export interface Layout {
  width: number;
  height: number;
  nodes: Map<string, { x: number; y: number }>;
  edges: Map<string, { points: ElkPoint[]; label?: { x: number; y: number } }>;
}

// Layout of big chains takes about a second: keep it off the main thread.
const elk = new ELK({ workerUrl: elkWorkerUrl });

const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.spacing.nodeNodeBetweenLayers": "56",
  "elk.layered.spacing.edgeNodeBetweenLayers": "18",
  "elk.spacing.nodeNode": "36",
  "elk.spacing.edgeNode": "18",
  "elk.spacing.edgeEdge": "14",
  "elk.spacing.edgeLabel": "4",
  "elk.edgeLabels.placement": "CENTER",
  "elk.padding": "[top=20,left=20,bottom=20,right=20]",
};

export async function layoutGraph(graph: FlowGraph, labelText: (edgeId: string) => string): Promise<Layout> {
  const root: ElkNode = {
    id: "root",
    layoutOptions: OPTIONS,
    children: graph.nodes.map((n) => ({ id: n.id, ...NODE_SIZE[n.kind] })),
    edges: graph.edges.map(
      (e): ElkExtendedEdge => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
        labels: [{ id: `${e.id}:label`, text: labelText(e.id), width: labelWidth(labelText(e.id)), height: LABEL_HEIGHT }],
      }),
    ),
  };
  const res = await elk.layout(root);
  const nodes = new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  const edges = new Map<string, { points: ElkPoint[]; label?: { x: number; y: number } }>();
  for (const e of (res.edges ?? []) as ElkExtendedEdge[]) {
    const s = e.sections?.[0];
    const points = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] : [];
    const l = e.labels?.[0];
    edges.set(e.id, {
      points,
      label: l?.x !== undefined ? { x: l.x + (l.width ?? 0) / 2, y: (l.y ?? 0) + (l.height ?? 0) / 2 } : undefined,
    });
  }
  return { width: res.width ?? 0, height: res.height ?? 0, nodes, edges };
}
