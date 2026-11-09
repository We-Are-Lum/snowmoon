/**
 * One look line per challenge character (this edition's invention; owner-approved 2026-11-09), put in every challenge
 * prompt, for every model, right after "{Name} is the person in reference image 1, the main figure." (remixPrompt,
 * src/lib/challenge/make.ts). Public in every recipe. Each starts "Unless the change says otherwise: " and names no
 * studio, film, artist or real person (scripts/test-backstory.ts L1–L3).
 */
export const LOOK_PREFIX = 'Unless the change says otherwise: ';

export const CHARACTER_LOOKS: Readonly<Record<string, string>> = {
  zei: 'Unless the change says otherwise: a young man of eighteen, slim and of medium height, light golden-tan skin, spiky black hair with close-cut sides and one teal-blue streak, dark eyes.',
  gladias: 'Unless the change says otherwise: a man of about forty, slim and of medium height, warm light-brown skin, short straight black hair, a neatly trimmed short beard, dark eyes.',
  bai: 'Unless the change says otherwise: a young woman of about eighteen, tall and athletic, dark brown skin, one side of her head shaved and long magenta hair swept over the other, tattooed arms, gold earrings.',
  seila: 'Unless the change says otherwise: a woman in her late thirties, tall and slender, deep brown skin, shoulder-length black braids gathered back, small round gold-rimmed glasses.',
  deluin: 'Unless the change says otherwise: a young man of about eighteen, tall and long-limbed, warm tan skin, straight shoulder-length black hair, dark brown eyes, a calm, slightly serious face.',
  mu: 'Unless the change says otherwise: a woman in her early sixties, small and wiry, medium brown skin, short silver hair in a sharp asymmetric cut, thin red-framed glasses.',
};

/** A character's look line, or '' for anyone without one. */
export const lookFor = (slug: string): string => CHARACTER_LOOKS[slug] ?? '';
