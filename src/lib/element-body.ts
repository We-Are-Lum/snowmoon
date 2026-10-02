/**
 * element_versions.body, by element_type. The database stores jsonb; this file
 * is the one place the shapes are defined.
 */

export interface DesignBody {
  description: string;
}

export interface TextBody {
  text: string;
}

export interface LetteringItem {
  kind: 'caption' | 'speech' | 'thought' | 'sfx';
  /** The line as shown, in its own language. */
  text: string;
  /** Language of `text`: 'en' for English, 'dz' for Dzegoban. */
  lang: 'en' | 'dz';
  /** Translation shown with a non-English line (e.g. a Dzegoban line's English), or null. */
  gloss: string | null;
  speaker_entity_id: string | null;
  /** Position and width as fractions of the image, 0 to 1. */
  x: number;
  y: number;
  w: number;
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
