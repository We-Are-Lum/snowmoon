import 'server-only';
import sharp from 'sharp';

/**
 * The ready pictures a take can use (Nate, 2026-11-26: "Presets become ready-made pictures … listed under 'Choose' with
 * the approved set, free and instant"). Two lists, in config here so the images session's approved set can be dropped
 * in by changing this file only:
 * - SET: approved pictures of Lord Ephelion, each a published picture on the site by its version id (the database
 *   checks it is of him: studio.picture_is_of). PLACEHOLDER until the images session's set is approved: for now it holds
 *   only Garance's remix entry 70762e34, the challenge page's picture, marked as such on screen.
 * - SCENES: the three ready-made scenes (plan v3). PLACEHOLDER pictures until the images session's scene pictures are
 *   approved: plain cards drawn here ("Picture to come"), no model and no cost, labelled on screen and in the recipe.
 */
export const TAKE_PICTURES = {
  /** True while either list is a placeholder: the entry step says so. */
  placeholder: true,
  set: [{ id: 'garance-remix', versionId: '70762e34-5d10-4c73-96cd-dba19ef956c6', title: 'Lord Ephelion, remixed', by: '@garance', placeholder: true }],
  scenes: [
    { id: 'study', title: 'In his study, in a nice sweater, sipping tea', placeholder: true },
    { id: 'commercial', title: 'In formal wear, on a TV commercial', placeholder: true },
    { id: 'crowd', title: 'Giving a speech in front of a crowd', placeholder: true },
  ],
} as const;
export type SceneId = (typeof TAKE_PICTURES.scenes)[number]['id'];
export const sceneById = (id: string) => TAKE_PICTURES.scenes.find((s) => s.id === id) ?? null;
export const setById = (id: string) => TAKE_PICTURES.set.find((s) => s.id === id || s.versionId === id) ?? null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A ready-made scene's placeholder card (1536 x 1024, jpg: 3:2, as embeds show it), the same bytes every time for the same scene. */
export async function scenePlaceholder(id: string): Promise<Buffer | null> {
  const s = sceneById(id);
  if (!s) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">
  <rect width="100%" height="100%" fill="#060608"/>
  <rect x="48" y="48" width="1440" height="928" fill="none" stroke="#6A675F" stroke-width="3" stroke-dasharray="18 12"/>
  <text x="96" y="150" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#B4B3BA" letter-spacing="4">PICTURE TO COME · A READY-MADE SCENE</text>
  <text x="96" y="500" font-family="Georgia, serif" font-size="56" fill="#E7E4DD">${esc(s.title)}</text>
  <text x="96" y="920" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#B4B3BA">A placeholder card until the scene pictures are approved: no model was called.</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}
