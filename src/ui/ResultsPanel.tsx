import { lazy, Suspense, useState } from "react";
import { data, isFluid, itemName, mainProduct, recipesByMainProduct } from "../data";
import { fmt, fmtMW, fmtPct, fmtRate } from "../format";
import type { RecipeUse, SolveResult } from "../solver/types";
import { isRecipeEnabled, type PlannerState } from "../state";
import { ItemIcon, MachineIcon } from "./ItemIcon";
import { orderByDepth } from "./order";
import { SplittersPanel } from "./SplittersPanel";

const Diagram = lazy(() => import("../diagram/Diagram").then((m) => ({ default: m.Diagram })));

type Update = (fn: (s: PlannerState) => PlannerState) => void;

function FlowChip({ item, rate, dim }: { item: string; rate: number; dim?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${dim ? "text-muted" : ""}`} title={itemName(item)}>
      <ItemIcon item={item} size={20} />
      <span className={`tabular-nums ${isFluid(item) ? "text-fluid" : ""}`}>{fmtRate(rate, item)}</span>
      <span className="max-w-40 truncate text-xs text-muted">{itemName(item)}</span>
    </span>
  );
}

function FlowCard({ title, flows, tone, empty, extra }: {
  title: string;
  flows: { item: string; rate: number }[];
  tone: string;
  empty: string;
  extra?: (f: { item: string; rate: number }) => React.ReactNode;
}) {
  return (
    <section className="panel p-3">
      <h3 className={`text-sm font-semibold tracking-wide uppercase ${tone}`}>{title}</h3>
      {flows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {flows.map((f) => (
            <li key={f.item} className="flex items-center gap-2 text-sm">
              <ItemIcon item={f.item} size={24} />
              <span className="min-w-0 flex-1 truncate">{itemName(f.item)}</span>
              <span className={`font-semibold tabular-nums ${isFluid(f.item) ? "text-fluid" : ""}`}>{fmtRate(f.rate, f.item)}</span>
              {extra?.(f)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecipeSelect({ use, state, update }: { use: RecipeUse; state: PlannerState; update: Update }) {
  const recipe = data.recipes[use.recipe];
  const main = mainProduct(recipe);
  const options = recipesByMainProduct.get(main) ?? [];
  const pinned = state.pinned[main];
  if (options.length <= 1) return <span>{recipe.name}</span>;
  return (
    <select
      className="field max-w-full py-1 text-sm"
      value={pinned ?? ""}
      title={`Recette utilisée pour ${itemName(main)}`}
      onChange={(e) =>
        update((s) => {
          const next = { ...s.pinned };
          if (e.target.value) next[main] = e.target.value;
          else delete next[main];
          return { ...s, pinned: next };
        })
      }
    >
      <option value="">{`Auto : ${recipe.name}`}</option>
      {options.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
          {r.alternate ? " (alt)" : ""}
          {!isRecipeEnabled(state, r) ? " — désactivée" : ""}
        </option>
      ))}
    </select>
  );
}

function ProductionList({ uses, state, update }: { uses: RecipeUse[]; state: PlannerState; update: Update }) {
  return (
    <section className="panel">
      <p className="px-3 pt-3 text-xs text-muted">Des minerais vers le produit final. Les sous-produits sont en gris.</p>
      <ul className="mt-2">
        {orderByDepth(uses).map((u) => {
          const recipe = data.recipes[u.recipe];
          const pinned = state.pinned[mainProduct(recipe)] === u.recipe;
          return (
            <li
              key={u.recipe}
              className="grid gap-x-4 gap-y-2 border-t border-line/60 px-3 py-2.5 sm:grid-cols-[13rem_minmax(0,1fr)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="rounded-md bg-panel-2 p-0.5">
                  <MachineIcon machine={u.machine} size={36} />
                </span>
                <div className="min-w-0">
                  <div className="leading-tight font-semibold">
                    <span className="tabular-nums">{u.count} ×</span> {data.machines[u.machine].name}
                  </div>
                  <div className="text-xs text-muted tabular-nums">
                    <span className={u.clock < 0.999 ? "text-fg" : ""}>{fmtPct(u.clock)}</span>
                    {u.count > 1 && " chacune"} · {fmtMW(u.powerMW)}
                    {u.fixedClock && <span className="text-warn"> · horloge fixe</span>}
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="max-w-80 min-w-0 flex-1 sm:flex-none">
                    <RecipeSelect use={u} state={state} update={update} />
                  </div>
                  {recipe.alternate && <span className="text-xs text-warn">alternative</span>}
                  {pinned && <span className="text-xs text-accent">choisie</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {u.inputs.map((f) => <FlowChip key={f.item} item={f.item} rate={f.rate} />)}
                  <span className="text-accent">→</span>
                  {u.outputs.map((f, i) => <FlowChip key={f.item} item={f.item} rate={f.rate} dim={i > 0} />)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="line-clamp-2 text-xs text-muted" title={sub}>{sub}</div>}
    </div>
  );
}

type View = "list" | "diagram";
const VIEW_KEY = "sfplus-planner:view";

function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "diagram" ? "diagram" : "list";
    } catch {
      return "list";
    }
  });
  const set = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Not persisted: fine.
    }
  };
  return [view, set];
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="text-sm font-semibold tracking-wide text-accent uppercase">Chaîne de production</h3>
      <div className="panel flex gap-1 p-1">
        {([["list", "Liste"], ["diagram", "Schéma"]] as const).map(([v, label]) => (
          <button
            key={v}
            className={`rounded px-3 py-1 text-sm ${view === v ? "bg-accent font-semibold text-black" : "text-muted hover:text-fg"}`}
            onClick={() => onChange(v)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ResultsPanel({ result, busy, state, update }: {
  result: SolveResult | null;
  busy: boolean;
  state: PlannerState;
  update: Update;
}) {
  const [view, setView] = useView();
  if (!result) return <p className="text-muted">Calcul…</p>;
  if (result.status !== "ok") {
    return (
      <div className="panel border-bad/60 p-4">
        <h3 className="font-semibold text-bad">{result.status === "unbounded" ? "Production illimitée" : "Pas de solution"}</h3>
        <p className="mt-1 text-sm">{result.message}</p>
      </div>
    );
  }

  const machineCount = result.recipes.reduce((n, u) => n + u.count, 0);
  const byMachine = new Map<string, number>();
  for (const u of result.recipes) byMachine.set(u.machine, (byMachine.get(u.machine) ?? 0) + u.count);
  const machineSummary = [...byMachine]
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `${n} ${data.machines[m].name}`)
    .join(", ");
  const sinkPoints = result.surplus.reduce((sum, f) => sum + (isFluid(f.item) ? 0 : f.rate * data.items[f.item].sinkPoints), 0);
  const reserved = new Map(state.mode === "inverse" ? state.maximize.filter((m) => m.reserved).map((m) => [m.item, m.reserved!]) : []);

  return (
    <div className={`flex flex-col gap-3 transition-opacity ${busy ? "opacity-60" : ""}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Énergie" value={fmtMW(result.powerMW)} />
        <Stat label="Machines" value={String(machineCount)} sub={machineSummary} />
        <Stat label="Ressources" value={String(result.supplied.length)} sub={result.supplied.map((f) => itemName(f.item)).join(", ")} />
        <Stat label="Surplus" value={String(result.surplus.length)} sub={sinkPoints > 0 ? `${fmt(sinkPoints, 0)} pts de sink/min` : undefined} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        <FlowCard
          title={state.mode === "inverse" ? "Production maximale" : "Livré"}
          tone="text-good"
          flows={result.delivered}
          empty="Rien"
          extra={(f) => {
            const r = reserved.get(f.item);
            if (r === undefined) return null;
            return (
              <span className={`text-xs ${r > f.rate + 1e-9 ? "text-bad" : "text-muted"}`}>
                {fmt(Math.min(r, f.rate))} réservés · {fmt(Math.max(f.rate - r, 0))} en stock
              </span>
            );
          }}
        />
        <FlowCard title="Ressources utilisées" tone="text-accent" flows={result.supplied} empty="Aucune" />
        <FlowCard
          title="Surplus à évacuer"
          tone="text-warn"
          flows={result.surplus}
          empty="Aucun surplus"
          extra={(f) =>
            isFluid(f.item) ? (
              <span className="text-xs text-fluid" title="Les fluides ne vont pas dans le sink : stockage, emballage ou réutilisation">fluide</span>
            ) : (
              <span className="w-14 text-right text-xs text-muted tabular-nums" title="Points de sink par minute">
                {fmt(f.rate * data.items[f.item].sinkPoints, 0)} pts
              </span>
            )
          }
        />
      </div>
      {result.surplus.length > 0 && (
        <p className="text-xs text-muted">
          Une sortie bouchée arrête toute la chaîne : envoie chaque surplus vers un sink, un stockage, ou une autre usine.
        </p>
      )}

      <ViewSwitch view={view} onChange={setView} />
      {view === "list" ? (
        <ProductionList uses={result.recipes} state={state} update={update} />
      ) : (
        <section className="panel p-3">
          <Suspense fallback={<p className="text-sm text-muted">Chargement du schéma…</p>}>
            <Diagram result={result} />
          </Suspense>
        </section>
      )}
      <SplittersPanel result={result} reserved={Object.fromEntries(reserved)} />
    </div>
  );
}
