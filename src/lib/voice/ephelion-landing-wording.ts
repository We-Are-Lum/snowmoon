/**
 * The /ephelion landing's words (Nate, 2026-11-25, recording only; plan v3, "New wording"). DRAFT, for Nate's reread.
 * The intro above them is his approved intro (src/components/ephelion-intro.tsx), its first paragraph only: the second
 * was about storyboarding, which is its own challenge later.
 */
export const EPHELION_LANDING = {
  kicker: 'Challenge · Lord Ephelion',
  title: 'Speak as Lord Ephelion',
  learn: 'Learn more about Lord Ephelion',
  learnTitle: 'About Lord Ephelion',
  back: 'Back to the speeches',
  record: 'Record your own',
  listen: 'Listen to his speeches',
  listenShort: 'Listen',
  under: (bookMinutes: number) =>
    `Pick one of his speeches and one of his voices, then perform it: as written, improvised, or with your own edits. Up to 2 minutes (${bookMinutes} for the book's speech). Your voice becomes his.`,
  speechesTitle: 'Listen to his speeches',
  speechesNote: 'Each speech in an AI reading, and the latest take by a person.',
  invented: 'Invented',
  book: 'Book',
  aiReading: 'AI reading',
  noPerson: (voice: string) => `${voice} · no person performing`,
  readingSoon: 'AI reading coming soon',
  // An admin's button on a card with no reading (Nate, 2026-11-26). DRAFT.
  makeReading: (voice: string, credits: number) => `Make the AI reading in ${voice} (≈ ${credits.toLocaleString('en-US')} credits)`,
  makingReading: 'Making the AI reading…',
  adminOnly: 'Admins only. Testers see "AI reading coming soon".',
  readingFailed: 'The reading failed. Try again.',
  noTakes: 'No takes yet. Be the first.',
  playing: 'Playing',
  play: 'Play',
  notAvailable: 'Not available right now',
  imageCredit: 'Lord Ephelion, remixed · @garance',
  imageAlt: 'AI-generated picture of Lord Ephelion, from a remix by @garance',
} as const;
