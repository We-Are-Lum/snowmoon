/**
 * Terms of Use and Privacy Policy (/terms, /privacy), from the owner's legal starter of
 * 2026-10-08, updated 2026-10-09 (Privacy sections 3, 4 and 7), 2026-10-22 (wallet ↔ Farcaster links: Privacy
 * sections 4, 6 and 7, Terms sections 4 and 5; docs/legal/wallet-links-draft.md) and 2026-10-18 (accounts, wallets and
 * prepaid generations, the adaptation pages, Remix: drafted by the coding agent, reread by the owner;
 * Terms section 2's last words are the owner's). Only the owner changes the words.
 *
 * Kept true by check:principles:
 * - P6g–P6j: the Privacy page, About, the assistant's notice and the image consent screen name
 *   the same outside services.
 * - P6k, P6l: the words of each page are words the owner (FID 6786) has reread. `ownerReread`
 *   is set only on the owner's word ("reread"), never by an agent on its own; a change to the
 *   words always needs the owner's reread again. Until then each page carries one "Draft
 *   wording" line; after it, "Reread by FID 6786" with the date.
 * - P6m: `LEGAL.effective` is set. It is the day the pages go live (the owner's merge), so it is
 *   null until then, and the pages can't ship with the placeholder.
 */

/** A section: its number and run-in heading, then paragraphs (strings) and lists (string arrays). */
export interface LegalSection {
  n: number | string;
  head: string;
  body: (string | string[])[];
}
export interface LegalDoc {
  title: string;
  sections: LegalSection[];
}

export const LEGAL: {
  /** The effective date, YYYY-MM-DD: the day the pages go live. Null until the owner merges. */
  effective: string | null;
  /** The owner's reread of each page's words: the key (legalKey) of the words reread, when, and by whom. */
  ownerReread: {
    terms: { words: string; on: string; by: 'FID 6786' } | null;
    privacy: { words: string; on: string; by: 'FID 6786' } | null;
  };
} = {
  effective: '2026-10-22',
  // The owner said "Reread" on 2026-10-10 (words 3iuvyo, 1r2aajz), and on 2026-10-18 of the drafted
  // changes ("I've read the drafted Terms and Privacy changes and approve them: this is my 'reread'"),
  // covering both pages at these words.
  ownerReread: {
    // With Remix (the Remix items the owner reread on 2026-10-18): terms if3grj, privacy b1is2e.
    // The baseline's words were terms 5wwopt, privacy 1wfmhnv.
    // 2026-10-22, the owner's reread of the wallet ↔ Farcaster link sentences in sections 4 and 5 (PR #34: "reread for
    // Privacy sections 1–4 and both Terms sentences"). The words before were if3grj.
    // 2026-10-22, the owner's reread of §6a for credit-back (PR #35: "#35: reread, with the tidier §6a sentence"): reading B,
    // the price shown, and the payment sentences matching the code. The words before were tvt9ga.
    terms: { words: '1pz1d61', on: '2026-10-22', by: 'FID 6786' },
    // Plus one sentence the drafted list missed (Privacy §4, images): "your name (Farcaster name or wallet
    // address)", the owner's own words for tonight's publish (2026-10-18), so the page stays true for wallet accounts.
    // 2026-10-19, the owner's "Reread is done" for push 3, at these words: My picks in §4 (the owner's own sentence),
    // sharing a Minpentai win in §6, and X added to §7's report-or-share item. The words before were 1smezv1.
    // 2026-10-22, the owner's reread for wallet ↔ Farcaster links (PR #34): §4 (the link kept; the balance stays with
    // the wallet), §6 (linked work under the Farcaster name) and §7 (Neynar receives the wallet's address; the last
    // sentence is the owner's own: "A linked wallet is looked up again at most once a day, …"); then §4's "and why a
    // link ended", the owner's approved words (2026-10-22, "Yes, add 'and why a link ended' to section 4"). The words
    // before were 87yjkk (and h0zppm before §4's addition).
    // 2026-10-22, the owner's reread for credit-back (PR #35): §4's wallet paragraph adds "any charge added back to your
    // balance because a generation gave you no picture". The words before were hqt7ov.
    privacy: { words: 'l8xev2', on: '2026-10-22', by: 'FID 6786' },
  },
};

