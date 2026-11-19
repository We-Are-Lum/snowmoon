import data from '../../../config/editions-sepolia.json';

/**
 * What an edition page shows that the contract doesn't hold (config/editions-sepolia.json). A null is the owner's to
 * write and shows as a [bracketed] placeholder (src/lib/editions/wording.ts). SAMPLE DATA until Nate picks the pieces.
 */
export type EditionMedia = { type: 'image' | 'video'; url: string; alt: string; width: number; height: number };
export type EarlierVersion = { title: string; url: string; recipeUrl?: string; image?: string } | null;
export type SplitShare = { name: string | null; share: number | null };
export type CatalogEntry = {
  label: string;
  title: string | null;
  test: boolean;
  media: EditionMedia | null;
  line: string | null;
  story: string | null;
  madeBy: string | null;
  builtOn: string | null;
  recipeUrl: string | null;
  storyUrl: string | null;
  /** Who or what to see in the story ("Bai"), for the after-mint button. Null: "See it in the story". */
  storyName: string | null;
  earlier: EarlierVersion[];
  split: SplitShare[];
};

const ENTRIES = (data as unknown as { editions: Record<string, CatalogEntry> }).editions;

export function catalogEntry(id: number): CatalogEntry | null {
  return ENTRIES[String(id)] ?? null;
}

/** Test editions carry "TEST" in their name (handoff): the title, or its placeholder, prefixed. */
export function displayTitle(e: CatalogEntry | null, placeholder: string): string {
  const t = e?.title ?? placeholder;
  return e?.test === false ? t : `TEST · ${t}`;
}

/** The kind of piece, from the label's first part: "Character · Work in progress" → "Character". */
export const kindOf = (e: CatalogEntry | null) => (e?.label ?? '').split('·')[0].trim();
