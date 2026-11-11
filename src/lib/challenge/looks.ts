/**
 * One look line per challenge character (this edition's invention; owner-approved 2026-11-09, shortened the same day), put in every challenge
 * prompt, for every model, right after "{Name} is the person in reference image 1, the main figure." (remixPrompt,
 * src/lib/challenge/make.ts). Public in every recipe. Each starts "Unless the change says otherwise: " and names no
 * studio, film, artist or real person (scripts/test-backstory.ts L1–L3).
 */
export const LOOK_PREFIX = 'Unless the change says otherwise: ';

export const CHARACTER_LOOKS: Readonly<Record<string, string>> = {
  zei: 'Unless the change says otherwise: a man with light golden-tan skin and dark eyes.',
  gladias: 'Unless the change says otherwise: a man with warm light-brown skin, a short beard and dark eyes.',
  bai: 'Unless the change says otherwise: a woman with dark brown skin, tattooed arms and gold earrings.',
  seila: 'Unless the change says otherwise: a woman with deep brown skin and small round gold-rimmed glasses.',
  deluin: 'Unless the change says otherwise: a man with warm tan skin and dark brown eyes.',
  mu: 'Unless the change says otherwise: a woman with medium brown skin and thin red-framed glasses.',
};

/** Always on, after the look line, for every character and model (owner, 2026-11-09, exact; no setting detection). */
export const SCENE_LINE = 'Unless the change says otherwise: one figure, in a scene that suits the change, not a character sheet.';

/** A character's look line, or '' for anyone without one. */
export const lookFor = (slug: string): string => CHARACTER_LOOKS[slug] ?? '';