export const TERMS: LegalDoc = {
  title: 'Terms of Use',
  sections: [
    { n: 1, head: 'Who runs this.', body: ['Snowmoon Party (snowmoon.party and its Farcaster mini app, together "the Service") is operated by Lum LLC, a Wyoming limited liability company ("we"). By using the Service you agree to these Terms.'] },
    { n: 2, head: 'What this is.', body: ['An independent, open edition of the novel Snowmoon by Vitalik Buterin, with read-aloud audio, pictures, a game reconstruction and a reading assistant. It is not affiliated with or endorsed by the author. There is no token. You can prepay for generations. Payments are final. Nothing else here is for sale.'] },
    { n: 3, head: 'The book and the licence.', body: ['Snowmoon is the author\'s work, released under the GNU General Public License version 3. The text, pictures, audio and code on the Service are offered under that same licence, and the source and the full record of how each piece was made are public in our repository. Nothing in these Terms limits the rights the licence gives you.'] },
    { n: 4, head: 'Who can use it.', body: ['Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account or a wallet address. You can link a wallet to your Farcaster account; while it is linked, signing in with the wallet is signing in as that account. Other ways to sign in may come later; these Terms will list each one when it does.'] },
    { n: 5, head: 'What you add.', body: ['If you publish something through the Service, or make a frame in Remix (which is saved, and can be seen by anyone with its link, as soon as it is made), it remains yours, and you license it to everyone under GPL version 3. You confirm it is your own work, or that you have the right to license it this way. Your name is shown with it: your Farcaster name, or, for a wallet account, its address shortened. Work made with a wallet that is linked to your Farcaster account is shown with your Farcaster name. Where the Service says so before you publish, the prompts and any planning thread that led to the piece are published with it. Published work is public and others may copy it under the licence. We can hide it on request (see section 7), but we cannot recall copies others have made.'] },
    { n: 6, head: 'What you must not do.', body: ['Don\'t post anything unlawful, harassing or sexual involving minors; don\'t post other people\'s private information; don\'t impersonate anyone or present your work as the author\'s or as official; don\'t try to get around sign-in, daily limits or spending caps; don\'t interfere with the Service.'] },
    { n: '6a', head: 'Prepaid generations.', body: ['You can pay in USDC or ETH on Base to the address the Service shows. Each generation is charged to your balance at the price shown when you start it. If a generation doesn\'t give you a picture (a check or the image model didn\'t answer, the rules refused the prompt, or the safety checker dropped the picture), that charge is added back to your balance. Payments are final: what you pay is never refunded or paid out as money, and your balance can only be spent on generations here. A payment made through the Service is added to your balance once it has 3 confirmations, while the page is open or the next time you open your wallet on that device. You can also add a payment from your wallet by its transaction, on the wallet panel. Either way, this works within 7 days of the payment; after that, write to us and we\'ll add it.'] },
    { n: 7, head: 'Hiding and removal.', body: ['Nothing on the Service is official or canonical. We may hide content that breaks these Terms. You may hide your own work yourself where the Service offers "Hide", or ask us to hide it, at any time. How this works is set out in our removal policy, linked from About.'] },
    { n: 8, head: 'AI-made material.', body: ['The narration, many pictures (every frame made in Remix among them) and the assistant\'s answers are produced by AI models and are labelled as such. They can be wrong. The assistant\'s commentary is not the book and is not advice of any kind.'] },
    { n: 9, head: 'Outside services.', body: ['The Service relies on other companies\' services, listed in the Privacy Policy. Their terms apply to their part.'] },
    { n: 10, head: 'No warranty.', body: ['The Service is provided as is, without warranties of any kind, to the fullest extent the law allows.'] },
    { n: 11, head: 'Limit of liability.', body: ['To the fullest extent the law allows, we are not liable for indirect or consequential losses, and our total liability for any claim about the Service is limited to one hundred US dollars.'] },
    { n: 12, head: 'Law and disputes.', body: ['These Terms are governed by the laws of Wyoming, USA. Please write to us first; most problems can be settled that way. Any dispute we cannot settle will be resolved by binding individual arbitration in Wyoming, not in court and not as a class action, except that either side may use small-claims court.'] },
    { n: 13, head: 'Changes.', body: ['We may change these Terms. We will post the new version here with a new date, and announce material changes on the Service.'] },
    { n: 14, head: 'Contact.', body: ['snowmoon@wearelum.xyz'] },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  sections: [
    { n: 1, head: 'Who we are.', body: ['Lum LLC, a Wyoming limited liability company, operates Snowmoon Party.'] },
    { n: 2, head: 'The short version.', body: ['You can read and listen without an account, and we keep nothing about you when you do. We use no advertising or analytics trackers and set no cookies. We do not sell data.'] },
    { n: 3, head: 'Kept on your device only.', body: ['Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, a sign-in token that lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen credited. These stay on your device. Clearing your browser\'s site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4).'] },
    {
      n: 4,
      head: 'Kept by us when you sign in.',
      body: [
        'Your account (a Farcaster account or a wallet address; other sign-in methods will be listed here when they come), and what you do with it here:',
        [
          'Quote cards you save, and your likes. A saved card\'s page is public. Your individual likes are private; only totals are shown.',
          'That you agreed to the terms for publishing, and any of your own work you have hidden.',
          'If your wallet is linked to your Farcaster account (because that account verified the wallet\'s address on Farcaster, or because you linked them while signed in with both): which wallet is linked to which account, how, when it was linked or unlinked, and why a link ended. While linked, signing in with the wallet is signing in as that account. You can unlink it on your You page.',
          'Images you publish, with their prompt, your name (Farcaster name or wallet address) and the record of how they were made. These are public.',
          'Frames you make in Remix, each with your words, the full prompt sent, the camera and people you set, the pictures sent with it, what it cost and your name. Anyone with a frame\'s link can see it, with your words and name. You can hide your own frames at any time.',
          'Storyboards you save: the frames in order, how long each is shown and the voice takes you chose. Anyone with a storyboard\'s link can see it, with your name. You can hide it.',
          'The styles and character sheets you choose to use in your pictures ("My picks"), kept until you clear them and seen only by you. An image you publish shows the ones it used, in its recipe.',
          'How many images and Remix frames you make each day, to count the daily limits, and the reports you make.',
          'The Farcaster usernames we have seen for your ID, so a link with an old name still finds your pages after you rename.',
          'If you play Minpentai: your progress against the computer and the people you block, kept until you ask us to delete them; your matches, deleted 30 days after they end; and invites, deleted when they expire after 24 hours. Challenges you send or receive, deleted an hour after they are answered or expire; and a count of today\'s Play requests and when you last opened a match or the lobby, deleted the next day. While you say you are ready to play, other signed-in players see your Farcaster username.',
        ],
        'For a wallet account we also keep its address and its prepaid balance and spending: the payments you made to us (transaction, token, amount and its value in US dollars), what each generation cost, and any charge added back to your balance because a generation gave you no picture. This links money to your account, to keep your balance. Payments on Base are public on-chain, as every Base transaction is. A wallet\'s balance stays with the wallet when it is linked to a Farcaster account.',
        'Deletions happen at the next routine clean-up, so they can come a little later than stated.',
      ],
    },
    { n: 5, head: 'The assistant.', body: ['Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant\'s costs are kept only as daily totals, without your ID, to track our spending.'] },
    { n: 6, head: 'What you publish.', body: ['Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet\'s address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it.'] },
    {
      n: 7,
      head: 'Outside services and what they receive.',
      body: [
        [
          'Vercel hosts the site and sees your IP address and browser details, as any web host does.',
          'Cloudflare stores and serves the pictures and audio, and sees the same when your device fetches them.',
          'Supabase holds our database.',
          'Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make, which are checked against the published rules.',
          'fal.ai receives the prompt for an image you make, and any pictures sent with it (in Remix: a depth picture of the camera you set, and the shot\'s place and cast pictures), and makes the image. It is asked to keep no copy.',
          'Farcaster\'s sign-in services confirm who you are when you sign in. They learn your Farcaster ID and that you signed in here, not what you read or ask. Farcaster\'s public API receives a Farcaster ID when we look up the username to show with published work, and in Minpentai\'s lobby and matches, and a username when a page is opened at /@name.',
          'Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which decides whether you can make images. We keep the score for a day. When you sign in with a wallet, Neynar also receives the wallet\'s address, to find the Farcaster account that has verified it; if exactly one has, your wallet is linked to that account (section 4). We keep the answer for a day. A linked wallet is looked up again at most once a day, and its link ends if that account no longer verifies it; a wallet you unlinked isn\'t looked up again.',
          'ntfy delivers a short alert to us when an image is reported. It carries no content and nothing about you.',
          'If you listen as a podcast, your podcast app fetches the audio from our media host; Spotify serves its own copy.',
          'If you prepay: Base\'s public network endpoint receives the transaction we look up to confirm your payment.',
          'A "report" or "share" link may open GitHub, Farcaster or X, where what you post is public and under their terms.',
        ],
        'Each of these companies has its own privacy policy.',
      ],
    },
    { n: 8, head: 'Children.', body: ['The Service is not directed to children under 13. You must be at least 18 to sign in; we do not verify age.'] },
    { n: 9, head: 'Keeping and deleting.', body: ['We keep account-linked records while you use the Service. Write to us to ask for a copy or for deletion. Work you have published can be hidden on request, and you can hide your own images, Remix frames and storyboards yourself at once; copies others have made under the licence are outside our control.'] },
    { n: 10, head: 'Changes.', body: ['We will post any new version here with a new date. A change to what is collected or where it is sent will also be announced on the Service.'] },
    { n: 11, head: 'Contact.', body: ['snowmoon@wearelum.xyz'] },
  ],
};

/** A short key for a page's exact words (its title and every section), like the notice's noticeKey. */
export function legalKey(doc: LegalDoc): string {
  const words = [doc.title, ...doc.sections.flatMap((s) => [`${s.n}. ${s.head}`, ...s.body.flat()])].join('\n');
  let h = 5381;
  for (const ch of words) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** The owner's reread of this page, if it is of the words shown now. */
export function currentReread(which: 'terms' | 'privacy') {
  const r = LEGAL.ownerReread[which];
  return r && r.words === legalKey(which === 'terms' ? TERMS : PRIVACY) ? r : null;
}

/** The footer line (the starter's words); the last three are links. */
export const FOOTER_LINE = [
  'Snowmoon Party',
  'operated by Lum LLC',
  'independent, not affiliated with the author',
  'book and adaptations GPL v3',
] as const;
