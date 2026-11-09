import { IMAGES } from '../config';

/**
 * The words of the remix flow (/challenge/make, its preview and the published picture's page; branch
 * challenge-moments, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S2–S5). DRAFT wording, drafted by the coding
 * agent (Claude, a closed model by Anthropic) for the owner's review. Sent to the browser by the flow's API, so the
 * scripts everyone is served carry none of them. No date is written here.
 */
export const MAKE_WORDING = {
  back: '‹ Back',
  close: 'Close',
  moment: 'Moment',
  surprise: 'Surprise me',
  /** P5g's fourth exception: whose list it is, on the strip's ⓘ. */
  momentsBy: 'Moments picked by @naaate, in the book’s order.',
  readIt: 'Read it →',
  wordsLabel: 'Describe what to change',
  wordsPlaceholder: 'Describe what to change',
  /** The one box with the moments off (owner's approved design, 2026-11-08). DRAFT wording. */
  changeLabel: (name: string) => `Change ${name}: clothes, colours, age, pose…`,
  /** The Style row (owner, 2026-11-08: "Style", "Random", "Write your own"). */
  style: 'Style',
  random: 'Random',
  ownStyle: 'Write your own',
  /** The own-style box's label. DRAFT wording. */
  ownStyleLabel: 'Your style, in a few words',
  /** In "How it was made" when Random drew the style, after "Style: " (owner, 2026-11-08: "Style: {style}, drawn at random"). */
  randomDrew: (label: string) => `${label}, drawn at random`,
  model: 'Model',
  /**
   * P2 and the closed-models rule: the chip names the model and its maker. Today's one model's line; the row itself is
   * built from src/lib/challenge/models.ts (challengeModels, modelChipText), which writes this same line.
   */
  modelChip: `${IMAGES.editModel.name} · Black Forest Labs · open`,
  makeIt: 'Make it',
  making: 'Making it…',
  signIn: 'Sign in to make it',
  remixing: (name: string) => `Remixing ${name}`,
  picture: (name: string) => `The picture of ${name} you start from`,
  // S3, the preview.
  yourWords: 'Your words:',
  tryAgain: 'Try again',
  publish: 'Publish',
  publishing: 'Publishing…',
  howMade: 'How it was made',
  startedFrom: 'Started from',
  /** Asked once when leaving a made picture unpublished (it is only in this tab until published). */
  leave: 'Leave without publishing? The picture isn’t saved anywhere until you publish it.',
  gone: 'This preview is no longer here (it lives only in the tab that made it). Make it again.',
  again: 'Back to the remix screen',
  // Errors.
  noSource: 'This picture can’t be remixed for the challenge.',
  noMoment: 'Pick a moment first.',
  noWords: 'Describe what to change first.',
  // The Style and Model rows' errors (branch challenge-simple, 2026-11-08). DRAFT wording.
  noStyle: 'Pick a style first.',
  ownEmpty: 'Write your style first.',
  ownLong: (n: number) => `Write your style in up to ${n} characters.`,
  noModel: 'Pick one of the models listed.',
};
