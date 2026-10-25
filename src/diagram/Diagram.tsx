import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { data, itemName } from "../data";
import { fmtMW, fmtPct, fmtRate } from "../format";
import type { SolveResult } from "../solver/types";
import { ItemIcon, MachineIcon } from "../ui/ItemIcon";
import { buildGraph, type GraphEdge, type GraphNode } from "./graph";
import { layoutGraph, NODE_SIZE, type Layout } from "./layout";

type NodeData = { g: GraphNode };
type EdgeData = { g: GraphEdge; points: { x: number; y: number }[]; label?: { x: number; y: number } };
type FlowNode = Node<NodeData>;
type FlowEdge = Edge<EdgeData>;

const COLORS = { main: "#a3aab6", byproduct: "#f2c14e", fluid: "#62b6ff", bg: "#111318" };
const edgeColor = (e: GraphEdge) => (e.fluid ? COLORS.fluid : e.byproduct ? COLORS.byproduct : COLORS.main);

const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 };
const Handles = () => (
  <>
    <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} style={hidden} isConnectable={false} />
  </>
);

function RecipeNode({ data: { g } }: NodeProps<FlowNode>) {
  if (g.kind !== "recipe") return null;
  const u = g.use;
  const recipe = data.recipes[u.recipe];
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 shadow-lg"
      style={NODE_SIZE.recipe}
      title={`${recipe.name} (${data.machines[u.machine].name})`}
    >
      <Handles />
      <MachineIcon machine={u.machine} size={40} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold">
          {u.count} × {data.machines[u.machine].name}
        </div>
        <div className="truncate text-xs text-muted">
          {recipe.name}
          {recipe.alternate && <span className="text-warn"> · alt</span>}
        </div>
        <div className="text-xs tabular-nums">
          {fmtPct(u.clock)} · {fmtMW(u.powerMW)}
        </div>
      </div>
    </div>
  );
}

const ENDPOINT_STYLE: Record<string, { border: string; caption: string }> = {
  supply: { border: "border-accent/70", caption: "Ressource" },
  output: { border: "border-good", caption: "Sortie" },
  surplus: { border: "border-warn border-dashed", caption: "Surplus → sink / stock" },
};

function EndpointNode({ data: { g } }: NodeProps<FlowNode>) {
  if (g.kind === "recipe" || g.kind === "belt") return null;
  const style = ENDPOINT_STYLE[g.kind];
  return (
    <div className={`flex items-center gap-2 rounded-lg border-2 bg-panel px-2.5 ${style.border}`} style={NODE_SIZE[g.kind]}>
      <Handles />
      <ItemIcon item={g.item} size={30} />
      <div className="min-w-0 leading-tight">
        <div className="text-[10px] tracking-wide text-muted uppercase">{style.caption}</div>
        <div className="truncate text-sm">
          <span className="font-semibold tabular-nums">{fmtRate(g.rate, g.item)}</span> {itemName(g.item)}
        </div>
      </div>
    </div>
  );
}

function BeltNode({ data: { g } }: NodeProps<FlowNode>) {
  if (g.kind !== "belt") return null;
  return (
    <div
      className="flex items-center justify-center gap-1.5 rounded-full border border-line bg-panel-2 px-3 text-xs"
      style={NODE_SIZE.belt}
      title="Tapis commun : les sources sont regroupées puis réparties"
    >
      <Handles />
      <ItemIcon item={g.item} size={20} />
      <span className="truncate">{itemName(g.item)}</span>
      <span className="text-muted tabular-nums">{fmtRate(g.rate, g.item)}</span>
    </div>
  );
}

