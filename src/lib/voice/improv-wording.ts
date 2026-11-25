/**
 * Improvising's words on the record page (Nate, 2026-11-24). The label lines are Nate's own ("word for word",
 * "improvised on 'Doing fine' (version 2)"); the rest is drafted by the coding agent (Claude, a closed model by
 * Anthropic), DRAFT until Nate's reread: each shows "Draft wording" on the page (draft below) until then.
 */
export const IMPROV_WORDING = {
  /** Above the prompter. {max} is the take's limit, as m:ss. DRAFT. */
  intro: (max: string) => `Read it word for word, or improvise around its theme in your own words. A take is at most ${max}; the recording stops when the countdown reaches 0:00.`,
  /** On the Stop button while recording: the countdown. DRAFT. */
  left: (t: string) => `${t} left`,
  /** Nate's label lines (2026-11-24). */
  wordForWordLabel: 'word for word',
  improvisedLabel: (title: string, version: number) => `improvised on '${title}' (version ${version})`,
  /** Under an improvised take. DRAFT. */
  improvisedNote: 'Your storyboard will use your own words, as transcribed. Before you storyboard it, you can correct the transcript below, under Your drafts.',
  /** The correction screen. DRAFT. */
  correct: {
    summary: 'Correct the transcript of your words',
    intro: 'This is what the transcription heard you say, sentence by sentence. Correct any word it got wrong; your storyboard and its credits use these words. Only you change them: no model edits them.',
    label: (n: number) => `Sentence ${n}`,
    save: 'Keep my corrections',
    saving: 'Keeping…',
    saved: 'Kept: your corrected words are your storyboard’s words. The correction is in the draft’s recipe.',
    afterBoard: 'Correct the words before you storyboard: once a storyboard is saved, its shots follow these sentences.',
  },
  draft: 'Draft wording',
} as const;
