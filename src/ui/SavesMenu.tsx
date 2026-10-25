import { useEffect, useRef, useState } from "react";
import { deleteSave, listSaves, loadSave, savePlan, shareUrl, suggestName, type SavedPlan } from "../saves";
import type { PlannerState } from "../state";

export function SavesMenu({ state, onLoad }: { state: PlannerState; onLoad: (s: PlannerState) => void }) {
  const [open, setOpen] = useState(false);
  const [saves, setSaves] = useState<SavedPlan[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setSaves(listSaves());
    setName(suggestName(state));
    setMessage(null);
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
    // Refresh only when the menu opens.
  }, [open]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2000);
  };

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (savePlan(n, state)) {
      setSaves(listSaves());
      flash(`« ${n} » enregistré`);
    } else {
      flash("Impossible d'enregistrer : stockage du navigateur indisponible");
    }
  };

  const copy = async (s: SavedPlan) => {
    try {
      await navigator.clipboard.writeText(shareUrl(s.encoded));
      flash("Lien copié");
    } catch {
      prompt("Copie ce lien :", shareUrl(s.encoded));
    }
  };

  return (
    <div ref={root} className="relative">
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Sauvegardes
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-line bg-panel-2 p-3 shadow-2xl sm:right-0 sm:left-auto">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input className="field min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du calcul" />
            <button className="btn-primary" type="submit">Enregistrer</button>
          </form>
          {message && <p className="mt-2 text-xs text-good">{message}</p>}
          <ul className="mt-3 flex max-h-80 flex-col gap-1 overflow-auto">
            {saves.length === 0 && <li className="text-sm text-muted">Aucune sauvegarde pour l'instant.</li>}
            {saves.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-panel">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    const loaded = loadSave(s);
                    if (loaded) {
                      onLoad(loaded);
                      setOpen(false);
                    } else flash("Sauvegarde illisible");
                  }}
                  title="Ouvrir ce calcul"
                >
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block text-xs text-muted">{new Date(s.savedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                </button>
                <button className="btn px-2 py-1 text-xs" onClick={() => copy(s)} title="Copier le lien de partage">Lien</button>
                <button
                  className="btn px-2 py-1 text-xs hover:border-bad hover:text-bad"
                  onClick={() => {
                    if (confirm(`Supprimer « ${s.name} » ?`)) {
                      deleteSave(s.id);
                      setSaves(listSaves());
                    }
                  }}
                  title="Supprimer"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Enregistré dans ce navigateur. Pour un pote, utilise « Lien ».</p>
        </div>
      )}
    </div>
  );
}
