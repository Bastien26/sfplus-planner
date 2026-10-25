import { useMemo } from "react";
import { allItems, data, producibleItems } from "../data";
import { fmtUnit } from "../format";
import { effectiveSchematics, hubUpgrades, unlockedRecipes } from "../progression";
import type { MaximizeEntry, PlannerState, SupplyEntry } from "../state";
import { ItemPicker } from "./ItemPicker";
import { NumberField } from "./NumberField";

type Update = (fn: (s: PlannerState) => PlannerState) => void;

const DEFAULT_PER_NODE = 30;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-3">
      <h2 className="text-sm font-semibold tracking-wide text-accent uppercase">{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

const RemoveButton = ({ onClick }: { onClick: () => void }) => (
  <button className="btn px-2" onClick={onClick} title="Retirer" aria-label="Retirer">
    ✕
  </button>
);

function replaceAt<T>(list: T[], i: number, value: T): T[] {
  return list.map((x, j) => (j === i ? value : x));
}

export function InputsPanel({ state, update, onOpenProgression }: {
  state: PlannerState;
  update: Update;
  onOpenProgression: () => void;
}) {
  const inverse = state.mode === "inverse";
  return (
    <div className="flex flex-col gap-3">
      <div className="panel grid grid-cols-2 gap-1 p-1">
        {(["direct", "inverse"] as const).map((mode) => (
          <button
            key={mode}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${state.mode === mode ? "bg-accent text-black" : "text-muted hover:text-fg"}`}
            onClick={() => update((s) => ({ ...s, mode }))}
          >
            {mode === "direct" ? "Produire" : "Maximiser"}
          </button>
        ))}
      </div>

      {inverse ? <MaximizeEditor state={state} update={update} /> : <TargetsEditor state={state} update={update} />}
      <SupplyEditor state={state} update={update} />

      <ProgressionSummary state={state} update={update} onOpen={onOpenProgression} />

      <Section title="Réglages">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--color-accent)]"
            checked={state.allAt100}
            onChange={(e) => update((s) => ({ ...s, allAt100: e.target.checked }))}
          />
          Toutes les machines à 100 % (ni sous- ni surcadençage, l'excédent part en surplus)
        </label>
        <label className={`flex items-center justify-between gap-2 text-sm ${state.allAt100 ? "opacity-40" : ""}`}>
          Horloge max des machines
          <select
            className="field"
            value={state.maxClock}
            disabled={state.allAt100}
            onChange={(e) => update((s) => ({ ...s, maxClock: Number(e.target.value) }))}
          >
            <option value={1}>100 % (sans overclock)</option>
            <option value={1.5}>150 %</option>
            <option value={2}>200 %</option>
            <option value={2.5}>250 %</option>
          </select>
        </label>
      </Section>
    </div>
  );
}

function ProgressionSummary({ state, update, onOpen }: { state: PlannerState; update: Update; onOpen: () => void }) {
  const { enabled, owned } = state.progression;
  const summary = useMemo(() => {
    const effective = [...effectiveSchematics(owned)].map((id) => data.schematics[id]);
    const tier = Math.max(0, ...effective.filter((s) => s.type === "milestone").map((s) => s.tier));
    const hub = effective.filter((s) => s.type === "tutorial").length;
    return {
      level: tier > 0 ? `palier ${tier}` : `HUB ${hub}/${hubUpgrades.length}`,
      mam: effective.filter((s) => s.type === "mam").length,
      drives: effective.filter((s) => s.type === "alternate").length,
      recipes: unlockedRecipes(owned).size,
    };
  }, [owned]);
  return (
    <Section title="Progression">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-[var(--color-accent)]"
          checked={enabled}
          onChange={(e) => update((s) => ({ ...s, progression: { ...s.progression, enabled: e.target.checked } }))}
        />
        Seulement mes recettes débloquées
      </label>
      <p className={`text-xs ${enabled ? "text-fg" : "text-muted"}`}>
        {enabled
          ? `${summary.level} · ${summary.mam} MAM · ${summary.drives} disque${summary.drives > 1 ? "s" : ""} dur${summary.drives > 1 ? "s" : ""} · ${summary.recipes} recettes`
          : "Désactivé : toutes les recettes standard sont utilisables, alternatives au choix."}
      </p>
      <button className="btn self-start" onClick={onOpen}>Choisir mes déblocages →</button>
    </Section>
  );
}

function TargetsEditor({ state, update }: { state: PlannerState; update: Update }) {
  return (
    <Section title="Objets à produire" hint="Ce qui doit sortir de l'usine, par minute.">
      {state.targets.map((t, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-md border border-line p-2">
          <div className="flex items-center gap-2">
            <ItemPicker
              value={t.item}
              options={producibleItems}
              onChange={(item) => update((s) => ({ ...s, targets: replaceAt(s.targets, i, { ...t, item }) }))}
            />
            <RemoveButton onClick={() => update((s) => ({ ...s, targets: s.targets.filter((_, j) => j !== i) }))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            Débit voulu
            <NumberField
              value={t.rate}
              onChange={(rate) => update((s) => ({ ...s, targets: replaceAt(s.targets, i, { ...t, rate: rate ?? 0 }) }))}
            />
            <span className="text-xs">{fmtUnit(t.item)}/min</span>
          </label>
        </div>
      ))}
      <AddRow
        label="Ajouter un objet"
        options={producibleItems}
        onAdd={(item) => update((s) => ({ ...s, targets: [...s.targets, { item, rate: 10 }] }))}
      />
    </Section>
  );
}

function MaximizeEditor({ state, update }: { state: PlannerState; update: Update }) {
  const several = state.maximize.length > 1;
  const set = (i: number, m: MaximizeEntry) => update((s) => ({ ...s, maximize: replaceAt(s.maximize, i, m) }));
  return (
    <Section
      title="Objets à maximiser"
      hint={several ? "Proportions entre les objets (ex. 2 et 1 = deux fois plus du premier)." : "Le maximum possible avec les ressources disponibles."}
    >
      {state.maximize.map((m, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-md border border-line p-2">
          <div className="flex items-center gap-2">
            <ItemPicker value={m.item} options={producibleItems} onChange={(item) => set(i, { ...m, item })} />
            {several && (
              <NumberField value={m.ratio} onChange={(ratio) => set(i, { ...m, ratio: ratio ?? 0 })} className="w-16" title="Proportion" />
            )}
            <RemoveButton onClick={() => update((s) => ({ ...s, maximize: s.maximize.filter((_, j) => j !== i) }))} />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            Réservé pour une machine
            <NumberField
              value={m.reserved ?? null}
              placeholder="—"
              className="w-20"
              onChange={(reserved) => set(i, { ...m, reserved: reserved ?? undefined })}
            />
            {fmtUnit(m.item)}/min, le reste en stock
          </label>
        </div>
      ))}
      <AddRow
        label="Ajouter un objet"
        options={producibleItems}
        onAdd={(item) => update((s) => ({ ...s, maximize: [...s.maximize, { item, ratio: 1 }] }))}
      />
    </Section>
  );
}

function SupplyEditor({ state, update }: { state: PlannerState; update: Update }) {
  const inverse = state.mode === "inverse";
  const set = (i: number, e: SupplyEntry) => update((s) => ({ ...s, supply: replaceAt(s.supply, i, e) }));
  return (
    <Section
      title="Ressources disponibles"
      hint={
        inverse
          ? "Ce que tu as sous la main. Les minerais : nombre de gisements × débit d'un mineur."
          : "Optionnel : sans ligne, les ressources brutes sont illimitées. Ajoute une ligne pour plafonner un minerai ou utiliser un stock (lingots…)."
      }
    >
      {state.supply.map((e, i) => {
        const item = data.items[e.item];
        const ore = item.raw && item.form === "solid";
        const unlimited = e.rate === null;
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-md border border-line p-2">
            <div className="flex items-center gap-2">
              <ItemPicker value={e.item} options={allItems} onChange={(id) => set(i, { ...e, item: id })} />
              <RemoveButton onClick={() => update((s) => ({ ...s, supply: s.supply.filter((_, j) => j !== i) }))} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {ore && !unlimited && (
                <>
                  <NumberField
                    value={e.nodes ?? null}
                    placeholder="1"
                    className="w-14"
                    title="Nombre de gisements"
                    onChange={(nodes) => {
                      const perNode = e.perNode ?? DEFAULT_PER_NODE;
                      set(i, { ...e, nodes: nodes ?? undefined, perNode, rate: nodes === null ? e.rate : nodes * perNode });
                    }}
                  />
                  <span className="text-muted">×</span>
                  <NumberField
                    value={e.perNode ?? DEFAULT_PER_NODE}
                    className="w-16"
                    title="Débit d'un mineur (/min)"
                    onChange={(perNode) => {
                      const p = perNode ?? DEFAULT_PER_NODE;
                      set(i, { ...e, perNode: p, rate: e.nodes !== undefined ? e.nodes * p : e.rate });
                    }}
                  />
                  <span className="text-muted">=</span>
                </>
              )}
              {!unlimited && (
                <>
                  <NumberField
                    value={e.rate}
                    onChange={(rate) => set(i, { ...e, rate: rate ?? 0, nodes: undefined })}
                  />
                  <span className="text-xs text-muted">{fmtUnit(e.item)}/min</span>
                </>
              )}
              <label className="ml-auto flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={unlimited}
                  onChange={(ev) => set(i, { ...e, rate: ev.target.checked ? null : (e.nodes ?? 1) * (e.perNode ?? DEFAULT_PER_NODE) })}
                />
                illimité
              </label>
            </div>
          </div>
        );
      })}
      <AddRow
        label="Ajouter une ressource"
        options={allItems}
        onAdd={(id) => {
          const item = data.items[id];
          const ore = item.raw && item.form === "solid";
          update((s) => ({
            ...s,
            supply: [...s.supply, ore ? { item: id, rate: DEFAULT_PER_NODE, nodes: 1, perNode: DEFAULT_PER_NODE } : { item: id, rate: 60 }],
          }));
        }}
      />
      {inverse && (
        <label className="mt-1 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={state.otherRaw === "unlimited"}
            onChange={(e) => update((s) => ({ ...s, otherRaw: e.target.checked ? "unlimited" : "none" }))}
          />
          Autres ressources brutes illimitées (eau, air…)
        </label>
      )}
    </Section>
  );
}

function AddRow({ label, options, onAdd }: { label: string; options: typeof allItems; onAdd: (item: string) => void }) {
  return (
    <div className="flex items-center gap-2 opacity-80 focus-within:opacity-100">
      <span className="text-lg text-accent">＋</span>
      <ItemPicker value={null} options={options} placeholder={label} onChange={onAdd} />
    </div>
  );
}
