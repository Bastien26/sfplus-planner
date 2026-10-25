import { useMemo } from "react";
import { data, itemName } from "../data";
import { fmtPct, fmtRate } from "../format";
import type { SolveResult } from "../solver/types";
import {
  backsUp,
  itemDistributions,
  type DistributionPlan,
  type Endpoint,
  type GroupSplit,
  type ItemDistribution,
} from "../splitters/distribution";
import type { SplitNode } from "../splitters/split";
import { ItemIcon } from "./ItemIcon";
import { orderByDepth } from "./order";

function endpointLabel(e: Endpoint): string {
  switch (e.kind) {
    case "machine": {
      const r = data.recipes[e.recipe!];
      return `${e.machines! > 1 ? `${e.machines} × ` : ""}${data.machines[r.machine].name} · ${r.name}`;
    }
    case "supply": return "Mineurs / apport";
    case "delivered": return "Sortie de l'usine";
    case "reserved": return "Machine réservée";
    case "stock": return "Stock";
    case "surplus": return "Sink / stockage (surplus)";
  }
}

function endpointTone(e: Endpoint) {
  return e.kind === "surplus" ? "text-warn" : e.kind === "machine" ? "text-fg" : "text-good";
}

function Tree({ node, item, byKey, merges }: {
  node: SplitNode;
  item: string;
  byKey: Map<string, Endpoint>;
  merges: Record<string, number>;
}) {
  if (node.kind === "out") {
    const e = byKey.get(node.dest)!;
    return (
      <li className="flex flex-wrap items-baseline gap-x-2">
        <span className="tabular-nums">{fmtRate(node.rate, item)}</span>
        <span className="text-accent">→</span>
        <span className={endpointTone(e)}>{endpointLabel(e)}</span>
        {merges[node.dest] && <span className="text-xs text-muted">(vers le merger)</span>}
      </li>
    );
  }
  return (
    <li>
      <span className="font-medium">Splitter en {node.ways}</span>{" "}
      <span className="text-xs text-muted tabular-nums">({fmtRate(node.rate, item)} → {node.ways} × {fmtRate(node.rate / node.ways, item)})</span>
      <ul className="mt-1 ml-1.5 flex flex-col gap-1 border-l border-line pl-3">
        {node.children.map((c, i) => <Tree key={i} node={c} item={item} byKey={byKey} merges={merges} />)}
      </ul>
    </li>
  );
}

function GroupLine({ g, item, byKey }: { g: GroupSplit; item: string; byKey: Map<string, Endpoint> }) {
  const e = byKey.get(g.key)!;
  const r = data.recipes[e.recipe!];
  const name = data.machines[r.machine].name;
  if (g.plan === "manifold") {
    return (
      <li>
        <b>{g.machines} {name}</b> ({r.name}) : manifold, une chaîne de {g.machines - 1} splitters avec une sortie par
        machine. {g.machines} n'est pas un produit de 2 et de 3, mais les machines s'équilibrent toutes seules en se
        remplissant ({fmtRate(g.perMachine, item)} chacune).
      </li>
    );
  }
  return (
    <li>
      <b>{g.machines} {name}</b> ({r.name}) : {g.plan.splitters} splitter{g.plan.splitters > 1 ? "s" : ""} pour{" "}
      {fmtRate(g.perMachine, item)} par machine.
    </li>
  );
}

