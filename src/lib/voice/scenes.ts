/**
 * "Choose his scene" (Nate, 2026-11-26; plan v3, PR 3): the three ready-made scenes the images session is making from
 * Lord Ephelion's character profile. Until that set is approved, every scene shows a placeholder, marked as one, never
 * an AI picture presented as final. One entry per scene: to drop the approved set in, set each entry's `picture` (its
 * file on the site's own picture host, its alt text and where its recipe is) and nothing else changes.
 * "Describe your own" (the one free picture) and paying for more stay off; they are not here.
 */
export interface ScenePicture {
  /** On the site's own picture host (no third-party requests, principle 6). */
  src: string;
  alt: string;
  /** Where the picture's recipe is published (principle 1). */
  recipe: string;
}
export interface Scene {
  id: 'study' | 'commercial' | 'crowd';
  title: string;
  /** Null until the images session's set is approved: the card and the preview show the placeholder. */
  picture: ScenePicture | null;
}

export const SCENES: readonly Scene[] = [
  { id: 'study', title: 'In his study, in a nice sweater, sipping tea', picture: null },
  { id: 'commercial', title: 'In formal wear, on a TV commercial', picture: null },
  { id: 'crowd', title: 'Giving a speech in front of a crowd', picture: null },
] as const;

/** The scene chosen last, remembered on this device only (a setting, as Privacy §3's "a few other settings of yours"). */
export const SCENE_KEY = 'snowmoon.ephelion.scene';
export const sceneById = (id: string | null) => SCENES.find((s) => s.id === id) ?? SCENES[0];
