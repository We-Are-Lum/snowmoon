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
  /** Pictures' menu and front page (owner, 2026-10-14: four clear choices; the feed shows all of them). Model-drafted wording. */
  feed: {
    menu: [
      { key: 'moments', label: 'Moments', hint: 'Images of passages' },
      { key: 'characters', label: 'Characters', hint: 'How the people look' },
      { key: 'settings', label: 'Settings', hint: 'Where it happens' },
      { key: 'styles', label: 'Styles', hint: 'Looks to build on' },
    ],
    latest: 'Newest first · moments, character and setting sheets, styles',
    kind: { moment: 'Moment', character: 'Character sheet', place: 'Setting sheet', style: 'Style' },
    setting: 'Setting:',
    momentsLead: 'Images readers made for passages of the book, each shown with the passage it is of.',
  },
  reader: {
    order: 'Most liked first, then newest',
  },
  /**
   * Under "Sign in with Farcaster" in the composer's sign-in step, on the website (owner, 2026-10-16:
   * the wallet first, Farcaster second). The Neynar threshold is not named here. Model-drafted wording.
   */
  signIn: {
    farcasterNote: (perDay: number) => `Established Farcaster accounts can make up to ${perDay} images a day for free.`,
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
  /** Step 4: styles, character sheets, forks, "use as my …" and My picks (docs/proposals/style-guides-and-sheets.md). */
  designs: {
    index: {
      leadStyles: 'Styles readers made. The text of each one is added, in full, to the prompts that use it.',
      leadCharacters: 'The book’s characters, each with the sheets readers made of how they look. A sheet’s text is added, in full, to the prompts that use it.',
      tabStyles: 'Styles',
      tabCharacters: 'Characters',
      tabPlaces: 'Settings',
      newest: 'Newest first',
      built: 'Most built on',
      newStyle: '+ New style',
      footer: 'Nothing here is official. “Most built on” counts published images that used each one. No one sees how many people picked anything.',
      noStyles: 'No styles yet.',
      rowMeta: (by: string, v: number) => `${by} · v${v}`,
      sheets: (n: number) => (n === 0 ? 'No sheet yet' : n === 1 ? '1 sheet' : `${n} sheets`),
      yourPick: '○ Your pick',
      noSheets: 'No sheets yet.',
      drafted: 'Text drafted by the coding agent, a closed model',
      bookOrder: 'In the order the book first tells of them',
      myPicksLink: 'My picks →',
    },
    page: {
      meta: (v: number, of: number, by: string, date: string) => `v${v} of ${of} · by ${by} · ${date}`,
      remixedFrom: 'Remixed from',
      remixedHidden: 'a design that was hidden',
      drafted: 'The project’s starting style. Its text was drafted by the coding agent, a closed model.',
      samplesCaption: 'Sample images',
      viewsCaption: 'Front, side, back',
      placeViewsCaption: 'Wide, other side, closer',
      /** Model-drafted wording (2026-10-14). */
      madeInStyle: (title: string) => `Views made in the style ${title}`,
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
      /** A sheet's style (owner, 2026-10-14: views must use one of the style guides). Model-drafted wording. */
      viewStyle: 'Style for the views',
      viewStyleNote: 'Each view is made in the style you choose: its text goes into the prompt before your sheet text. Your sheet shows which style its views used.',
      viewStyleNone: 'No styles are published yet. Publish a style first.',
      viewStyleFirst: 'Choose a style first.',
      viewStyleChanged: 'The style changed since these views were made. Make them again.',
      yours: (v: number) => `Shaded words are yours; the rest is unchanged from v${v}.`,
      sentTo: 'Your text is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make the pictures. It becomes public only if you publish.',
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
      signIn: 'Sign in to make a style or a sheet. For now, making them is open to invited readers only.',
      // Owner, 2026-10-10: "Invited only, for now". Shown by the form and sent by /api/designs and /api/designs/sample.
      // 2026-10-10: picks too, until the Privacy Policy covers them (the owner's words are pending). Model-drafted.
      notInvited: 'Making styles and character sheets is open to invited readers only, for now. Anyone signed in can browse them and use them in their pictures.',
      notReady: 'Making styles and sheets isn’t set up on this deployment yet.',
      consentFirst: 'Before your first style or sheet: how your words are published.',
      readAndAgree: 'Read and agree',
    },
    picks: {
      title: 'My picks',
      strip: '○ Private · only you see your picks',
      lead: 'Your picks fill in the style, characters and settings when you make an image. Nobody else’s images change.',
      style: 'Style',
      characters: 'Characters',
      places: 'Settings',
      used: 'Offered first when you make an image',
      alsoOffered: 'Also offered when you make an image',
      charUsed: (name: string) => `Offered when a passage names ${name}`,
      placeUsed: 'Offered when you make an image',
      change: 'Change',
      clear: 'Clear',
      noStyle: 'No style picked · you choose one when you make an image',
      noCharacters: 'No characters picked · nothing is added',
      noPlaces: 'No settings picked · nothing is added',
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
      signIn: 'Sign in to see your picks.',
    },
    composer: {
      label: 'From your picks · change for this image only',
      /** A picked setting sheet (2026-10-14). Model-drafted wording. */
      placeLabel: 'Setting · from your picks, for this image only',
      placeNone: 'None · this edition’s shorthand for the place, if the passage has one',
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
    /**
     * Sheets as text (owner, 2026-10-10): the project's summaries of the book's characters and places,
     * the book's own words about them, and this edition's shorthand (its invented look), connected to
     * images made from the text. Model-drafted wording, for the owner to rewrite.
     */
    sheets: {
      leadPlaces: 'The places the book’s scenes happen in. Each has what the book says, and this edition’s shorthand for how it looks.',
      placesOrder: 'In the order the book first goes there',
      scenes: (n: number) => (n === 0 ? 'Not yet tied to a scene' : n === 1 ? 'In 1 scene' : `In ${n} scenes`),
      summaryNote: 'Summary drafted by the coding agent, a closed model.',
      shorthandTitle: 'This edition’s shorthand',
      shorthandNote: 'Added to an image’s prompt when it is in the passage, and published with it. Drafted by the coding agent, a closed model; not from the book.',
      inventedDeclaration: 'invented for this edition by the coding agent, a closed model; not from the book',
      inventedTitle: 'Invented for this edition',
      inventedBody: [
        'The book says little or nothing about how this looks, so this edition invented a look, to keep images of it alike.',
        'The coding agent (a closed model) drafted it. It is not the author’s, and readers’ own sheets can replace it.',
      ],
      bookDeclaration: 'the book’s own words, verbatim; each quote links to its block',
      bookTitleLabel: 'From the book',
      bookBody: ['These are the book’s own words, verbatim, from the chapters you’ve read. Each one links to where it is.'],
      appears: 'Where it appears',
      appearsRow: (ch: number, scene: number, where: string) => `Chapter ${ch} · scene ${scene}${where ? ` · ${where}` : ''}`,
      appearsLater: (n: number) => `And ${n} more ${n === 1 ? 'scene' : 'scenes'} past where you’ve read.`,
      appearsNote: 'Worked out from the book’s scenes, with no model: a scene is here when it quotes this place’s facts or has a seeded image of it.',
      images: 'Images',
      imagesNote: 'Readers’ images newest first, then this edition’s starting images in book order.',
      noImages: 'No images yet.',
      seeded: 'This edition’s image',
      imageOf: (ch: number) => `Chapter ${ch} · AI-generated image · not by the author`,
      inThisImage: 'In this image',
      inPassage: 'In this passage · change for this image only',
      character: 'Character',
      place: 'Place',
      noPlace: 'No place sheet for this scene yet',
      added: 'Added to your prompt, and published with it (this edition’s invented look, model-drafted):',
      pickReplaces: (name: string) => `Your picked sheet for ${name} is added instead of this edition’s shorthand.`,
      upTo: (n: number) => `Up to ${n} characters in one image`,
      notNamed: 'That character is not named in this passage.',
      notThisPlace: 'That place is not this scene’s.',
      sheetsLink: 'Characters & places →',
    },
    moderate: {
      style: 'Style',
      sheet: (name: string) => `Sheet for ${name}`,
      text: 'Text, exactly as added to prompts',
    },
  },
  /** Wallet sign-in and prepaid generations (owner, 2026-10-13). Drafted by the coding agent. */
  prepaid: {
    signIn: 'Sign in with a wallet',
    /** Under the sign-in buttons (owner's words, 2026-10-19). The rest of the old note now shows where it matters:
     *  inAdvance before a wallet account's first payment, and the address byline on the consent screen before
     *  its first publish (ConsentScreen's wallet line). */
    signInNote: 'Signing in is free. It’s a signature, not a payment.',
    /** Under the balance after a wallet sign-in, while the wallet isn't linked (owner, 2026-10-22). DRAFT (coding agent). */
    linkHint: 'Have a Farcaster account? Link this wallet to it on your You page.',
    inAdvance: 'A wallet account pays for each image in advance. Your address, shortened, is the byline on images you publish.',
    noWallet: 'No wallet found in this browser. Open this page in your wallet’s browser, or install a wallet extension.',
    wrongSign: 'The wallet didn’t sign. Try again.',
    balance: (usd: string, n: number) => `Balance $${usd} · about ${n} image${n === 1 ? '' : 's'}`,
    price: (usd: string, markup: number) => `$${usd} an image: the estimated cost plus ${Math.round(markup * 100)}%`,
    addFunds: 'Add funds',
    notAddedYet: 'A payment from this wallet hasn’t been added to your balance yet. It’s safe: it’s on Base, and you can add it with its transaction hash below, within 7 days of paying.',
    // The "add a payment by its hash" box (owner, 2026-10-15). DRAFT wording for the owner.
    recover: 'Add a payment by its transaction hash',
    recoverNote: 'Paste the transaction hash (0x…) or its link on a block explorer. Only a payment from this wallet to this project is added, and only once.',
    recoverLabel: 'Transaction hash or link',
    recoverButton: 'Add payment',
    recoverBad: 'That isn’t a transaction hash: it starts with 0x and has 64 more letters and numbers.',
    claimLater: 'The payment was sent but isn’t added yet. It’s safe: try again in a minute, or add it with its transaction hash below.',
    tryAgain: 'Try again',
    signOut: 'sign out',
    menuSignIn: 'Sign in with Farcaster',
    payWith: 'Pay in USDC or ETH on Base. It’s added to your balance once the payment confirms.',
    terms:
      'You’re paying for image generation on this site. Each Generate is charged when you press it, whatever comes back, including a blocked prompt or an image the safety checker drops. No refunds.',
    /** DRAFT (coding agent, 2026-10-21), for the owner's reread with Terms 6a (docs/legal/credits-draft.md). Shown in
     *  place of `terms` once IMAGES.prepaid.creditBack is on. */
    termsCreditBack:
      'You’re paying for image generation on this site. Each Generate is charged when you press it. If nothing comes back because the prompt check or the image model didn’t answer, it’s added back to your balance. A blocked prompt or an image the safety checker drops stays charged. Payments aren’t refunded as money.',
    /** DRAFT (coding agent, 2026-10-21): after a failed Generate was credited back. */
    creditedBack: 'Nothing was made, so it was added back to your balance.',
    pay: (usd: number, token: 'USDC' | 'ETH') => `Pay $${usd} in ${token}`,
    waiting: 'Waiting for the payment to confirm…',
    added: (usd: string) => `Added $${usd} to your balance.`,
    notOpen: 'Paying for images isn’t open yet.',
    lowBalance: 'Your balance doesn’t cover this image. Add funds to keep going.',
    dailyCap: 'Prepaid image making has reached today’s limit for everyone. It comes back at 00:00 UTC.',
    claim: {
      'not-found': 'That payment isn’t on Base yet. Try again in a moment.',
      pending: 'That payment is still confirming. Try again in a moment.',
      failed: 'That transaction failed onchain, so nothing was paid.',
      old: 'That payment is more than 7 days old, so it can’t be added here. Ask the maintainer.',
      'not-to-us': 'That transaction didn’t pay this project’s address.',
      'not-from-you': 'That payment came from a different wallet than the one signed in.',
      'too-small': 'That payment is below the smallest amount added.',
      // Drafted by the coding agent (2026-10-18), for the owner.
      'shared-block': 'Someone else paid this address in the same block, so this payment can’t be told apart. Ask the maintainer.',
      already: 'That payment was already added.',
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
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx (under the image)', text: 'AI image · by {byline} (button: opens the recipe sheet)' },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx', text: IMAGE_WORDING.draft.kept(24).replace('24', '{hours}') },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx', text: IMAGE_WORDING.draft.editPrompt },
  { screen: 'Add an image · draft', where: 'src/components/image-composer.tsx (action bar)', text: 'Generate again · {n} left' },
  { screen: 'Add an image · sign in', where: 'src/components/image-composer.tsx (under Sign in with Farcaster, website only)', text: IMAGE_WORDING.signIn.farcasterNote(10).replace('10', '{per day}') },
  ...Object.entries(IMAGE_WORDING.prepaid as Record<string, unknown>).flatMap(([k, v]): { screen: string; where: string; text: string }[] =>
    typeof v === 'string' ? [{ screen: 'Wallet and prepaid images', where: `src/lib/images/wording.ts (prepaid.${k})`, text: v }] : typeof v === 'object' ? Object.entries(v as Record<string, string>).map(([c, t]) => ({ screen: 'Wallet and prepaid images', where: `src/lib/images/wording.ts (prepaid.${k}.${c})`, text: t })) : [],
  ),
  { screen: 'Wallet and prepaid images', where: 'src/components/wallet-panel.tsx', text: 'Balance ${usd} · about {n} images / ${usd} an image: the estimated cost plus 30% / Pay ${usd} in {USDC|ETH} / Added ${usd} to your balance.' },
  { screen: 'Add an image · compose', where: 'src/components/image-composer.tsx (action bar, when a draft is kept)', text: IMAGE_WORDING.draft.back },
  { screen: 'Add an image · preview', where: 'src/components/image-composer.tsx (preview)', text: IMAGE_WORDING.preview.promptLabel },
  { screen: 'Image page', where: 'src/app/image/[id]/page.tsx (caption; "Open in reader →" is the assistant’s approved row 23, reused)', text: 'AI image · by {byline} (button: opens the recipe sheet) / {date} · Chapter {n} · ¶ {a–b} · Open in reader →' },
  { screen: 'Image page', where: 'src/app/image/[id]/page.tsx (crumb)', text: '← Pictures · Trial' },
  { screen: 'Images by readers (in the chapter)', where: 'src/components/reader-images.tsx (bar)', text: '{n} images by readers · ¶ {a–b} · show ▾ / hide ▴' },
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
  sheets: { screen: 'Character and place sheets, and “In this passage”', where: 'src/app/images/designs/place/[slug]/page.tsx, character/[slug]/page.tsx, design-sheets.tsx, image-composer.tsx, src/app/image/[id]/page.tsx, chapter pages' },
};
function filled(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(' / ');
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