function sourceSummary(d: ItemDistribution): string | null {
  const machines = d.sources.reduce((n, s) => n + (s.machines ?? 1), 0);
  if (machines <= 1) return null;
  const parts = d.sources.map((s) => (s.kind === "supply" ? "mineurs / apport" : endpointLabel(s)));
  return `Regroupe d'abord les sorties (${parts.join(" + ")}) sur un même tapis avec des mergers.`;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function planCounts(plan: DistributionPlan): string {
  if (plan.kind === "manifold") return `${plural(plan.splitters, "splitter")} · manifold`;
  const { splitters, mergers } = plan.plan;
  return `${plural(splitters, "splitter")}${mergers > 0 ? ` · ${plural(mergers, "merger")}` : ""}`;
}

function Manifold({ order, item, byKey }: { order: string[]; item: string; byKey: Map<string, Endpoint> }) {
  const open = !backsUp(byKey.get(order[order.length - 1])!);
  return (
    <>
      <ol className="flex flex-col gap-1">
        {order.map((key, i) => {
          const e = byKey.get(key)!;
          const last = i === order.length - 1;
          return (
            <li key={key} className="flex flex-wrap items-baseline gap-x-2">
              <span className="w-28 shrink-0 text-xs text-muted">{last ? "Bout du tapis" : `Splitter ${i + 1}`}</span>
              <span className="tabular-nums">{fmtRate(e.rate, item)}</span>
              <span className="text-accent">→</span>
              <span className={endpointTone(e)}>{endpointLabel(e)}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">
        Un tapis qui passe devant chaque destination, un splitter par machine. Les machines pleines renvoient
        l'excédent plus loin, donc chacune finit par recevoir son débit
        {open ? " ; le reste arrive au bout du tapis." : "."}
      </p>
    </>
  );
}

function ItemCard({ d }: { d: ItemDistribution }) {
  const byKey = useMemo(() => new Map(d.destinations.map((e) => [e.key, e])), [d]);
  const plan = d.plan;
  const tree = plan && plan.kind !== "manifold" ? plan.plan : null;
  const sources = sourceSummary(d);
  return (
    <details open className="rounded-md border border-line bg-bg/40 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <ItemIcon item={d.item} size={26} />
        <span className="font-semibold">{itemName(d.item)}</span>
        <span className="text-sm text-muted tabular-nums">{fmtRate(d.total, d.item)}</span>
        {plan && <span className="ml-auto text-xs text-muted">{planCounts(plan)}</span>}
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        {sources && <p className="text-xs text-muted">{sources}</p>}
        {plan?.kind === "manifold" && <Manifold order={plan.order} item={d.item} byKey={byKey} />}
        {tree && (
          <>
            {plan?.kind === "approx" && (
              <p className="text-xs text-warn">
                Ratio impossible avec des splitters 1/2 et 1/3 : montage le plus proche (écart max {fmtPct(tree.maxError)}).
              </p>
            )}
            <ul className="flex flex-col gap-1">
              <Tree node={tree.root} item={d.item} byKey={byKey} merges={tree.merges} />
            </ul>
            {Object.entries(tree.merges).map(([key, n]) => (
              <p key={key} className="text-xs">
                <span className="font-medium text-accent">Merger</span> : regroupe les {n} branches vers{" "}
                {endpointLabel(byKey.get(key)!)} ({fmtRate(byKey.get(key)!.rate, d.item)}).
              </p>
            ))}
          </>
        )}
        {d.groups.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-muted">
            {d.groups.map((g) => <GroupLine key={g.key} g={g} item={d.item} byKey={byKey} />)}
          </ul>
        )}
      </div>
    </details>
  );
}

export function SplittersPanel({ result, reserved }: { result: SolveResult; reserved: Record<string, number> }) {
  const list = useMemo(() => {
    const dist = itemDistributions(data, result, reserved);
    const rank = new Map<string, number>();
    orderByDepth(result.recipes).forEach((u, i) => u.outputs.forEach((o) => rank.has(o.item) || rank.set(o.item, i)));
    return dist.sort((a, b) => (rank.get(a.item) ?? -1) - (rank.get(b.item) ?? -1));
  }, [result, reserved]);

  if (list.length === 0) return null;
  const fluids = result.recipes.some((u) => [...u.inputs, ...u.outputs].some((f) => data.items[f.item].form !== "solid"));
  return (
    <section className="panel p-3">
      <h3 className="text-sm font-semibold tracking-wide text-accent uppercase">Répartition des tapis</h3>
      <p className="mt-1 text-xs text-muted">
        Montages avec des splitters de base (sorties égales : 2 ou 3) et des mergers, pour chaque objet envoyé à plusieurs
        endroits.
        {fluids && " Les fluides (tuyaux) ne sont pas concernés."}
      </p>
      <div className="mt-3 grid gap-2 xl:grid-cols-2">
        {list.map((d) => <ItemCard key={d.item} d={d} />)}
      </div>
      <p className="mt-2 text-xs text-muted">
        {plural(list.reduce((n, d) => n + (!d.plan ? 0 : d.plan.kind === "manifold" ? d.plan.splitters : d.plan.plan.splitters), 0), "splitter")}{" "}
        au total (hors répartition entre machines identiques).
      </p>
    </section>
  );
}
