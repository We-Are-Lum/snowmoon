import { BOOK, GraphError, type CreditGraph } from './graph';
import type { NodeAnswer } from './prompt';

/**
 * The deep funding test's scoring (docs/proposals/deep-funding-runner.md), pure functions.
 *
 * - A model's answers for one graph: for each version, its new share and how the rest divides among its parents.
 *   Its three runs are averaged (averageRuns): the mean new share, and the mean of each parent's share.
 * - Credit (creditOf): the final's whole credit (1) flows down the graph. Each version keeps its new share of what
 *   reaches it and passes the rest to its parents in the answer's split. The book keeps all that reaches it.
 * - Comparisons ("for the final, which mattered more, A or B, and how many times more?"): the juror's log-ratio is
 *   ln(times) for A, or -ln(times) for B; the model's is ln(credit A / credit B), each credit floored at
 *   DEEP_FUNDING.creditFloor. The compare loss is the mean squared gap.
 * - Originality ("how much of this version is new?", a share in 0..1): both shares are clamped to
 *   [clamp, 1 - clamp] and turned into log-odds, ln(s / (1 - s)); the originality loss is the mean squared gap.
 * - Each model's loss is weights.compare × compare loss + weights.originality × originality loss
 *   (DEEP_FUNDING.scoreWeights, a setting; equal by default). If there are no answers of one kind, the other kind's
 *   loss is used alone. Lower is better; the leaderboard is sorted by it.
 * - Final weights: the average of the top models' answers (topAverage), and, for comparison, the fitted mix: the
 *   weights over all models (each ≥ 0, adding up to 1) whose mixed answers have the lowest loss (fittedMix).
 */

export type GraphAnswers = Record<string, NodeAnswer>;

export type JurorAnswer =
  | { juror: number; character: string; kind: 'compare'; a: string; b: string; choice: 'a' | 'b'; times: number }
  | { juror: number; character: string; kind: 'originality'; node: string; share: number };

export interface ScoreSettings {
  weights: { compare: number; originality: number };
  clamp: number;
  creditFloor: number;
}

/** One character: its graph, each model's answers (runs already averaged), and the jurors' answers. */
export interface ScoreCase {
  graph: CreditGraph;
  models: Record<string, GraphAnswers>;
  jurors: JurorAnswer[];
}

export function averageRuns(runs: GraphAnswers[]): GraphAnswers {
  if (!runs.length) throw new Error('no runs to average');
  const out: GraphAnswers = {};
  for (const node of Object.keys(runs[0])) {
    const got = runs.map((r) => r[node]).filter(Boolean);
    const parents: Record<string, number> = {};
    for (const p of Object.keys(got[0].parents)) parents[p] = got.reduce((s, a) => s + (a.parents[p] ?? 0), 0) / got.length;
    const sum = Object.values(parents).reduce((a, b) => a + b, 0);
    for (const p of Object.keys(parents)) parents[p] = sum > 0 ? parents[p] / sum : 1 / Object.keys(parents).length;
    out[node] = { newShare: got.reduce((s, a) => s + a.newShare, 0) / got.length, parents };
  }
  return out;
}

/** Nodes in an order where every child comes before its parents (the final first, the book last). */
export function topoOrder(g: CreditGraph): string[] {
  const seen = new Set<string>();
  const post: string[] = [];
  const parents = new Map(g.nodes.map((n) => [n.id, n.parents]));
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const p of parents.get(id) ?? []) visit(p);
    post.push(id);
  };
  visit(g.final);
  return post.reverse();
}

/** The share of the final's credit each node keeps (adds up to 1; the book keeps what reaches it). */
export function creditOf(g: CreditGraph, answers: GraphAnswers): Map<string, number> {
  const reach = new Map<string, number>([[g.final, 1]]);
  const kept = new Map<string, number>();
  for (const id of topoOrder(g)) {
    const m = reach.get(id) ?? 0;
    const node = g.nodes.find((n) => n.id === id)!;
    if (id === BOOK || node.kind === 'book') {
      kept.set(id, (kept.get(id) ?? 0) + m);
      continue;
    }
    const a = answers[id];
    if (!a) throw new GraphError(`no answer for ${id}`);
    kept.set(id, m * a.newShare);
    const split = node.parents.length === 1 ? { [node.parents[0]]: 1 } : a.parents;
    for (const p of node.parents) reach.set(p, (reach.get(p) ?? 0) + m * (1 - a.newShare) * (split[p] ?? 0));
  }
  return kept;
}

export const clampShare = (s: number, c: number) => Math.min(1 - c, Math.max(c, s));
export const logOdds = (s: number) => Math.log(s / (1 - s));

/** The juror's ln(A / B). */
export const jurorLogRatio = (j: { choice: 'a' | 'b'; times: number }) => (j.choice === 'a' ? 1 : -1) * Math.log(j.times);

export interface CaseGaps {
  compare: number[];
  originality: number[];
}

