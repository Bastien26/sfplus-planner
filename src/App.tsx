import { useCallback, useEffect, useMemo, useState } from "react";
import { data } from "./data";
import { solveInBrowser } from "./solver/glpk-browser";
import type { SolveResult } from "./solver/types";
import { DEFAULT_STATE, loadInitialState, saveState, toSolveRequest, type PlannerState } from "./state";
import { InputsPanel } from "./ui/InputsPanel";
import { ProgressionPanel } from "./ui/ProgressionPanel";
import { RecipesPanel } from "./ui/RecipesPanel";
import { ResultsPanel } from "./ui/ResultsPanel";
import { SavesMenu } from "./ui/SavesMenu";

type Tab = "calc" | "progression" | "recipes";

const SOLVE_DELAY_MS = 200;
const SAVE_DELAY_MS = 400;

function useSolveResult(state: PlannerState) {
  const request = useMemo(() => toSolveRequest(state), [state]);
  const key = JSON.stringify(request);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(() => {
      solveInBrowser(data, request)
        .catch((e): SolveResult => ({
          status: "error", message: `Erreur du solveur : ${e}`, scale: 0, recipes: [], supplied: [], delivered: [], surplus: [], powerMW: 0,
        }))
        .then((res) => {
          if (cancelled) return;
          setResult(res);
          setBusy(false);
        });
    }, SOLVE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // The serialized request is the real dependency.
  }, [key]);

  return { result, busy };
}

export function App() {
  const [state, setState] = useState<PlannerState>(loadInitialState);
  const [tab, setTab] = useState<Tab>("calc");
  const [copied, setCopied] = useState(false);
  const update = useCallback((fn: (s: PlannerState) => PlannerState) => setState(fn), []);
  const { result, busy } = useSolveResult(state);

  useEffect(() => {
    const timer = setTimeout(() => saveState(state), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const share = async () => {
    saveState(state);
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copie ce lien :", location.href);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-4">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
        <h1 className="text-xl font-bold">
          <span className="text-accent">SF+</span> Planner
        </h1>
        <nav className="flex gap-1">
          {([["calc", "Calculateur"], ["progression", "Progression"], ["recipes", "Recettes"]] as const).map(([t, label]) => (
            <button
              key={t}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-panel-2 text-accent" : "text-muted hover:text-fg"}`}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap gap-2">
          <SavesMenu state={state} onLoad={(s) => update(() => s)} />
          <button
            className="btn"
            onClick={() =>
              update((s) => ({ ...DEFAULT_STATE, targets: [], recipeToggles: s.recipeToggles, progression: s.progression, maxClock: s.maxClock }))
            }
          >
            Nouveau calcul
          </button>
          <button className="btn-primary" onClick={share}>{copied ? "Lien copié !" : "Partager le lien"}</button>
        </div>
      </header>

      <main className="flex-1">
        {tab === "calc" ? (
          <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
            <aside>
              <InputsPanel state={state} update={update} onOpenProgression={() => setTab("progression")} />
            </aside>
            <ResultsPanel result={result} busy={busy} state={state} update={update} />
          </div>
        ) : tab === "progression" ? (
          <ProgressionPanel state={state} update={update} />
        ) : (
          <RecipesPanel state={state} update={update} />
        )}
      </main>

      <footer className="mt-8 border-t border-line py-4 text-xs text-muted">
        Données SF+ {data.meta.sfVersion} (export du wiki K-Mods du {new Date(data.meta.exportedAt).toLocaleDateString("fr-FR")}).
        Outil personnel, non officiel. Satisfactory Plus, ses données et ses icônes appartiennent à{" "}
        <a className="underline hover:text-accent" href="https://k-mods.com/" target="_blank" rel="noreferrer">K-Mods</a>, Satisfactory à
        Coffee Stain Studios.
      </footer>
    </div>
  );
}
