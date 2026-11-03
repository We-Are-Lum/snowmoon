/**
 * "Ask for help"'s words on screen (docs/proposals/sheet-help.md). Model-drafted by the coding agent (Anthropic's
 * Claude), 2026-11-02, for the owner to rewrite; except `label`, the owner's own words (2026-10-31: "includes words from
 * AI suggestions"). Pure, so the page, the form and the tests share it.
 */
export const SHEET_HELP_WORDING = {
  open: 'Ask for help',
  optional: 'Optional. It suggests a change to one part of your text at a time; you accept or reject it. Entries are judged the same either way.',
  sends: (route: string, days: number) => `Your message, this text, the rest of the recipe and what the book says about the character go to ${route}, set to keep nothing. We keep no copy of the conversation; we keep a fingerprint of each change it suggests, with your Farcaster ID, for ${days} days, so that if you publish those words the recipe says so.`,
  placeholder: 'What would you like to change? (e.g. “her coat feels too modern”)',
  send: 'Ask',
  asking: 'Thinking…',
  before: 'Now',
  after: 'Suggested',
  adds: 'Adds at the end',
  accept: 'Accept',
  reject: 'Reject',
  accepted: 'Accepted: your text changed.',
  rejected: 'Rejected: your text is as it was.',
  stale: 'Your text changed since this suggestion. Ask again.',
  declined: 'It couldn’t suggest something it is allowed to: picture words for one part, never story lines. Try asking differently.',
  limit: (n: number) => `That’s ${n} messages today. More tomorrow (00:00 UTC).`,
  spend: 'Help is paused for today: the site’s daily budget for it is used up.',
  left: (n: number) => `${n} left today`,
  model: (name: string) => `${name} · open weights, Apache-2.0 · AI suggestions`,
  /** The owner's words (2026-10-31). Shown on the sheet's page and in each picture's recipe. */
  label: 'includes words from AI suggestions',
  /** On the sheet's page, above the pictures. */
  pageLine: 'Its text includes words from AI suggestions (“Ask for help”).',
  /** In each picture's "How it was made" (src/lib/images/recipe-lines.ts). */
  recipeLine: (model: string) => `The prompt includes words from AI suggestions (“Ask for help”, ${model}).`,
};

/**
 * "Find a moment"'s words on screen (docs/proposals/remix-moments.md §2). Model-drafted by the coding agent (Anthropic's
 * Claude), 2026-11-04, for the owner to rewrite. Pure. The AI "why" is shown under `why`, labelled as AI, never in quote
 * marks (owner, 2026-11-04).
 */
export const FIND_MOMENT_WORDING = {
  tabChange: 'Suggest a change',
  tab: 'Find a moment',
  intro: 'Describe a mood or a situation, and it looks through the book for moments that fit. Every passage shown is the book’s own words, checked word for word.',
  sends: (route: string) => `What you describe, the character, the passages found and how far you’ve read go to ${route}, set to keep nothing. We keep nothing about it; it counts as one of your Ask for help messages.`,
  moodLabel: 'Mood or situation',
  placeholder: 'e.g. tired after a long argument, trying to stay polite',
  character: 'Character',
  pastLimit: (n: number) => `Include chapters past Chapter ${n}`,
  pastLimitNote: 'Off each time you open this. Passages past where you’ve read are marked.',
  find: 'Find',
  finding: 'Looking…',
  chapter: (n: number) => `Chapter ${n}`,
  pastRead: 'Past where you’ve read',
  fromSearch: 'From search',
  why: 'Why it may fit',
  whysLeftOut: 'Its reasons were left out: a check flagged them. The passages are the book’s words.',
  makeImage: 'Make an image here',
  read: 'Read it',
  notYet: (name: string, n: number) => `${name} first appears in Chapter ${n}, past where you’ve read.`,
  none: 'Nothing in the book matched that. Try other words.',
  heldBack: 'Better matches may be in later chapters.',
};
