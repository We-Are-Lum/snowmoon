/**
 * element_versions.body, by element_type. The database stores jsonb; this file
 * is the one place the shapes are defined.
 */

/**
 * A style or a character sheet (step 4, docs/proposals/style-guides-and-sheets.md). The text is
 * added to every prompt that uses the design and published with it. Pictures (a style's samples, a
 * sheet's views) are AI-generated, kept on the public bucket by sha256, each with its own recipe.
 */
export interface DesignBody {
  /** The design's own name: a style's name, or a fork's new name. Empty for a sheet ("Sheet by @name"). */
  title: string;
  text: string;
  samples: DesignPicture[];
  views: { front?: DesignPicture; side?: DesignPicture; back?: DesignPicture };
  /** The maker's Farcaster name when published (decision 12), else null and the byline is the FID. */
  by_name: string | null;
  by_name_source: 'relay' | 'farcaster-api' | null;
  /** Which parts a model drafted (the project's starting style), or null when all are the person's words. */
  assist: { model: string; drafted: string[]; source?: string } | null;
}

export interface DesignPicture {
  url: string;
  sha256: string;
  /** How the picture was made: the exact prompt, model, endpoint, settings, seed, request id, cost, checks. */
  recipe: {
    prompt: string;
    model: string;
    endpoint: string;
    host: string;
    settings: Record<string, unknown>;
    seed: number | null;
    request_id: string | null;
    cost_usd: number;
    made_at: string;
    width: number;
    height: number;
    references?: { sha256: string }[];
    checks: { prompt: { model: string; verdict: 'ok' }; host_safety_checker: 'passed' };
    assist: { model: string; drafted: string[]; source?: string } | null;
  };
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
