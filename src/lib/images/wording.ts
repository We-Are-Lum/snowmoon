/**
 * New wording on the image screens, from the restyle to Claude Design's "Image creation" board
 * (step 3, 2026-10-08; docs/design/image-creation-study.md, section 12). All of it was drafted
 * by the coding agent (a closed model) and is labelled draft: each image screen shows one
 * "Draft wording" line. The rows below go to the draft-wording doc for the owner's words.
 * Words already on these screens before the restyle are not repeated here.
 *
 * "AI-generated image" and "not by the author" stay written out in each component, since
 * check:principles P2b reads them there.
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
  /** Step 4: styles, character sheets, forks, "use as my …" and My picks (docs/proposals/style-guides-and-sheets.md). */
  designs: {
    index: {
      title: 'Styles & characters',
      lead: 'Styles and character sheets readers made. The text of each one is added, in full, to the prompts that use it.',
      tabStyles: 'Styles',
      tabCharacters: 'Characters',
      tabPlaces: 'Places · coming',
      newest: 'Newest first',
      built: 'Most built on',
      newStyle: '+ New style',
      footer: 'Nothing here is official. “Most built on” counts published images that used each one. No one sees how many people picked anything.',
      noStyles: 'No styles yet.',
      rowMeta: (by: string, v: number) => `${by} · v${v}`,
      sheets: (n: number) => (n === 0 ? 'No sheet yet' : n === 1 ? '1 sheet' : `${n} sheets`),
      coveredRow: (ch: number) => `A character from chapter ${ch}, past where you’ve read.`,
      showAnyway: 'Show anyway',
      yourPick: '○ Your pick',
      sampleAi: 'Sample: AI-generated · not by the author',
      viewAi: 'Views: AI-generated · not by the author',
      noSheets: 'No sheets yet.',
      drafted: 'Text drafted by the coding agent, a closed model',
      bookOrder: 'In the order the book first tells of them',
      myPicksLink: 'My picks →',
      stylesLink: 'Styles & characters →',
    },
    page: {
      meta: (v: number, of: number, by: string, date: string) => `v${v} of ${of} · by ${by} · ${date}`,
      remixedFrom: 'Remixed from',
      remixedHidden: 'a design that was hidden',
      drafted: 'The project’s starting style. Its text was drafted by the coding agent, a closed model.',
      samplesCaption: 'Sample images · AI-generated · not by the author',
      viewsCaption: 'Front, side, back · AI-generated · not by the author',
      noPictures: 'No sample pictures yet.',
      styleText: 'Style text · added to prompts',
      sheetText: (name: string) => `Sheet text · added when ${name} is in a prompt`,
      changedFrom: (v: number) => `Shaded words are new since the version it was remixed from (v${v}).`,
      builtOn: (n: number) => `Built on by ${n} ${n === 1 ? 'image' : 'images'}`,
      seeThem: 'See them',
      versions: 'Versions',
      versionRow: (v: number, date: string, built: number) => `v${v} · ${date} · ${built} built on`,
      oldVersions: 'Old versions stay usable.',
      useStyle: 'Use as my style',
      myStyle: (v: number) => `My style · v${v} · clear`,
      useCharacter: (name: string) => `Use as my ${name}`,
      myCharacter: (name: string, v: number) => `My ${name} · v${v} · clear`,
      switchTo: (v: number) => `Switch my pick to v${v}`,
      fork: 'Fork',
      newVersion: 'New version',
      picked: 'Kept as your pick. Only you see this.',
      pickFailed: 'Could not change your pick. Try again.',
      cleared: 'Pick cleared. Nothing is added to your images for this one.',
      sheetBy: (by: string) => `Sheet by ${by}`,
      bookTitle: 'What the book says · from the chapters you’ve read',
      bookNote: 'The book’s own words. Anything a sheet adds is its maker’s invention.',
      bookNone: 'Nothing yet in the chapters you’ve read.',
      coveredPage: (ch: number) => `This character first appears in chapter ${ch}, past where you’ve read.`,
      howMade: 'How the pictures were made',
      pictureRecipe: (i: number) => `Picture ${i}`,
    },
    form: {
      newStyle: 'New style',
      newSheet: (name: string) => `New ${name} sheet`,
      fork: 'Fork',
      newVersion: 'New version',
      band: (what: string) => `Remixed from ${what}`,
      bandNote: (by: string) => `Shown on yours for good. It credits ${by}.`,
      name: 'Name',
      sheetName: 'Name (optional)',
      styleText: 'Style text · added to every prompt that uses it',
      sheetText: (name: string) => `Sheet text · added when ${name} is in a prompt`,
      yours: (v: number) => `Shaded words are yours; the rest is unchanged from v${v}.`,
      sentTo: 'Your text is sent to Groq to be checked and to fal.ai to make the pictures. It becomes public only if you publish.',
      samples: (min: number, max: number) => `Sample images · ${min} to ${max} · made with this text`,
      views: 'Views · front, side, back',
      subject: (i: number) => `Sample ${i}`,
      generate: '+ Generate',
      again: 'Make again',
      making: 'Making it…',
      left: (n: number) => `Each one uses a generation · ${n} left today`,
      stale: 'The text changed since these were made. Make them again with this text.',
      frontFirst: 'Make the front view first.',
      viewModel: 'Side and back are made from the front view',
      styleRules: 'No living artists’ names. No other works’ styles by name. The same image rules as Compose.',
      sheetRules: 'Don’t base a character on a real person. Don’t contradict what the book says. Describe how they look early in the book; nothing that happens later.',
      viewsShared: 'Published views can be used by other readers as reference pictures for their images.',
      characterName: 'That is the name of a character in the book. Choose another name for the style.',
      nameRefused: 'This name asks for something the rules don’t allow. Choose another.',
      nameBlocked: 'No real people: the name names someone on the blocked list.',
      published: 'Published.',
      see: 'See it',
      promptIs: (suffix: string) => `Each picture’s prompt is its line above, then your text, then “${suffix}”`,
      needSamples: (n: number) => `Make at least ${n} sample pictures with this text to publish.`,
      signIn: 'Sign in to make a style or a sheet. The trial is open to invited readers.',
      notInvited: 'The trial is open to invited readers only, for now.',
      notReady: 'Making styles and sheets isn’t set up on this deployment yet.',
      consentFirst: 'Before your first style or sheet: how your words are published.',
      readAndAgree: 'Read and agree',
    },
    picks: {
      title: 'My picks',
      strip: '○ Private · only you see your picks',
      lead: 'Your picks fill in the style and characters when you make an image. Nobody else’s images change.',
      style: 'Style',
      characters: 'Characters',
      used: 'Offered first when you make an image',
      alsoOffered: 'Also offered when you make an image',
      charUsed: (name: string) => `Offered when a passage names ${name}`,
      change: 'Change',
      clear: 'Clear',
      noStyle: 'No style picked · nothing is added',
      noCharacters: 'No characters picked · nothing is added',
      hidden: 'Hidden since you picked it · not added',
      newer: (v: number) => `Newer version: v${v}`,
      compare: 'Compare →',
      compareTitle: (name: string, mine: number, by: string, newer: number) => `${name} · your v${mine} and ${by}’s v${newer}`,
      yourPick: (v: number) => `v${v} · your pick`,
      newLabel: (v: number, date: string) => `v${v} · ${date}`,
      changedNote: (newer: number, mine: number) => `Shaded words changed in v${newer}. Images you already made keep v${mine}.`,
      keep: (v: number) => `Keep v${v}`,
      switchTo: (v: number) => `Switch to v${v}`,
      switched: (name: string, v: number, old: number) => `Your pick is now ${name} v${v}. Past images keep v${old}.`,
      nobody: 'No one sees how many people picked anything.',
      signIn: 'Sign in to see your picks. During the trial, picks are for invited readers.',
      notInvited: 'During the trial, picks are for invited readers only.',
    },
    composer: {
      label: 'From your picks · change for this image only',
      none: 'None',
      starting: 'Techno vistas (the project’s starting style)',
      yourPick: 'your pick',
      added: 'Added to your prompt, and published with it:',
      addedDrafted: 'Added to your prompt, and published with it (model-drafted):',
      reference: (names: string) => `Use ${names}’s sheet pictures as a reference`,
      referenceModel: 'With a reference the image is made by',
      changePicks: 'Change your picks →',
      noPicks: 'No picks yet. Styles & characters →',
    },
    preview: {
      added: (what: string) => `Added from ${what}`,
    },
    image: {
      added: 'Added from picked styles and sheets',
      references: 'Reference pictures',
    },
    about: {
      line: 'Readers can also publish styles and character sheets. Their names and text are published like prompts: public, permanent, GPL-3.0, under the maker’s name, and added in full to the prompts of images that use them.',
    },
    report: {
      style: 'Why are you reporting this style?',
      sheet: 'Why are you reporting this sheet?',
    },
    moderate: {
      style: 'Style',
      sheet: (name: string) => `Sheet for ${name}`,
      text: 'Text, exactly as added to prompts',
    },
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
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx (under the image)', text: 'AI-generated image · not by the author' },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx', text: IMAGE_WORDING.draft.kept(24).replace('24', '{hours}') },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx', text: IMAGE_WORDING.draft.editPrompt },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx (action bar)', text: 'Generate again · {n} left' },
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (action bar, when a draft is kept)', text: IMAGE_WORDING.draft.back },
  { screen: 'Add an image · preview', where: 'src/components/image-composer.tsx (preview)', text: IMAGE_WORDING.preview.promptLabel },
  { screen: 'Image page', where: 'src/app/image/[id]/page.tsx (caption; "Open in reader →" is the assistant’s approved row 23, reused)', text: 'AI-generated image · not by the author / by {byline} · {date} · Chapter {n} · ¶ {a–b} · Open in reader →' },
  { screen: 'Image page', where: 'src/app/image/[id]/page.tsx (crumb)', text: '← Pictures · Trial' },
  { screen: 'Images by readers (in the chapter)', where: 'src/components/reader-images.tsx (bar)', text: '{n} images by readers · ¶ {a–b} · show ▾ / hide ▴' },
  { screen: 'Pictures (feed)', where: 'src/components/image-feed.tsx (order strip)', text: IMAGE_WORDING.feed.covered(3).replace('3', '{n}') },
  { screen: 'Images by readers (in the chapter)', where: 'src/components/reader-images.tsx (order, now visible)', text: IMAGE_WORDING.reader.order },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (role strip)', text: IMAGE_WORDING.moderate.strip },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (role strip)', text: '{n} waiting' },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (under the image)', text: 'AI-generated image · not by the author' },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx', text: IMAGE_WORDING.moderate.prompt },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx', text: IMAGE_WORDING.moderate.reasons },
];

