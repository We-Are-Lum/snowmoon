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

/**
 * One look line per base (owner, 2026-11-11: a base whose skin differs from its character's line was being pulled toward
 * the wrong skin), keyed by the base's front picture (sha256), so a base has its line before it is published. Each is
 * read from that base's own generation prompt (its skin, hair and eyes; clothes and details stay out, as in the character
 * lines). A remix uses the line of the base its line reaches (baseFrontOf, src/lib/challenge/pictures.ts); a base with
 * no line here uses its character's (CHARACTER_LOOKS), which was written from the character's default base. DRAFT
 * wording until the owner approves each line.
 */
export const BASE_LOOKS: Readonly<Record<string, string>> = {
  // Gladias: the first look (light olive) and look a (deep brown); look b, the default, keeps the character's line.
  aff6f24f59e5a2147f25cad9492499c1cff3770b66dd3a0973f76e84db7d9fbd: 'Unless the change says otherwise: a man with light olive skin, short wavy chestnut-brown hair, a short beard and hazel eyes.',
  bca41e700fdb72334d08334843e53c78381f824e0f2ea7db57eeef31dc54c4b6: 'Unless the change says otherwise: a man with deep brown skin, short curly black hair, a short beard and dark brown eyes.',
  // Deluin: the first look (pale) and look a (deep brown); look b, the default, keeps the character's line.
  ed9362662479c88e3ed88abd983031679fa2fb24f89d4fb69d0b1f247c5fe453: 'Unless the change says otherwise: a man with pale skin, wavy shoulder-length light-brown hair and grey-green eyes.',
  d2ebbc5fc7afc9746fc68c2ff3a6035cf885f75e8d7f5939bc4e5bbd66717b12: 'Unless the change says otherwise: a man with deep brown skin, shoulder-length black hair in loose twists and dark brown eyes.',
  // The owner's picks of 2026-11-11 (Bases Pick 2), lines ready for when they are published.
  '98620d0109e2354bddc269471ec59f8a23089ad9bce6a457a0d09091262f4aee': 'Unless the change says otherwise: a man with deep brown skin, short black twists with one electric-blue streak, and dark eyes.',
  '88de0a4709d0579fb06d2e1352098b01d25e7e2f7879e3a2b70384343422789a': 'Unless the change says otherwise: a man with fair skin, spiky ash-brown hair with one electric-blue streak, and grey eyes.',
  a4f423406eb2a73125e242e9e36d90cf8c20a1bb40ea2553058431b39e2d7274: 'Unless the change says otherwise: a woman with light olive skin, a long straight black ponytail dyed magenta at the ends, tattooed arms and gold earrings.',
  '259315795906cf7b5c994eb63dbc412657080fb3f91bc5b09486711a3e7dc903': 'Unless the change says otherwise: a woman with fair freckled skin, a high ponytail of auburn curls dyed magenta at the ends, tattooed arms and gold earrings.',
  '22ef5e6602ab1167c02befaaa331fde0e3a36990166b7e3fa75a3d2950545c3c': 'Unless the change says otherwise: a woman with light tan skin, shoulder-length wavy black hair and small round gold-rimmed glasses.',
  '5a59f88f1665e1c56104e11ae168de523aae4a168be68ff41f778e7cfb43bde2': 'Unless the change says otherwise: a woman with fair skin, shoulder-length auburn hair in a loose braid, green eyes and small round gold-rimmed glasses.',
  '0217a068691527f6ab30a82b71fa346b5d636d84f003bd8f61ff0ed83ee95ff9': 'Unless the change says otherwise: a woman with pale skin, short silver hair in a sharp asymmetric cut and thin red-framed glasses.',
  '79d25dba94f2486ee899f4b189021ecfaa6778466ce1853f4f4412f130114b52': 'Unless the change says otherwise: a woman with deep brown skin, short silver coils and thin red-framed glasses.',
};

/** The look line for a picture whose line reaches the base with this front (sha256), or its character's line. */
export const lookForBase = (slug: string, baseFront: string | null): string => (baseFront ? BASE_LOOKS[baseFront.toLowerCase()] : undefined) ?? lookFor(slug);

/**
 * Walks a picture's line back to its base (pure, so it is tested without a database): `pictureFrom` gives the version a
 * challenge picture started from (undefined when the id is not a challenge picture), `sheetFront` a sheet's front sha256.
 * Up to 64 steps; null when the line reaches no sheet.
 */
export async function walkToBase(start: string, pictureFrom: (id: string) => Promise<string | null | undefined>, sheetFront: (id: string) => Promise<string | null>): Promise<string | null> {
  let id: string | null = start;
  for (let step = 0; id && step < 64; step++) {
    const from = await pictureFrom(id);
    if (from === undefined) return sheetFront(id);
    id = from;
  }
  return null;
}

/** Always on, after the look line, for every character and model (owner, 2026-11-09, exact; no setting detection). */
export const SCENE_LINE = 'Unless the change says otherwise: one figure, in a scene that suits the change, not a character sheet.';

/** A character's look line, or '' for anyone without one. */
export const lookFor = (slug: string): string => CHARACTER_LOOKS[slug] ?? '';
