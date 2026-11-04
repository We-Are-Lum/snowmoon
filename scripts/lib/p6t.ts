/**
 * P6t (branch remix-model-choice, 2026-11-04): model choice (IMAGES.designs.modelChoice) sends a remixer's prompt and
 * front view to each offered closed model's maker through Vercel AI Gateway. The switch may be on only while Privacy
 * §7 names each of them, with what it receives, how long it may keep it (its retention words, in the sentence that
 * names it) and that it may not train on it; §4 says a sheet's views may be made with a closed model; and the consent
 * screen (own-words-v5, for everyone: owner, 2026-11-04, choice 6.1 reversed) says what each maker receives
 * (consentClosedProblems, also P6j's closed half). Legal texts describe today. The closed models' notice is a notice,
 * not the consent. Shared by scripts/check-principles.ts and scripts/test-model-choice.ts.
 */
export interface P6tInput {
  on: boolean;
  providers: string[];
  /** Each maker's retention words (src/lib/config.ts CLOSED_PROVIDERS), which its §7 item must say. */
  retention: Record<string, string>;
  s4: string;
  s7: string[];
  consent: string;
}

export function p6tProblems(c: P6tInput): string[] {
  if (!c.on) return [];
  const problems: string[] = [];
  for (const n of c.providers) {
    const re = new RegExp(`\\b${n}\\b`);
    // The remixers' item, not the project's own bases item (closed-model-bases), which names the same makers.
    const unit = c.s7.find((u) => re.test(u) && /Vercel AI Gateway/.test(u) && /prompt/.test(u) && /\bremix a character/.test(u));
    if (!unit) problems.push(`IMAGES.designs.modelChoice is on, but Privacy §7 has no item saying ${n} receives a remixer's prompt and pictures through Vercel AI Gateway (docs/legal/remix-model-choice-draft.md); keep the switch off until the owner rereads it`);
    else if (!/\bkeep/.test(unit) || !/\btrain/.test(unit)) problems.push(`Privacy §7's ${n} item does not say how it is kept and that it may not train on them`);
    else if (!c.retention[n] || !new RegExp(`\\b${n}\\b[^;]*${c.retention[n].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(unit)) problems.push(`Privacy §7 does not give ${n}'s retention ("${c.retention[n] ?? '?'}", CLOSED_PROVIDERS) in its sentence about ${n}`);
  }
  problems.push(...consentClosedProblems(c.consent, c.providers, c.retention));
  if (!/closed model/i.test(c.s4)) problems.push('IMAGES.designs.modelChoice is on, but Privacy §4 does not say a sheet\'s views may be made with a closed model');
  return problems;
}

/**
 * The consent screen against what each closed model's maker receives (owner, 2026-11-04: one new consent version,
 * own-words-v5, for everyone, with the closed-model sentence). Each maker is named in a sentence that says it receives
 * the prompt and the front view, and gives its retention words (CLOSED_PROVIDERS), the same words as Privacy §7 and the
 * notice.
 */
export function consentClosedProblems(consent: string, makers: string[], retention: Record<string, string>): string[] {
  const problems: string[] = [];
  const sentences = consent.split(/(?<=[.;])\s+/);
  for (const m of makers) {
    const re = new RegExp(`\\b${m}\\b`);
    if (!sentences.some((u) => re.test(u) && /\bprompt\b/.test(u) && /\bfront view\b/.test(u))) problems.push(`the consent screen does not say ${m} receives the prompt and the front view when a remixer picks its closed model`);
    if (!retention[m] || !sentences.some((u) => re.test(u) && u.includes(retention[m]))) problems.push(`the consent screen does not give ${m}'s retention ("${retention[m] ?? '?'}", CLOSED_PROVIDERS)`);
  }
  return problems;
}
