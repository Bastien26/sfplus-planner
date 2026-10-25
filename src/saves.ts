import { itemName } from "./data";
import { decodeState, encodeState, type PlannerState } from "./state";

export interface SavedPlan {
  id: string;
  name: string;
  savedAt: string;
  encoded: string;
}

const KEY = "sfplus-planner:saves";

export function listSaves(): SavedPlan[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedPlan[];
    return Array.isArray(list) ? list.filter((s) => s && typeof s.encoded === "string") : [];
  } catch {
    return [];
  }
}

function write(list: SavedPlan[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Saves under `name`, replacing a save with the same name. Returns false if storage is unavailable. */
export function savePlan(name: string, state: PlannerState): boolean {
  const list = listSaves().filter((s) => s.name !== name);
  const entry: SavedPlan = { id: crypto.randomUUID(), name, savedAt: new Date().toISOString(), encoded: encodeState(state) };
  return write([entry, ...list]);
}

export const deleteSave = (id: string) => write(listSaves().filter((s) => s.id !== id));

export const loadSave = (save: SavedPlan) => decodeState(save.encoded);

export const shareUrl = (encoded: string) => `${location.origin}${location.pathname}#s=${encoded}`;

export function suggestName(state: PlannerState): string {
  if (state.mode === "inverse") {
    const items = state.maximize.map((m) => itemName(m.item)).join(" + ");
    return items ? `Max ${items}` : "Calcul";
  }
  return state.targets.map((t) => `${t.rate} ${itemName(t.item)}`).join(" + ") || "Calcul";
}