/** The squared gaps of one model's answers against the jurors, for one graph. */
export function gaps(g: CreditGraph, answers: GraphAnswers, jurors: JurorAnswer[], s: ScoreSettings): CaseGaps {
  const credit = creditOf(g, answers);
  const out: CaseGaps = { compare: [], originality: [] };
  for (const j of jurors) {
    if (j.kind === 'compare') {
      const ca = Math.max(credit.get(j.a) ?? 0, s.creditFloor);
      const cb = Math.max(credit.get(j.b) ?? 0, s.creditFloor);
      out.compare.push((Math.log(ca / cb) - jurorLogRatio(j)) ** 2);
    } else {
      const m = answers[j.node]?.newShare;
      if (m === undefined) throw new GraphError(`no answer for ${j.node}`);
      out.originality.push((logOdds(clampShare(m, s.clamp)) - logOdds(clampShare(j.share, s.clamp))) ** 2);
    }
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Combines the two means with the weights; a kind with no answers is left out. */
export function combine(compare: number, originality: number, w: ScoreSettings['weights']): number {
  const hasC = Number.isFinite(compare);
  const hasO = Number.isFinite(originality);
  if (hasC && hasO) return (w.compare * compare + w.originality * originality) / (w.compare + w.originality);
  if (hasC) return compare;
  if (hasO) return originality;
  return NaN;
}

export interface BoardRow {
  model: string;
  rank: number;
  compare: number;
  originality: number;
  loss: number;
  answers: { compare: number; originality: number };
}

/** The loss of one set of answers per case (pooled over every juror answer of every character). */
function lossOf(cases: ScoreCase[], answersFor: (c: ScoreCase) => GraphAnswers, s: ScoreSettings) {
  const all: CaseGaps = { compare: [], originality: [] };
  for (const c of cases) {
    const g = gaps(c.graph, answersFor(c), c.jurors, s);
    all.compare.push(...g.compare);
    all.originality.push(...g.originality);
  }
  const compare = mean(all.compare);
  const originality = mean(all.originality);
  return { compare, originality, loss: combine(compare, originality, s.weights), n: { compare: all.compare.length, originality: all.originality.length } };
}

/** Every model, best (lowest loss) first; ties by model id, so the order never changes between runs. */
export function leaderboard(cases: ScoreCase[], s: ScoreSettings): BoardRow[] {
  const ids = [...new Set(cases.flatMap((c) => Object.keys(c.models)))].sort();
  const rows = ids
    .filter((id) => cases.every((c) => c.models[id]))
    .map((id) => {
      const r = lossOf(cases, (c) => c.models[id], s);
      return { model: id, rank: 0, compare: r.compare, originality: r.originality, loss: r.loss, answers: r.n };
    });
  rows.sort((a, b) => a.loss - b.loss || a.model.localeCompare(b.model));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** A weighted mix of several models' answers for one graph (weights add up to 1). */
export function mix(models: Record<string, GraphAnswers>, weights: Record<string, number>): GraphAnswers {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const total = ids.reduce((s, id) => s + weights[id], 0);
  if (!ids.length || !(total > 0)) throw new Error('no weight to mix');
  const out: GraphAnswers = {};
  for (const node of Object.keys(models[ids[0]])) {
    const parents: Record<string, number> = {};
    let newShare = 0;
    for (const id of ids) {
      const a = models[id][node];
      if (!a) throw new GraphError(`model ${id} has no answer for ${node}`);
      const w = weights[id] / total;
      newShare += w * a.newShare;
      for (const [p, v] of Object.entries(a.parents)) parents[p] = (parents[p] ?? 0) + w * v;
    }
    out[node] = { newShare, parents };
  }
  return out;
}

/** The equal-weight average of the top `k` models on the board. */
export function topWeights(board: BoardRow[], k: number): Record<string, number> {
  const top = board.slice(0, k);
  if (!top.length) throw new Error('no models on the board');
  return Object.fromEntries(top.map((r) => [r.model, 1 / top.length]));
}

/**
 * The fitted mix: weights over all models (≥ 0, adding up to 1) with the lowest pooled loss of the mixed answers.
 * A deterministic search on the simplex: move a step of weight from one model to another while that lowers the loss,
 * halving the step down to 0.001. Starts from equal weights.
 */
export function fittedMix(cases: ScoreCase[], s: ScoreSettings): { weights: Record<string, number>; loss: number } {
  const ids = [...new Set(cases.flatMap((c) => Object.keys(c.models)))].filter((id) => cases.every((c) => c.models[id])).sort();
  if (!ids.length) throw new Error('no models');
  let w = Object.fromEntries(ids.map((id) => [id, 1 / ids.length]));
  const L = (ws: Record<string, number>) => lossOf(cases, (c) => mix(c.models, ws), s).loss;
  let best = L(w);
  for (let step = 0.1; step >= 0.001; step /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const from of ids) {
        for (const to of ids) {
          if (from === to || w[from] <= 0) continue;
          const d = Math.min(step, w[from]);
          const trial = { ...w, [from]: w[from] - d, [to]: w[to] + d };
          const l = L(trial);
          if (l < best - 1e-12) {
            w = trial;
            best = l;
            improved = true;
          }
        }
      }
    }
  }
  return { weights: Object.fromEntries(ids.map((id) => [id, Math.round(w[id] * 1e6) / 1e6])), loss: best };
}
