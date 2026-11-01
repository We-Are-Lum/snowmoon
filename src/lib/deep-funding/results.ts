import { DEEP_FUNDING } from '../config';
import { askedNodes, type CreditGraph } from './graph';
import type { CallRecord } from './call';
import { payout, type PayoutResult, type PayoutSettings } from './payout';
import type { NodeAnswer, NodePrompt } from './prompt';
import { averageRuns, creditOf, fittedMix, leaderboard, mix, topWeights, type BoardRow, type GraphAnswers, type JurorAnswer, type ScoreCase, type ScoreSettings } from './scoring';

/**
 * From recorded calls and juror answers to the published results (pure; the runner writes them to a file):
 * the graph, every prompt and raw answer, the jurors' answers by number, the scores, the weights (the top models'
 * average, and the fitted mix for comparison) and each recipient's share, or the refusal when a payout can't be made.
 */

export interface CharacterInput {
  graph: CreditGraph;
  prompts: NodePrompt[];
  calls: CallRecord[];
  jurors: JurorAnswer[];
}

/** One model's answers for a graph: per node, the average of its usable runs. Null if any node has none. */
export function modelAnswers(g: CreditGraph, calls: CallRecord[], model: string): GraphAnswers | null {
  const out: GraphAnswers = {};
  for (const n of askedNodes(g)) {
    const got = calls.filter((c) => c.model === model && c.node === n.id && c.answer).map((c) => ({ [n.id]: c.answer as NodeAnswer }));
    if (!got.length) return null;
    Object.assign(out, averageRuns(got));
  }
  return out;
}

export interface Results {
  made: string;
  settings: { scoreWeights: ScoreSettings['weights']; clamp: number; creditFloor: number; topModels: number; runsPerModel: number; minShare: number; bookRecipient: PayoutSettings['bookRecipient']; lake: string };
  leaderboard: BoardRow[];
  /** Models left out of the board (a node without a usable answer), with why. */
  leftOut: { model: string; character: string; why: string }[];
  weights: { top: Record<string, number>; fitted: { weights: Record<string, number>; loss: number } | null };
  spentUsd: number;
  characters: {
    character: string;
    graph: CreditGraph;
    prompts: { node: string; labels: NodePrompt['labels']; messages: NodePrompt['messages']; schema: NodePrompt['schema'] }[];
    calls: CallRecord[];
    jurors: JurorAnswer[];
    final: { answers: GraphAnswers; credit: Record<string, number> } | null;
    payout: PayoutResult | null;
  }[];
}

export function decide(
  input: CharacterInput[],
  who: Parameters<typeof payout>[2],
  opts: { settings?: ScoreSettings; payout?: PayoutSettings; topModels?: number; made?: string } = {},
): Results {
  const s: ScoreSettings = opts.settings ?? { weights: DEEP_FUNDING.scoreWeights, clamp: DEEP_FUNDING.clamp, creditFloor: DEEP_FUNDING.creditFloor };
  const ps: PayoutSettings = opts.payout ?? { lake: DEEP_FUNDING.lake, bookRecipient: DEEP_FUNDING.bookRecipient, minShare: DEEP_FUNDING.minShare };
  const k = opts.topModels ?? DEEP_FUNDING.topModels;
  const leftOut: Results['leftOut'] = [];
  const cases: ScoreCase[] = input.map((c) => {
    const models: Record<string, GraphAnswers> = {};
    for (const m of [...new Set(c.calls.map((x) => x.model))].sort()) {
      const a = modelAnswers(c.graph, c.calls, m);
      if (a) models[m] = a;
      else leftOut.push({ model: m, character: c.graph.character, why: 'a node without a usable answer' });
    }
    return { graph: c.graph, models, jurors: c.jurors };
  });
  const board = leaderboard(cases, s).filter((r) => Number.isFinite(r.loss));
  const top = board.length ? topWeights(board, k) : {};
  const fitted = board.length ? fittedMix(cases.map((c) => ({ ...c, models: Object.fromEntries(Object.entries(c.models).filter(([m]) => board.some((r) => r.model === m))) })), s) : null;
  return {
    made: opts.made ?? new Date().toISOString(),
    settings: { scoreWeights: s.weights, clamp: s.clamp, creditFloor: s.creditFloor, topModels: k, runsPerModel: DEEP_FUNDING.runsPerModel, minShare: ps.minShare, bookRecipient: ps.bookRecipient, lake: ps.lake },
    leaderboard: board,
    leftOut,
    weights: { top, fitted },
    spentUsd: input.reduce((t, c) => t + c.calls.reduce((a, x) => a + x.costUsd, 0), 0),
    characters: input.map((c, i) => {
      const final = Object.keys(top).length ? mix(cases[i].models, top) : null;
      return {
        character: c.graph.character,
        graph: c.graph,
        prompts: c.prompts.map((p) => ({ node: p.node, labels: p.labels, messages: p.messages, schema: p.schema })),
        calls: c.calls,
        jurors: c.jurors,
        final: final ? { answers: final, credit: Object.fromEntries(creditOf(c.graph, final)) } : null,
        payout: final ? payout(c.graph, final, who, ps) : null,
      };
    }),
  };
}
