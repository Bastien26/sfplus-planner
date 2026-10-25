import { useMemo, useState } from "react";
import { data, itemName, normalize } from "../data";
import type { Recipe, Stack } from "../data/types";
import { fmt, fmtUnit } from "../format";
import { isRecipeEnabled, isRecipeEnabledByDefault, type PlannerState } from "../state";
import { ItemIcon, MachineIcon } from "./ItemIcon";

type Update = (fn: (s: PlannerState) => PlannerState) => void;
type Filter = "all" | "alt" | "on" | "off";

const recipes = Object.values(data.recipes).sort((a, b) => a.name.localeCompare(b.name));
const MAX_ROWS = 150;

function StackChip({ s, recipe }: { s: Stack; recipe: Recipe }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={itemName(s.item)}>
      <ItemIcon item={s.item} size={20} />
      <span className="tabular-nums">{fmt(s.amount)}{fmtUnit(s.item)}</span>
      <span className="text-xs text-muted">{itemName(s.item)}</span>
      <span className="text-xs text-muted/70 tabular-nums">({fmt((s.amount * 60) / recipe.duration)}/min)</span>
    </span>
  );
}

function RecipeRow({ r, state, update }: { r: Recipe; state: PlannerState; update: Update }) {
  const on = isRecipeEnabled(state, r);
  const toggle = () =>
    update((s) => {
      const toggles = { ...s.recipeToggles };
      const next = !on;
      if (next === isRecipeEnabledByDefault(s, r)) delete toggles[r.id];
      else toggles[r.id] = next;
      return { ...s, recipeToggles: toggles };
    });
  const m = data.machines[r.machine];
  return (
    <tr className={`border-b border-line/60 align-top ${on ? "" : "opacity-50"}`}>
      <td className="px-3 py-2">
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={on} onChange={toggle} />
          <span>
            <span className="font-medium">{r.name}</span>
            {r.alternate && <span className="ml-2 text-xs text-warn">alternative</span>}
            <span className="block text-xs text-muted">{r.unlockedBy.map((id) => data.schematics[id].name).join(", ")}</span>
          </span>
        </label>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <MachineIcon machine={r.machine} size={22} /> {m.name}
        </span>
        <span className="block text-xs text-muted">{fmt(r.duration)} s · {fmt(r.powerMW)} MW</span>
      </td>
      <td className="px-3 py-2"><div className="flex flex-col gap-1">{r.inputs.map((s) => <StackChip key={s.item} s={s} recipe={r} />)}</div></td>
      <td className="px-3 py-2"><div className="flex flex-col gap-1">{r.outputs.map((s) => <StackChip key={s.item} s={s} recipe={r} />)}</div></td>
    </tr>
  );
}

function RecipeTable({ title, list, state, update }: { title: string; list: Recipe[]; state: PlannerState; update: Update }) {
  if (list.length === 0) return null;
  return (
    <section className="panel overflow-hidden">
      <h3 className="px-3 pt-3 text-sm font-semibold tracking-wide text-accent uppercase">{title} ({list.length})</h3>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Recette · débloquée par</th>
              <th className="px-3 py-2 font-medium">Machine</th>
              <th className="px-3 py-2 font-medium">Entrées (par cycle)</th>
              <th className="px-3 py-2 font-medium">Sorties (par cycle)</th>
            </tr>
          </thead>
          <tbody>{list.slice(0, MAX_ROWS).map((r) => <RecipeRow key={r.id} r={r} state={state} update={update} />)}</tbody>
        </table>
      </div>
      {list.length > MAX_ROWS && <p className="px-3 py-2 text-xs text-muted">{list.length - MAX_ROWS} de plus : affine la recherche.</p>}
    </section>
  );
}

export function RecipesPanel({ state, update }: { state: PlannerState; update: Update }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("alt");

  const { producing, consuming } = useMemo(() => {
    const keep = (r: Recipe) => {
      const on = isRecipeEnabled(state, r);
      return filter === "all" || (filter === "alt" && r.alternate) || (filter === "on" && on) || (filter === "off" && !on);
    };
    const q = normalize(query.trim());
    const pool = recipes.filter(keep);
    if (!q) return { producing: pool, consuming: [] };
    const has = (stacks: Stack[]) => stacks.some((s) => normalize(itemName(s.item)).includes(q));
    const producing = pool.filter((r) => normalize(r.name).includes(q) || has(r.outputs));
    const consuming = pool.filter((r) => has(r.inputs) && !producing.includes(r));
    return { producing, consuming };
  }, [query, filter, state]);

  const altOn = recipes.filter((r) => r.alternate && isRecipeEnabled(state, r)).length;
  const stdOff = recipes.filter((r) => !r.alternate && !isRecipeEnabled(state, r)).length;
  const filters: [Filter, string][] = [["alt", "Alternatives"], ["all", "Toutes"], ["on", "Activées"], ["off", "Désactivées"]];

  return (
    <div className="flex flex-col gap-3">
      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <input
          className="field min-w-64 flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une recette ou un objet…"
        />
        <div className="flex gap-1">
          {filters.map(([f, label]) => (
            <button key={f} className={f === filter ? "btn-primary" : "btn"} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
        <span className="text-sm text-muted">
          {altOn} alternative{altOn > 1 ? "s" : ""} activée{altOn > 1 ? "s" : ""}
          {stdOff > 0 && ` · ${stdOff} standard désactivée${stdOff > 1 ? "s" : ""}`}
        </span>
        {(altOn > 0 || stdOff > 0 || Object.keys(state.pinned).length > 0) && (
          <button
            className="btn"
            onClick={() => update((s) => ({ ...s, recipeToggles: {}, pinned: {} }))}
            title="Recettes standard activées, alternatives désactivées, aucun choix forcé"
          >
            Réinitialiser
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        {state.progression.enabled
          ? "Progression active : seules les recettes débloquées (onglet Progression) sont cochées par défaut. Tu peux en forcer ou en retirer ici."
          : "Par défaut, les recettes standard sont activées et les alternatives désactivées. Coche les alternatives que tu as débloquées, ou utilise l'onglet Progression."}{" "}
        Le solveur choisit la meilleure combinaison parmi les recettes activées.
      </p>
      <RecipeTable title={query ? "Recettes qui produisent" : "Recettes"} list={producing} state={state} update={update} />
      <RecipeTable title="Recettes qui l'utilisent en entrée" list={consuming} state={state} update={update} />
    </div>
  );
}
