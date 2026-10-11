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
  /** "Make an image" (/images/new, 2026-10-10): choose a passage, then the composer. Model-drafted wording. */
  create: {
    title: 'Make an image',
    intro: 'Choose a passage of the book, then describe the image in your own words.',
    browse: 'Browse',
    search: 'Search',
    chooseChapter: 'Choose a chapter',
    allChapters: '← All chapters',
    ahead: 'past where you’ve read',
    tap: (max: number) => `Tap the first paragraph, then the last. Up to ${max} blocks.`,
    count: (n: number, max: number) => `${n} of up to ${max} ${max === 1 ? 'block' : 'blocks'}`,
    tooMany: (n: number, max: number) => `A passage can be up to ${max} blocks; that would be ${n}. Tap a nearer paragraph.`,
    write: 'Write the prompt →',
    clear: 'Clear',
    notChosen: (kind: string) => `A ${kind} from the book, not shown here`,
    badLink: 'That link’s passage can’t be opened here. Choose one below.',
    searchLabel: 'Search the book’s text',
    searchHint: (min: number) => `Type at least ${min} letters.`,
    noHits: (q: string) => `No paragraph has “${q}”.`,
    more: (n: number) => `The first ${n}. Add a word to narrow it.`,
    searchFailed: 'The search did not answer. Try again.',
    entry: 'Make an image',
    ofThis: 'Make an image of this passage',
    fromThis: 'Make one from this passage',
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
  { screen: 'Make an image', where: 'src/components/image-create.tsx (heading)', text: IMAGE_WORDING.create.title },
  { screen: 'Make an image', where: 'src/components/image-create.tsx', text: IMAGE_WORDING.create.intro },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (switch)', text: `${IMAGE_WORDING.create.browse} / ${IMAGE_WORDING.create.search}` },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (chapter list)', text: IMAGE_WORDING.create.chooseChapter },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (chapter list, search hits)', text: IMAGE_WORDING.create.ahead },
  { screen: 'Make an image', where: 'src/components/image-create.tsx', text: IMAGE_WORDING.create.allChapters },
  { screen: 'Make an image', where: 'src/components/image-create.tsx', text: IMAGE_WORDING.create.tap(8).replace('8', '{max}') },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (selection bar)', text: '¶ {a–b} · ' + IMAGE_WORDING.create.count(3, 8).replace('3', '{n}').replace('8', '{max}') },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (selection bar)', text: IMAGE_WORDING.create.tooMany(9, 8).replace('9', '{n}').replace('8', '{max}') },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (selection bar)', text: `${IMAGE_WORDING.create.clear} / ${IMAGE_WORDING.create.write}` },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (screens and figures)', text: IMAGE_WORDING.create.notChosen('{screen|figure}') },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (deep link)', text: IMAGE_WORDING.create.badLink },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (search)', text: IMAGE_WORDING.create.searchLabel },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (search)', text: IMAGE_WORDING.create.searchHint(3).replace('3', '{min}') },
  { screen: 'Make an image', where: 'src/components/search-field.tsx (under the search box)', text: 'Searched on your device, in the book’s own text. Your search is not sent anywhere. Never published.' },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (search)', text: IMAGE_WORDING.create.noHits('{q}') },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (search)', text: IMAGE_WORDING.create.more(20).replace('20', '{n}') },
  { screen: 'Make an image', where: 'src/components/image-create.tsx (search)', text: IMAGE_WORDING.create.searchFailed },
  { screen: 'Pictures (feed)', where: 'src/app/images/page.tsx (button, invited readers only during the trial)', text: IMAGE_WORDING.create.entry },
  { screen: 'Image page', where: 'src/app/image/[id]/page.tsx (by the passage)', text: IMAGE_WORDING.create.ofThis },
  { screen: 'Pictures (feed)', where: 'src/components/image-feed.tsx (under each passage)', text: IMAGE_WORDING.create.fromThis },
  { screen: 'Home', where: 'src/components/make-image-link.tsx (Everything you can do here, invited readers only during the trial)', text: 'Make an image · Choose a passage, then describe it · Trial →' },
  { screen: 'Assistant · answer', where: 'src/components/assistant.tsx (each quote card)', text: IMAGE_WORDING.create.ofThis },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (role strip)', text: IMAGE_WORDING.moderate.strip },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (role strip)', text: '{n} waiting' },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (under the image)', text: 'AI image · by FID {fid} (button: opens the recipe sheet)' },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx', text: IMAGE_WORDING.moderate.prompt },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx', text: IMAGE_WORDING.moderate.reasons },
];
