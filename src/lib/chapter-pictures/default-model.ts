import { CHALLENGE_CLOSED_DEFAULT, DEFAULT_CHALLENGE_MODEL, challengeModelsFor } from '../challenge/models';
import type { Where } from '../images/countries';

/**
 * The model the admins' Model row starts on for the edition's chapter pictures (owner, 2026-11-18: "GPT Image 2.5
 * Sunburst is the default for admins"; principle 3's "open model first" dropped, DRAFT pending his reread): GPT where
 * OpenAI serves the admin (the challenge's country rules), else the open model. FLUX and Gemini stay offered; the
 * maker's notice and the 18+ box are still asked. Pure: check:principles P3e reads it for every kind of place.
 */
export function chapterDefaultModel(where: Where, on?: boolean): string {
  return challengeModelsFor(where, on).some((m) => m.id === CHALLENGE_CLOSED_DEFAULT) ? CHALLENGE_CLOSED_DEFAULT : DEFAULT_CHALLENGE_MODEL;
}

/** What P3e requires of it (and planted faults must break): GPT only where it is offered, else FLUX; FLUX always offered. */
export function chapterDefaultProblems(cases: { where: Where; on: boolean; id: string; offered: string[] }[]): string[] {
  const p: string[] = [];
  for (const c of cases) {
    const want = c.offered.includes(CHALLENGE_CLOSED_DEFAULT) ? CHALLENGE_CLOSED_DEFAULT : DEFAULT_CHALLENGE_MODEL;
    const who = `${c.where.country ?? 'no country'}${c.on ? '' : ', closed models off'}`;
    if (c.id !== want) p.push(`chapter pictures (${who}): the admins' default is ${c.id}, not ${want}`);
    if (!c.offered.includes(DEFAULT_CHALLENGE_MODEL)) p.push(`chapter pictures (${who}): the open model isn't offered`);
  }
  return p;
}
