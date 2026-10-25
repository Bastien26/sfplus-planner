/** Splitter trees built only from basic splitters (2 or 3 equal outputs) and mergers. */

export type SplitNode =
  | { kind: "split"; ways: 2 | 3; rate: number; children: SplitNode[] }
  | { kind: "out"; dest: string; rate: number };

export interface Destination {
  key: string;
  rate: number;
}

export interface SplitPlan {
  root: SplitNode;
  /** Every destination gets exactly its rate. */
  exact: boolean;
  /** Largest relative error over destinations (0 when exact). */
  maxError: number;
  /** Rate each destination really gets with this tree. */
  delivered: Record<string, number>;
  splitters: number;
  mergers: number;
  /** Destinations fed by several branches, with the number of branches to merge. */
  merges: Record<string, number>;
}

const MAX_EXACT_PARTS = 216;
const MAX_APPROX_PARTS = 72;
const TOL = 1e-6;

/** 2^a·3^b numbers, ascending. */
function smoothNumbers(max: number): number[] {
  const out: number[] = [];
  for (let p2 = 1; p2 <= max; p2 *= 2) for (let n = p2; n <= max; n *= 3) out.push(n);
  return out.sort((a, b) => a - b);
}
const SMOOTH = smoothNumbers(MAX_EXACT_PARTS);

export const isSplittable = (parts: number) => SMOOTH.includes(parts);

/** Largest-remainder rounding of fractions to integer parts of `n`, at least one part each. */
function roundParts(fractions: number[], n: number): number[] | null {
  if (n < fractions.length) return null;
  const raw = fractions.map((f) => f * n);
  const parts = raw.map((x) => Math.max(1, Math.floor(x)));
  let left = n - parts.reduce((a, b) => a + b, 0);
  if (left < 0) return null;
  const order = raw.map((x, i) => ({ i, rem: x - Math.floor(x) })).sort((a, b) => b.rem - a.rem);
  for (let j = 0; left > 0; j = (j + 1) % order.length, left--) parts[order[j].i]++;
  return parts;
}

type Counts = [dest: string, parts: number][];

/** Packs destination parts into k bins of m parts, keeping each destination whole when it fits. */
function distribute(counts: Counts, k: number, m: number): Counts[] {
  const bins = Array.from({ length: k }, () => ({ cap: m, items: [] as Counts }));
  for (const [dest, c] of [...counts].sort((a, b) => b[1] - a[1])) {
    const fit = bins.filter((b) => b.cap >= c).sort((a, b) => a.cap - b.cap)[0];
    if (fit) {
      fit.items.push([dest, c]);
      fit.cap -= c;
      continue;
    }
    let rest = c;
    for (const b of [...bins].sort((a, b) => b.cap - a.cap)) {
      const take = Math.min(b.cap, rest);
      if (take > 0) {
        b.items.push([dest, take]);
        b.cap -= take;
        rest -= take;
      }
    }
  }
  return bins.map((b) => b.items);
}

interface Built {
  node: SplitNode;
  splitters: number;
  leaves: Map<string, number>;
}

const mergersFor = (leaves: Map<string, number>) =>
  [...leaves.values()].reduce((n, l) => n + Math.ceil((l - 1) / 2), 0);

function build(parts: number, counts: Counts, unit: number): Built {
  if (counts.length === 1) {
    return { node: { kind: "out", dest: counts[0][0], rate: parts * unit }, splitters: 0, leaves: new Map([[counts[0][0], 1]]) };
  }
  let best: Built | null = null;
  for (const k of [2, 3] as const) {
    if (parts % k !== 0) continue;
    const children = distribute(counts, k, parts / k).map((bin) => build(parts / k, bin, unit));
    const leaves = new Map<string, number>();
    for (const c of children) for (const [d, n] of c.leaves) leaves.set(d, (leaves.get(d) ?? 0) + n);
    const candidate: Built = {
      node: { kind: "split", ways: k, rate: parts * unit, children: children.map((c) => c.node) },
      splitters: 1 + children.reduce((n, c) => n + c.splitters, 0),
      leaves,
    };
    const cost = (b: Built) => b.splitters + mergersFor(b.leaves);
    if (!best || cost(candidate) < cost(best)) best = candidate;
  }
  return best!;
}

export function planSplit(total: number, dests: Destination[]): SplitPlan {
  const active = dests.filter((d) => d.rate > TOL);
  const sum = active.reduce((s, d) => s + d.rate, 0);
  const fractions = active.map((d) => d.rate / sum);

  let parts: number[] | null = null;
  let exact = false;
  for (const n of SMOOTH) {
    const scaled = fractions.map((f) => f * n);
    if (scaled.every((x) => Math.abs(x - Math.round(x)) < TOL * n && Math.round(x) >= 1)) {
      parts = scaled.map(Math.round);
      exact = true;
      break;
    }
  }
  if (!parts) {
    let bestErr = Infinity;
    for (const n of SMOOTH.filter((x) => x <= MAX_APPROX_PARTS)) {
      const p = roundParts(fractions, n);
      if (!p) continue;
      const err = Math.max(...p.map((c, i) => Math.abs(c / n - fractions[i]) / fractions[i]));
      if (err < bestErr - 1e-9) {
        bestErr = err;
        parts = p;
      }
    }
  }

  const n = parts!.reduce((a, b) => a + b, 0);
  const built = build(n, active.map((d, i) => [d.key, parts![i]]), total / n);
  const delivered = Object.fromEntries(active.map((d, i) => [d.key, (total * parts![i]) / n]));
  const maxError = exact ? 0 : Math.max(...active.map((d) => Math.abs(delivered[d.key] - d.rate) / d.rate));
  const merges = Object.fromEntries([...built.leaves].filter(([, l]) => l > 1));
  return { root: built.node, exact, maxError, delivered, splitters: built.splitters, mergers: mergersFor(built.leaves), merges };
}