/** Orthogonal polyline with rounded corners. */
function roundedPath(points: { x: number; y: number }[], radius = 8): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [prev, cur, next] = [points[i - 1], points[i], points[i + 1]];
    const r = Math.min(radius, Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2, Math.hypot(next.x - cur.x, next.y - cur.y) / 2);
    const toward = (p: { x: number; y: number }) => {
      const len = Math.hypot(p.x - cur.x, p.y - cur.y) || 1;
      return { x: cur.x + ((p.x - cur.x) / len) * r, y: cur.y + ((p.y - cur.y) / len) * r };
    };
    const a = toward(prev);
    const b = toward(next);
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function FlowEdgeView({ id, data: d, markerEnd, style }: EdgeProps<FlowEdge>) {
  if (!d) return null;
  return (
    <>
      <BaseEdge id={id} path={roundedPath(d.points)} markerEnd={markerEnd} style={style} />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex items-center gap-1 rounded border border-line bg-bg px-1.5 py-px text-[11px] tabular-nums"
            style={{ transform: `translate(-50%, -50%) translate(${d.label.x}px, ${d.label.y}px)`, color: edgeColor(d.g) }}
            title={itemName(d.g.item)}
          >
            <ItemIcon item={d.g.item} size={14} />
            {fmtRate(d.g.rate, d.g.item)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { recipe: RecipeNode, supply: EndpointNode, output: EndpointNode, surplus: EndpointNode, belt: BeltNode };
const edgeTypes = { flow: FlowEdgeView };

const PNG_PADDING = 24;

export function Diagram({ result }: { result: SolveResult }) {
  const graph = useMemo(() => buildGraph(data, result), [result]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
    layoutGraph(graph, (id) => fmtRate(edgeById.get(id)!.rate, edgeById.get(id)!.item)).then((l) => {
      if (!cancelled) setLayout(l);
    });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  const { nodes, edges } = useMemo(() => {
    if (!layout) return { nodes: [] as FlowNode[], edges: [] as FlowEdge[] };
    // Sizes and handles are known up front, so nodes and edges render even before (or without) DOM measuring.
    const nodes: FlowNode[] = graph.nodes.map((g) => {
      const { width, height } = NODE_SIZE[g.kind];
      return {
        id: g.id,
        type: g.kind,
        position: layout.nodes.get(g.id) ?? { x: 0, y: 0 },
        data: { g },
        width,
        height,
        handles: [
          { type: "target", position: Position.Top, x: width / 2, y: 0, width: 1, height: 1 },
          { type: "source", position: Position.Bottom, x: width / 2, y: height, width: 1, height: 1 },
        ],
        draggable: false,
        selectable: false,
      };
    });
    const edges: FlowEdge[] = graph.edges.map((g) => {
      const l = layout.edges.get(g.id);
      const color = edgeColor(g);
      return {
        id: g.id,
        source: g.source,
        target: g.target,
        type: "flow",
        data: { g, points: l?.points ?? [], label: l?.label },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        style: { stroke: color, strokeWidth: g.byproduct ? 1.5 : 2, strokeDasharray: g.byproduct ? "6 4" : undefined },
      };
    });
    return { nodes, edges };
  }, [graph, layout]);

  const exportPng = async () => {
    const viewport = container.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport || !layout) return;
    setExporting(true);
    try {
      const width = layout.width + PNG_PADDING * 2;
      const height = layout.height + PNG_PADDING * 2;
      const url = await toPng(viewport, {
        backgroundColor: COLORS.bg,
        width,
        height,
        pixelRatio: Math.min(2, 6000 / Math.max(width, height)),
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${PNG_PADDING}px, ${PNG_PADDING}px) scale(1)` },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = "sfplus-schema.png";
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 flex flex-col bg-bg p-3" : "flex flex-col"}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-6" style={{ background: COLORS.main }} /> produit principal</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: COLORS.byproduct }} /> sous-produit</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-6" style={{ background: COLORS.fluid }} /> fluide</span>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={exportPng} disabled={!layout || exporting}>{exporting ? "Export…" : "Exporter en PNG"}</button>
          <button className="btn" onClick={() => setFullscreen((f) => !f)}>{fullscreen ? "Fermer" : "Plein écran"}</button>
        </div>
      </div>
      <div ref={container} className={`rounded-lg border border-line ${fullscreen ? "flex-1" : "h-[70vh] min-h-96"}`}>
        {layout ? (
          <ReactFlow
            key={`${graph.nodes.length}:${layout.width}:${layout.height}:${fullscreen}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.05}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            style={{ background: COLORS.bg }}
          >
            <Background gap={24} color="#232730" />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <p className="p-4 text-sm text-muted">Mise en page…</p>
        )}
      </div>
    </div>
  );
}