/**
 * Step 4's rows, one per string in IMAGE_WORDING.designs, by screen. A string made from values is
 * shown with its parameters in braces ({v}, {name}), as the app fills them in. All draft.
 */
const DESIGN_SCREENS: Record<keyof typeof IMAGE_WORDING.designs, { screen: string; where: string }> = {
  index: { screen: 'Styles & characters', where: 'src/components/design-index.tsx, src/app/images/designs/page.tsx' },
  page: { screen: 'A style or a sheet', where: 'src/app/images/designs/[id]/page.tsx, design-picks.tsx, design-book.tsx' },
  form: { screen: 'New style, new sheet, fork, new version', where: 'src/components/design-form.tsx' },
  picks: { screen: 'My picks', where: 'src/components/my-picks.tsx' },
  composer: { screen: 'Add an image · compose (from your picks)', where: 'src/components/image-composer.tsx' },
  preview: { screen: 'Add an image · preview', where: 'src/components/image-composer.tsx' },
  image: { screen: 'Image page (recipe)', where: 'src/app/image/[id]/page.tsx' },
  about: { screen: 'About', where: 'src/app/about/page.tsx (Pictures section)' },
  report: { screen: 'Report a style or a sheet', where: 'src/components/image-actions.tsx' },
  moderate: { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx' },
};
function filled(v: unknown): string {
  if (typeof v === 'string') return v;
  const fn = v as (...a: unknown[]) => string;
  const names = (fn.toString().match(/^\(?([^)=]*)\)?\s*=>/)?.[1] ?? '').split(',').map((n) => n.replace(/:.*$/, '').trim()).filter(Boolean);
  return fn(...names.map((n) => `{${n}}`));
}
for (const [group, strings] of Object.entries(IMAGE_WORDING.designs) as [keyof typeof IMAGE_WORDING.designs, Record<string, unknown>][]) {
  for (const [key, v] of Object.entries(strings)) IMAGE_WORDING_ROWS.push({ ...DESIGN_SCREENS[group], where: `${DESIGN_SCREENS[group].where} (${key})`, text: filled(v) });
}
// Step 4 strings written out in components (P2b reads the AI phrases there), and the picture recipe line.
IMAGE_WORDING_ROWS.push(
  { screen: 'A style or a sheet', where: 'src/app/images/designs/[id]/page.tsx (how the pictures were made)', text: '{model} ({id}), open weights, Apache-2.0, on {host}, endpoint {endpoint}. Seed {seed}, request {id}, cost ${cost}, {date}. Made from the front view. Checked by gpt-oss-safeguard-20b and the host’s safety checker. The fixed subject line was drafted by the coding agent. File sha256 {sha256}.' },
  { screen: 'A style or a sheet', where: 'src/app/images/designs/[id]/page.tsx (built-on list)', text: 'Chapter {n} · AI-generated image · not by the author' },
  { screen: 'Reports (moderators)', where: 'src/components/moderate-queue.tsx (a design)', text: 'AI-generated pictures · not by the author' },
  { screen: 'Add an image · compose (from your picks)', where: 'src/components/image-composer.tsx (chip key)', text: 'Character' },
  { screen: 'New style, new sheet, fork, new version', where: 'src/lib/images/design-rules.ts (sample subjects, part of each sample’s public prompt)', text: 'A wide street with tall trees and low buildings, a few people walking, daytime. / A small room with a desk, a window and a plant, seen from the doorway. / A footpath through tall trees, a small drone flying overhead. / A market square at dusk, seen from above.' },
  { screen: 'New style, new sheet, fork, new version', where: 'src/lib/images/design-rules.ts (view lines, part of each view’s public prompt)', text: 'Character reference picture: one person, full body, standing, seen from the front, plain light grey background. / The same person as in the reference picture, full body, standing, seen from the side, plain light grey background. Keep the face, hair and clothes the same. / … seen from behind … Keep the hair and clothes the same.' },
);
