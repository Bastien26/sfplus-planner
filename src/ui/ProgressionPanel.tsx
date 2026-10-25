import { useMemo, useState } from "react";
import { data, normalize } from "../data";
import type { Schematic } from "../data/types";
import {
  effectiveSchematics,
  hardDrives,
  hubUpgrades,
  MAM_GROUP_LABELS,
  mamByGroup,
  milestonesByTier,
  ownUpToTier,
  tiers,
  unlockedRecipes,
} from "../progression";
import type { PlannerState } from "../state";

type Update = (fn: (s: PlannerState) => PlannerState) => void;

const recipeNames = (s: Schematic) => s.recipes.map((id) => data.recipes[id].name);

function SchematicCheck({ s, owned, auto, onToggle }: { s: Schematic; owned: boolean; auto: boolean; onToggle: () => void }) {
  const names = recipeNames(s);
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm ${
        owned || auto ? "border-accent/50 bg-accent/5" : "border-line hover:border-muted"
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 accent-[var(--color-accent)]"
        checked={owned || auto}
        disabled={auto}
        onChange={onToggle}
      />
      <span className="min-w-0">
        <span className="font-medium">{s.name.replace(/^Alternate: /, "")}</span>
        {auto && <span className="ml-1.5 text-xs text-accent">inclus</span>}
        <span className="line-clamp-2 text-xs text-muted" title={names.join(", ")}>{names.join(", ")}</span>
      </span>
    </label>
  );
}

function Group({ title, list, ownedSet, effective, onToggle, action }: {
  title: string;
  list: Schematic[];
  ownedSet: Set<string>;
  effective: Set<string>;
  onToggle: (id: string) => void;
  action?: React.ReactNode;
}) {
  if (list.length === 0) return null;
  const count = list.filter((s) => effective.has(s.id)).length;
  return (
    <section className="panel p-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-accent uppercase">{title}</h3>
        <span className="text-xs text-muted">{count}/{list.length}</span>
        <div className="ml-auto">{action}</div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((s) => (
          <SchematicCheck
            key={s.id}
            s={s}
            owned={ownedSet.has(s.id)}
            auto={effective.has(s.id) && !ownedSet.has(s.id)}
            onToggle={() => onToggle(s.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function ProgressionPanel({ state, update }: { state: PlannerState; update: Update }) {
  const [query, setQuery] = useState("");
  const { enabled, owned } = state.progression;
  const ownedSet = useMemo(() => new Set(owned), [owned]);
  const effective = useMemo(() => effectiveSchematics(owned), [owned]);
  const recipeCount = useMemo(() => unlockedRecipes(owned).size, [owned]);

  const setOwned = (next: string[]) => update((s) => ({ ...s, progression: { ...s.progression, owned: next } }));
  const toggle = (id: string) => setOwned(ownedSet.has(id) ? owned.filter((x) => x !== id) : [...owned, id]);
  const setAll = (list: Schematic[], on: boolean) => {
    const ids = new Set(list.map((s) => s.id));
    setOwned(on ? [...new Set([...owned, ...ids])] : owned.filter((id) => !ids.has(id)));
  };

  const q = normalize(query.trim());
  const match = (s: Schematic) => !q || normalize(s.name).includes(q) || recipeNames(s).some((n) => normalize(n).includes(q));
  const groupProps = { ownedSet, effective, onToggle: toggle };
  const allToggle = (list: Schematic[]) => {
    const all = list.every((s) => effective.has(s.id));
    return (
      <button className="btn py-0.5 text-xs" onClick={() => setAll(list, !all)}>{all ? "Tout décocher" : "Tout cocher"}</button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="panel flex flex-wrap items-center gap-x-5 gap-y-3 p-3">
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="accent-[var(--color-accent)]"
            checked={enabled}
            onChange={(e) => update((s) => ({ ...s, progression: { ...s.progression, enabled: e.target.checked } }))}
          />
          Utiliser seulement mes recettes débloquées
        </label>
        <label className="flex items-center gap-2 text-sm">
          Cocher tout jusqu'au
          <select
            className="field"
            value=""
            onChange={(e) => {
              const tier = Number(e.target.value);
              update((s) => ({ ...s, progression: { enabled: true, owned: ownUpToTier(s.progression.owned, tier) } }));
            }}
          >
            <option value="" disabled>palier…</option>
            <option value={0}>HUB (sans palier)</option>
            {tiers.map((t) => <option key={t} value={t}>Palier {t}</option>)}
          </select>
        </label>
        <span className="text-sm text-muted">{recipeCount} recettes débloquées</span>
        <input className="field min-w-56 flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un déblocage ou une recette…" />
      </div>
      <p className="text-xs text-muted">
        Coche ce que vous avez débloqué sur le serveur. Les déblocages de départ et ceux du Packager suivent ton palier
        automatiquement ; acheter un palier inclut toutes les améliorations du HUB.
      </p>

      <Group title="HUB" list={hubUpgrades.filter(match)} {...groupProps} action={allToggle(hubUpgrades)} />
      {tiers.map((t) => {
        const list = milestonesByTier.get(t)!;
        return <Group key={t} title={`Palier ${t}`} list={list.filter(match)} {...groupProps} action={allToggle(list)} />;
      })}
      <Group title="Disques durs" list={hardDrives.filter(match)} {...groupProps} />
      {[...mamByGroup].map(([group, list]) => (
        <Group key={group} title={`MAM · ${MAM_GROUP_LABELS[group] ?? group}`} list={list.filter(match)} {...groupProps} action={allToggle(list)} />
      ))}
    </div>
  );
}
