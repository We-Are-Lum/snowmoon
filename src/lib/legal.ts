/**
 * Terms of Use and Privacy Policy (/terms, /privacy), from the owner's legal starter of
 * 2026-10-08, updated 2026-10-09 (Privacy sections 3, 4 and 7). The words are the starter's,
 * word for word; only the owner changes them.
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
  n: number;
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
  effective: null,
  ownerReread: { terms: null, privacy: null },
};

export const TERMS: LegalDoc = {
  title: 'Terms of Use',
  sections: [
    { n: 1, head: 'Who runs this.', body: ['Snowmoon Party (snowmoon.party and its Farcaster mini app, together "the Service") is operated by Lum LLC, a Wyoming limited liability company ("we"). By using the Service you agree to these Terms.'] },
    { n: 2, head: 'What this is.', body: ['An independent, open edition of the novel Snowmoon by Vitalik Buterin, with read-aloud audio, pictures, a game reconstruction and a reading assistant. It is not affiliated with or endorsed by the author. There is no token and nothing here is for sale.'] },
    { n: 3, head: 'The book and the licence.', body: ['Snowmoon is the author\'s work, released under the GNU General Public License version 3. The text, pictures, audio and code on the Service are offered under that same licence, and the source and the full record of how each piece was made are public in our repository. Nothing in these Terms limits the rights the licence gives you.'] },
    { n: 4, head: 'Who can use it.', body: ['Anyone can read and listen without an account. To sign in with Farcaster you must be at least 18 years old.'] },
    { n: 5, head: 'What you add.', body: ['If you publish something through the Service, it remains yours, and you license it to everyone under GPL version 3. You confirm it is your own work, or that you have the right to license it this way. Your Farcaster name is shown with it. Where the Service says so before you publish, the prompts and any planning thread that led to the piece are published with it. Published work is public and others may copy it under the licence. We can hide it on request (see section 7), but we cannot recall copies others have made.'] },
    { n: 6, head: 'What you must not do.', body: ['Don\'t post anything unlawful, harassing or sexual involving minors; don\'t post other people\'s private information; don\'t impersonate anyone or present your work as the author\'s or as official; don\'t try to get around sign-in, daily limits or spending caps; don\'t interfere with the Service.'] },
    { n: 7, head: 'Hiding and removal.', body: ['Nothing on the Service is official or canonical. We may hide content that breaks these Terms. You may ask us to hide your own work at any time. How this works is set out in our removal policy, linked from About.'] },
    { n: 8, head: 'AI-made material.', body: ['The narration, many pictures and the assistant\'s answers are produced by AI models and are labelled as such. They can be wrong. The assistant\'s commentary is not the book and is not advice of any kind.'] },
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
    { n: 3, head: 'Kept on your device only.', body: ['Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, a sign-in token that lasts about an hour. These stay on your device. Clearing your browser\'s site data removes them.'] },
    {
      n: 4,
      head: 'Kept by us when you sign in.',
      body: [
        'Your Farcaster ID, and what you do with it here:',
        [
          'Quote cards you save, and your likes. A saved card\'s page is public. Your individual likes are private; only totals are shown.',
          'That you agreed to the terms for publishing, and any of your own work you have hidden.',
          'Images you publish, with their prompt, your Farcaster username and the record of how they were made. These are public.',
          'How many images you make each day, to count the daily limit, and the reports you make.',
          'If you play Minpentai: your progress against the computer and the people you block, kept until you ask us to delete them; your matches, deleted 30 days after they end; and invites, deleted when they expire after 24 hours. Challenges you send or receive, deleted an hour after they are answered or expire; and a count of today\'s Play requests, deleted the next day. While you say you are ready to play, other signed-in players see your Farcaster username.',
        ],
      ],
    },
    { n: 5, head: 'The assistant.', body: ['Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant\'s costs are kept only as daily totals, without your ID, to track our spending.'] },
    { n: 6, head: 'What you publish.', body: ['Anything you publish is public, shown with your Farcaster username (your Farcaster ID on quote cards), the date, and the record of how it was made. See the Terms, sections 5 and 7.'] },
    {
      n: 7,
      head: 'Outside services and what they receive.',
      body: [
        [
          'Vercel hosts the site and sees your IP address and browser details, as any web host does.',
          'Cloudflare stores and serves the pictures and audio, and sees the same when your device fetches them.',
          'Supabase holds our database.',
          'Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make, which are checked against the published rules.',
          'fal.ai receives the prompt for an image you make, and makes the image. It is asked to keep no copy.',
          'Farcaster\'s sign-in services confirm who you are when you sign in. They learn your Farcaster ID and that you signed in here, not what you read or ask. Farcaster\'s public API receives a Farcaster ID when we look up the username to show with published work, and in Minpentai\'s lobby and matches.',
          'Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which decides whether you can make images. We keep the score for a day.',
          'ntfy delivers a short alert to us when an image is reported. It carries no content and nothing about you.',
          'If you listen as a podcast, your podcast app fetches the audio from our media host; Spotify serves its own copy.',
          'A "report" link may open GitHub or Farcaster, where what you post is public and under their terms.',
        ],
        'Each of these companies has its own privacy policy.',
      ],
    },
    { n: 8, head: 'Children.', body: ['The Service is not directed to children under 13. You must be at least 18 to sign in; we do not verify age.'] },
    { n: 9, head: 'Keeping and deleting.', body: ['We keep account-linked records while you use the Service. Write to us to ask for a copy or for deletion. Work you have published can be hidden on request; copies others have made under the licence are outside our control.'] },
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
