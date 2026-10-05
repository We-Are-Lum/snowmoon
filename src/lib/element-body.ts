/**
 * element_versions.body, by element_type. The database stores jsonb; this file
 * is the one place the shapes are defined.
 */

export interface DesignBody {
  description: string;
}

export interface TextBody {
  text: string;
  /** Set when the text element is a saved quote card (brief §4f). */
  card?: QuoteCardSpec;
}

/** Everything needed to redraw a quote card; the quote is checked against the book. */
export interface QuoteCardSpec {
  kind: 'quote_card';
  chapter: number;
  /** Block idx range the quote comes from. */
  from: number;
  to: number;
  /** The exact quoted words, or null for the whole range. */
  q: string | null;
  /** Seeded image id (content/snowmoon/illustrations/published.json), or null. */
  img: string | null;
}

export interface LetteringItem {
  /** sign: writing on an object in the scene (a sheet, a banner, a poster). */
  kind: 'caption' | 'speech' | 'thought' | 'sfx' | 'sign';
  /** The line as shown, in its own language. */
  text: string;
  /** Language of `text`: 'en' for English, 'dz' for Dzegoban. */
  lang: 'en' | 'dz';
  /** Translation shown with a non-English line (e.g. a Dzegoban line's English), or null. */
  gloss: string | null;
  speaker_entity_id: string | null;
  /** Top-left corner and width of the text box, as fractions of the image, 0 to 1. */
  x: number;
  y: number;
  w: number;
  /** Font size as a fraction of the image width. Optional; otherwise fitted to w. */
  size?: number;
  /** Rotation in degrees, clockwise, for text on tilted objects. Optional. */
  rotate?: number;
}

export interface ImageBody {
  lettering: LetteringItem[];
}

/** A set piece rendered in code from a template in this repo (screens, boards, maps). */
export interface RenderBody {
  /** Template path in the repo, e.g. "src/templates/minpentai-board.tsx". */
  template: string;
  /** Commit of the template used, so an old render can be reproduced exactly. */
  template_commit: string;
  /** Everything the template needs to draw this render. */
  state: Record<string, unknown>;
}

export type ElementBody =
  | { element_type: 'design'; body: DesignBody }
  | { element_type: 'text'; body: TextBody }
  | { element_type: 'image'; body: ImageBody }
  | { element_type: 'render'; body: RenderBody }
  | { element_type: 'clip'; body: Record<string, unknown> };
