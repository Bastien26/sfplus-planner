/** Rates are per minute; fluids in m³/min. */
export interface Flow {
  item: string;
  rate: number;
}

export interface SolveRequest {
  /** Recipe ids the solver may use. */
  recipes: Iterable<string>;
  /** Fixed outputs to deliver. */
  targets?: Flow[];
  /** Inverse mode: maximize k so that each item is delivered at ratio × k (on top of fixed targets). */
  maximize?: { item: string; ratio?: number }[];
  /** Available inputs: max rate, or null for unlimited. Any item can be listed, raw or not. */
  supply?: Record<string, number | null>;
  /** Raw resources not listed in `supply`: unlimited (default) or unavailable. */
  defaultRawSupply?: "unlimited" | "none";
  /** Max clock as a fraction (1 = 100 %, 2.5 = 250 %). Default 1. */
  maxClock?: number;
  /** Every machine at exactly 100 % (integer machine counts, excess goes to surplus). */
  allAt100?: boolean;
  /** Cost per unit of supplied input in the "minimize resources" stage. */
  weights?: Record<string, number>;
}

export interface RecipeUse {
  recipe: string;
  machine: string;
  /** Machine-equivalents at 100 % clock. */
  amount: number;
  count: number;
  /** Clock of each machine, as a fraction. */
  clock: number;
  /** The machine cannot change its clock (shown clock is the average). */
  fixedClock: boolean;
  powerMW: number;
  inputs: Flow[];
  outputs: Flow[];
}

export type SolveStatus = "ok" | "infeasible" | "unbounded" | "error";

export interface SolveResult {
  status: SolveStatus;
  message?: string;
  /** Inverse mode: the maximized k (deliveries = fixed targets + ratio × k). 0 in direct mode. */
  scale: number;
  recipes: RecipeUse[];
  supplied: Flow[];
  delivered: Flow[];
  surplus: Flow[];
  powerMW: number;
}
