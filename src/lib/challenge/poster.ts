/**
 * The challenge poster as the link preview, only while entries are open (owner, 2026-11-12): the 1200×800 for
 * Farcaster's embed, the 1200×630 for Open Graph and the X card. AI-generated (GPT Image 2.5, a closed model by
 * OpenAI); its recipe (model, prompt, references, cost) is public/challenge/poster-recipe.json. Before or after the
 * window, the site's own card as before. The page revalidates every 60 s, so the switch follows within a minute.
 */
export const POSTER = {
  embed: '/challenge/poster-1200x800.jpg',
  og: '/challenge/poster-1200x630.jpg',
  alt: 'AI-generated poster of the seven challenge characters under a pale moon, for the Snowmoon remix challenge',
} as const;
