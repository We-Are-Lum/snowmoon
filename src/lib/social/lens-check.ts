import 'server-only';
import type postgres from 'postgres';
import { SOCIAL_SIGN_IN } from '../config';
import { currentDecision, decide } from '../checks/decisions';
import { lensScoreNow } from './lens';

/**
 * Lens's check (owner, 2026-11-04): variant B, "look up the Lens score at Generate, the same moment as Neynar", and
 * "store the decision, not the score". Built on the shared store (src/lib/checks/decisions.ts, branch
 * check-decisions; network 'lens', the account id is the Lens address, lowercase):
 * - a current decision (a pass for 90 days, a fail for 24 hours, under today's threshold) is used as it is, with no
 *   call to Lens;
 * - only at Generate (`lookUp`), and only when there is none, Lens's API is asked for the score, the decision is made
 *   (score at least SOCIAL_SIGN_IN.lens.minScore) and stored with the threshold it used;
 * - a new threshold is a new rule ('lens-score>=<n>'), so a decision made under the old one isn't current and the
 *   account is asked again at its next Generate;
 * - a report or a hidden picture withdraws the pass (the store's markForRecheck / recheckMaker).
 * The score itself is never stored, logged or returned: callers get passed or not.
 */
type Sql = postgres.Sql;

/** The rule a Lens decision is made under, as the store keeps it. */
export const lensRule = (min: number) => `lens-score>=${min}`;

export type LensOutcome = 'passed' | 'below' | 'unknown' | 'unreachable';

export async function lensDecision(
  sql: Sql,
  account: string,
  opts: { lookUp: boolean; score?: (account: string) => Promise<number | null> },
): Promise<LensOutcome> {
  const min = SOCIAL_SIGN_IN.lens.minScore;
  if (min === null) return 'below';
  const rule = lensRule(min);
  let d: Awaited<ReturnType<typeof currentDecision>>;
  try {
    d = await currentDecision(sql, 'lens', account, rule);
  } catch {
    return 'unreachable';
  }
  if (d) return d.passed ? 'passed' : 'below';
  // No current decision: only Generate asks Lens (never a page view or the maker opening).
  if (!opts.lookUp) return 'unknown';
  const s = await (opts.score ?? lensScoreNow)(account);
  if (s === null) return 'unreachable';
  const passed = s >= min;
  await decide(sql, 'lens', account, passed, rule);
  return passed ? 'passed' : 'below';
}
