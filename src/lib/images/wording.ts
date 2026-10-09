/**
 * New wording on the image screens, from the restyle to Claude Design's "Image creation" board
 * (step 3, 2026-10-08; docs/design/image-creation-study.md, section 12). All of it was drafted
 * by the coding agent (a closed model) and is labelled draft: each image screen shows one
 * "Draft wording" line. The rows below go to the draft-wording doc for the owner's words.
 * Words already on these screens before the restyle are not repeated here.
 *
 * Under each image: the AI label (src/lib/ai-declared.ts; owner, 2026-10-09), a button opening the
 * recipe sheet, with "AI-generated image, not by the author" served beside it, visually hidden.
 */
export const IMAGE_WORDING = {
  draftLine: 'Draft wording',
  composer: {
    showWhole: 'Show the whole passage',
    showLess: 'Show less',
    promptLabel: 'Describe the image · your words',
    rulesLabel: 'The rules',
  },
  draft: {
    strip: '○ Draft · only you can see this · kept on this device',
    kept: (hours: number) =>
      `It is kept on this device for this passage until you publish it. Generate again replaces it. After ${hours} hours it can no longer be published, and you make it again.`,
    editPrompt: 'Edit prompt',
    back: 'Back to draft',
    left: (n: number) => `${n} left`,
  },
  preview: {
    promptLabel: 'Prompt, published in full',
  },
  feed: {
    covered: (n: number) => `Spoilers covered after ch ${n}`,
  },
  reader: {
    order: 'Most liked first, then newest',
  },
  moderate: {
    strip: 'Moderators only · oldest first',
    waiting: (n: number) => `${n} waiting`,
    prompt: 'Prompt, exactly as sent',
    reasons: 'Reasons · reporters never shown',
  },
} as const;

/** One row per new string, by screen, for the draft-wording doc. {braces} are filled in by the app. */
export const IMAGE_WORDING_ROWS: { screen: string; where: string; text: string }[] = [
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (passage card)', text: IMAGE_WORDING.composer.showWhole },
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (passage card)', text: IMAGE_WORDING.composer.showLess },
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (prompt label)', text: IMAGE_WORDING.composer.promptLabel },
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (prompt counter)', text: '{n} / {max}' },
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (rules label)', text: IMAGE_WORDING.composer.rulesLabel },
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (Generate button)', text: 'Generate · {n} of {per day} left today / Generate again · {n} of {per day} left today' },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx (privacy strip)', text: IMAGE_WORDING.draft.strip },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx (under the image)', text: 'AI image · by {byline} (button: opens the recipe sheet)' },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx', text: IMAGE_WORDING.draft.kept(24).replace('24', '{hours}') },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx', text: IMAGE_WORDING.draft.editPrompt },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx (action bar)', text: 'Generate again · {n} left' },
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (action bar, when a draft is kept)', text: IMAGE_WORDING.draft.back },
  { screen: 'Add an image · preview', where: 'src/components/image-composer.tsx (preview)', text: IMAGE_WORDING.preview.promptLabel },
  { screen: 'Image page', where: 'src/app/image/[id]/page.tsx (caption; "Open in reader →" is the assistant’s approved row 23, reused)', text: 'AI image · by {byline} (button: opens the recipe sheet) / {date} · Chapter {n} · ¶ {a–b} · Open in reader →' },
  { screen: 'Image page', where: 'src/app/image/[id]/page.tsx (crumb)', text: '← Pictures · Trial' },
  { screen: 'Images by readers (in the chapter)', where: 'src/components/reader-images.tsx (bar)', text: '{n} images by readers · ¶ {a–b} · show ▾ / hide ▴' },
  { screen: 'Pictures (feed)', where: 'src/components/image-feed.tsx (order strip)', text: IMAGE_WORDING.feed.covered(3).replace('3', '{n}') },
  { screen: 'Images by readers (in the chapter)', where: 'src/components/reader-images.tsx (order, now visible)', text: IMAGE_WORDING.reader.order },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (role strip)', text: IMAGE_WORDING.moderate.strip },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (role strip)', text: '{n} waiting' },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (under the image)', text: 'AI image · by FID {fid} (button: opens the recipe sheet)' },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx', text: IMAGE_WORDING.moderate.prompt },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx', text: IMAGE_WORDING.moderate.reasons },
];
