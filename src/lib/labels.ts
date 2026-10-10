/**
 * Short labels with ⓘ (owner ruling, 2026-10-09: "a short visible word, with ⓘ for the details. An icon
 * alone doesn't count."). Each has its word, a one-sentence declaration (in the page, read with the word)
 * and the details its sheet opens. Model-drafted wording, for the owner to rewrite. Rendered by
 * src/components/info-label.tsx; check:principles P2g, P2h and P8f require the words.
 */
export const LABELS = {
  redrawn: {
    word: 'Redrawn',
    declaration: 'redrawn by this edition from the book’s screen; every word is the book’s',
    title: 'Redrawn from the book',
    body: (templateId: string) => [
      'This edition redrew this screen from the book’s own, so it fits and reads on a phone. Every word on it is the book’s; the layout and the drawing are this edition’s.',
      `The template that drew it is “${templateId}”. The original is in the book’s chapter, linked below.`,
    ],
    original: 'The book’s chapter, as published ↗',
  },
  aiDescription: {
    word: 'AI description',
    declaration: 'a description of this screen drafted by an AI model, not the author’s words',
    title: 'AI description',
    body: [
      'A screen like this can’t be read aloud as it stands, so the narration reads a short description of it instead.',
      'An AI model drafted the description. It is not the author’s words, and a person may rewrite it.',
    ],
    prompt: 'How the descriptions were drafted ↗',
  },
  minpentai: {
    invented: {
      word: 'Invented',
      declaration: 'invented for this edition, not from the book',
      title: 'Invented for this edition',
    },
    draft: {
      word: 'Draft',
      declaration: 'draft wording, to be rewritten',
      title: 'Draft wording',
      body: ['The words on this screen are drafts, written for this edition and waiting for a person to rewrite them.'],
    },
    book: {
      word: 'Book',
      declaration: 'from the book; each statement cites its block',
      title: 'From the book',
      body: ['What this screen says about the book comes from it. Every statement cites the block it comes from, under SOURCES.'],
    },
  },
} as const;
