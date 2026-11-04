/**
 * P6t (branch remix-model-choice, 2026-11-04): model choice (IMAGES.designs.modelChoice) sends a remixer's prompt and
 * front view to each offered closed model's maker through Vercel AI Gateway. The switch may be on only while Privacy
 * §7 names each of them, with what it receives, how long it may keep it (its retention words, in the sentence that
 * names it) and that it may not train on it; §4 says a sheet's views may be made with a closed model; and each maker
 * has its notice (src/lib/legal.ts MODEL_NOTICES), which is that maker's consent (owner, 2026-11-04, choice 6.1: not a
 * new consent version for everyone). Legal texts describe today.
 * Shared by scripts/check-principles.ts and scripts/test-model-choice.ts.
 */
export interface P6tInput {
  on: boolean;
  providers: string[];
  /** Each maker's retention words (src/lib/config.ts CLOSED_PROVIDERS), which its §7 item must say. */
  retention: Record<string, string>;
  s4: string;
  s7: string[];
  /** Each maker's notice words (label, title, text), by maker. */
  notices: Record<string, string>;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function p6tProblems(c: P6tInput): string[] {
  if (!c.on) return [];
  const problems: string[] = [];
  for (const n of c.providers) {
    const re = new RegExp(`\\b${n}\\b`);
    const unit = c.s7.find((u) => re.test(u) && /Vercel AI Gateway/.test(u) && /prompt/.test(u) && /\bremix a character/.test(u));
    if (!unit) problems.push(`IMAGES.designs.modelChoice is on, but Privacy §7 has no item saying ${n} receives a remixer's prompt and pictures through Vercel AI Gateway (docs/legal/remix-model-choice-draft.md); keep the switch off until the owner rereads it`);
    else if (!/\bkeep/.test(unit) || !/\btrain/.test(unit)) problems.push(`Privacy §7's ${n} item does not say how it is kept and that it may not train on them`);
    else if (!c.retention[n] || !new RegExp(`\\b${n}\\b[^;]*${esc(c.retention[n])}`).test(unit)) problems.push(`Privacy §7 does not give ${n}'s retention ("${c.retention[n] ?? '?'}", CLOSED_PROVIDERS) in its sentence about ${n}`);
    if (!c.notices[n] || !re.test(c.notices[n])) problems.push(`IMAGES.designs.modelChoice is on, but ${n} has no notice naming it (MODEL_NOTICES), and the notice is its consent`);
  }
  if (!/closed model/i.test(c.s4)) problems.push('IMAGES.designs.modelChoice is on, but Privacy §4 does not say a sheet\'s views may be made with a closed model');
  return problems;
}

/**
 * P6j's closed-model half (owner, 2026-11-04, choice 6.1): for a closed model, the maker's notice is the consent, so it
 * is compared with what that maker receives. Each offered maker's notice names exactly the maker and Vercel AI Gateway
 * (the route) among the outside services, says it receives the prompt and the front view, and gives its retention words.
 * `named` is P6g's vocabulary (check-principles' SERVICES).
 */
export interface NoticeInput {
  makers: string[];
  notices: Record<string, string>;
  named: (text: string) => string[];
  retention: Record<string, string>;
}
export function closedNoticeProblems(c: NoticeInput): string[] {
  const problems: string[] = [];
  for (const m of c.makers) {
    const t = c.notices[m];
    if (!t) {
      problems.push(`${m}'s closed models have no notice (MODEL_NOTICES), and the notice is their consent`);
      continue;
    }
    const want = new Set([m, 'Vercel AI Gateway']), got = new Set(c.named(t));
    for (const s of want) if (!got.has(s)) problems.push(`${m}'s notice does not name ${s}, which receives the prompt when a remixer picks ${m}'s model`);
    for (const s of got) if (!want.has(s)) problems.push(`${m}'s notice names ${s}, which receives nothing from ${m}'s model`);
    if (!/\bprompt\b/.test(t) || !/\bfront view\b/.test(t)) problems.push(`${m}'s notice does not say ${m} receives the prompt and the front view`);
    if (!c.retention[m] || !t.includes(c.retention[m])) problems.push(`${m}'s notice does not give its retention ("${c.retention[m] ?? '?'}", CLOSED_PROVIDERS)`);
  }
  return problems;
}
