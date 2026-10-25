import GLPK from "glpk.js";
import type { GameData } from "../data/types";
import { solve, type Glpk } from "./solve";
import type { SolveRequest, SolveResult } from "./types";

let instance: Promise<Glpk> | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Shared browser GLPK instance (runs in glpk.js's own Web Worker). */
export const getGlpk = (): Promise<Glpk> => (instance ??= GLPK());

/** Runs solves one after another: a solve is several dependent GLPK calls that must not interleave. */
export function solveInBrowser(data: GameData, req: SolveRequest): Promise<SolveResult> {
  const run = queue.then(async () => solve(data, await getGlpk(), req));
  queue = run.catch(() => undefined);
  return run;
}
