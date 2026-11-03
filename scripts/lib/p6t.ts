/**
 * P6t (branch remix-model-choice, 2026-11-04): model choice (IMAGES.designs.modelChoice) sends a remixer's prompt and
 * front view to each offered closed model's maker through Vercel AI Gateway. The switch may be on only while Privacy
 * §7 names each of them, with what it receives, how it is kept and that it may not train on it; §4 says a sheet's
 * views may be made with a closed model; and the consent screen names each maker (legal texts describe today).
 * Shared by scripts/check-principles.ts and scripts/test-model-choice.ts.
 */
export interface P6tInput {
  on: boolean;
  providers: string[];
  s4: string;
  s7: string[];
  consent: string;
}

export function p6tProblems(c: P6tInput): string[] {
  if (!c.on) return [];
  const problems: string[] = [];
  for (const n of c.providers) {
    const re = new RegExp(`\\b${n}\\b`);
    const unit = c.s7.find((u) => re.test(u) && /Vercel AI Gateway/.test(u) && /prompt/.test(u));
    if (!unit) problems.push(`IMAGES.designs.modelChoice is on, but Privacy §7 has no item saying ${n} receives a remixer's prompt and pictures through Vercel AI Gateway (docs/legal/remix-model-choice-draft.md); keep the switch off until the owner rereads it`);
    else if (!/\bkeep/.test(unit) || !/\btrain/.test(unit)) problems.push(`Privacy §7's ${n} item does not say how it is kept and that it may not train on them`);
    if (!re.test(c.consent)) problems.push(`IMAGES.designs.modelChoice is on, but the consent screen does not name ${n}`);
  }
  if (!/closed model/i.test(c.s4)) problems.push('IMAGES.designs.modelChoice is on, but Privacy §4 does not say a sheet\'s views may be made with a closed model');
  return problems;
}
