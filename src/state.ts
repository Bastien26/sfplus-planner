import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { data, mainProduct } from "./data";
import type { Recipe } from "./data/types";
import { unlockedRecipes, type Progression } from "./progression";
import type { Flow, SolveRequest } from "./solver/types";

export interface SupplyEntry {
  item: string;
  /** Max rate per minute; null = unlimited. */
  rate: number | null;
  /** Optional helper for ores: number of nodes × rate per node. */
  nodes?: number;
  perNode?: number;
}

export interface MaximizeEntry {
  item: string;
  ratio: number;
  /** Part of the output reserved for one consumer; the rest goes to storage. */
  reserved?: number;
}

export interface PlannerState {
  v: 1;
  mode: "direct" | "inverse";
  targets: Flow[];
  maximize: MaximizeEntry[];
  supply: SupplyEntry[];
  /** Inverse mode: raw resources not listed in `supply`. */
  otherRaw: "unlimited" | "none";
  maxClock: number;
  /** Every machine at exactly 100 % (integer machine counts). */
  allAt100: boolean;
  progression: Progression;
  /** Overrides of the default (unlocked recipes with progression on; otherwise standard on, alternates off). */
  recipeToggles: Record<string, boolean>;
  /** item → the only recipe allowed to make it (as main product). */
  pinned: Record<string, string>;
}

export const DEFAULT_STATE: PlannerState = {
  v: 1,
  mode: "direct",
  targets: [{ item: "Desc_IronPlateReinforced", rate: 5 }],
  maximize: [{ item: "Desc_IronPlateReinforced", ratio: 1 }],
  supply: [],
  otherRaw: "none",
  maxClock: 1,
  allAt100: false,
  progression: { enabled: false, owned: [] },
  recipeToggles: {},
  pinned: {},
};

const unlockedCache = new WeakMap<Progression, Set<string>>();
function unlockedFor(p: Progression): Set<string> {
  let set = unlockedCache.get(p);
  if (!set) unlockedCache.set(p, (set = unlockedRecipes(p.owned)));
  return set;
}

/** Enabled before per-recipe overrides. */
export const isRecipeEnabledByDefault = (state: PlannerState, r: Recipe) =>
  state.progression.enabled ? unlockedFor(state.progression).has(r.id) : !r.alternate;

export const isRecipeEnabled = (state: PlannerState, r: Recipe) =>
  state.recipeToggles[r.id] ?? isRecipeEnabledByDefault(state, r);

export function allowedRecipes(state: PlannerState): string[] {
  const pinnedIds = new Set(Object.values(state.pinned));
  return Object.values(data.recipes)
    .filter((r) => {
      if (pinnedIds.has(r.id)) return true;
      const pin = state.pinned[mainProduct(r)];
      if (pin && pin !== r.id) return false;
      return isRecipeEnabled(state, r);
    })
    .map((r) => r.id);
}

export function toSolveRequest(state: PlannerState): SolveRequest {
  const supply: Record<string, number | null> = {};
  for (const s of state.supply) {
    if (!data.items[s.item]) continue;
    supply[s.item] = s.rate === null ? null : Math.max(0, s.rate);
  }
  const inverse = state.mode === "inverse";
  return {
    recipes: allowedRecipes(state),
    targets: inverse ? [] : state.targets.filter((t) => data.items[t.item] && t.rate > 0),
    maximize: inverse ? state.maximize.filter((m) => data.items[m.item] && m.ratio > 0).map(({ item, ratio }) => ({ item, ratio })) : [],
    supply,
    defaultRawSupply: inverse ? state.otherRaw : "unlimited",
    maxClock: state.maxClock,
    allAt100: state.allAt100,
  };
}

// --- Persistence -----------------------------------------------------------

const STORAGE_KEY = "sfplus-planner:state";
const HASH_PREFIX = "#s=";

export const encodeState = (s: PlannerState) => compressToEncodedURIComponent(JSON.stringify(s));

const isFlow = (x: unknown): x is Flow =>
  !!x && typeof (x as Flow).item === "string" && typeof (x as Flow).rate === "number";

/** Parses and sanitizes a saved state; unknown items and recipes are dropped. */
export function decodeState(encoded: string): PlannerState | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const s = JSON.parse(json) as Partial<PlannerState>;
    if (s.v !== 1) return null;
    const knownItem = (id: unknown) => typeof id === "string" && !!data.items[id];
    const knownRecipe = (id: unknown) => typeof id === "string" && !!data.recipes[id];
    return {
      ...DEFAULT_STATE,
      mode: s.mode === "inverse" ? "inverse" : "direct",
      targets: (s.targets ?? []).filter((t) => isFlow(t) && knownItem(t.item)),
      maximize: (s.maximize ?? DEFAULT_STATE.maximize).filter((m) => knownItem(m?.item) && typeof m.ratio === "number"),
      supply: (s.supply ?? []).filter((x) => knownItem(x?.item) && (x.rate === null || typeof x.rate === "number")),
      otherRaw: s.otherRaw === "unlimited" ? "unlimited" : "none",
      maxClock: typeof s.maxClock === "number" && s.maxClock >= 0.01 && s.maxClock <= 2.5 ? s.maxClock : 1,
      allAt100: s.allAt100 === true,
      progression: {
        enabled: s.progression?.enabled === true,
        owned: (s.progression?.owned ?? []).filter((id) => typeof id === "string" && !!data.schematics[id]),
      },
      recipeToggles: Object.fromEntries(
        Object.entries(s.recipeToggles ?? {}).filter(([id, on]) => knownRecipe(id) && typeof on === "boolean"),
      ),
      pinned: Object.fromEntries(Object.entries(s.pinned ?? {}).filter(([item, id]) => knownItem(item) && knownRecipe(id))),
    };
  } catch {
    return null;
  }
}

export function loadInitialState(): PlannerState {
  if (location.hash.startsWith(HASH_PREFIX)) {
    const s = decodeState(location.hash.slice(HASH_PREFIX.length));
    if (s) return s;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const s = saved && decodeState(saved);
    if (s) return s;
  } catch {
    // Storage unavailable (private mode): fall back to defaults.
  }
  return DEFAULT_STATE;
}

export function saveState(s: PlannerState) {
  const encoded = encodeState(s);
  history.replaceState(null, "", `${location.pathname}${location.search}${HASH_PREFIX}${encoded}`);
  try {
    localStorage.setItem(STORAGE_KEY, encoded);
  } catch {
    // Ignore: the URL still holds the state.
  }
}
