/**
 * Terms of Use and Privacy Policy (/terms, /privacy), from the owner's legal starter of
 * 2026-10-08, updated 2026-10-09 (Privacy sections 3, 4 and 7), 2026-10-22 (wallet ↔ Farcaster links: Privacy
 * sections 4, 6 and 7, Terms sections 4 and 5; docs/legal/wallet-links-draft.md), 2026-10-22 again (Minpentai in
 * Farcaster casts: Privacy sections 4, 6 and 7, Terms section 1; docs/legal/minpentai-snap-draft.md), 2026-10-24 (agents: Privacy
 * sections 3, 4 and 7, Terms section 6b; docs/legal/agents-owner-draft.md), 2026-10-31 (Terms section 7, admin picks and Hide; docs/legal/picks-draft.md), 2026-10-30 (Terms section 6c, Support; the
 * owner's own words; docs/legal/support-draft.md; reworded 2026-10-31: support for the We Are Lum team) and 2026-10-18 (accounts, wallets and
 * prepaid generations, the adaptation pages, Remix: drafted by the coding agent, reread by the owner;
 * Terms section 2's last words are the owner's), 2026-11-01 (agent play: Terms section 6d, Privacy section 4;
 * docs/legal/minpentai-agent-play-draft.md), 2026-11-01 again (the remix challenge: Terms sections 6e and 7, Privacy
 * sections 4, 6 and 7; docs/legal/remix-challenge-draft.md), and 2026-11-04 (the furthest chapter sent with assistant
 * questions: Privacy section 3; docs/legal/privacy-furthest-chapter-draft.md).
 * Only the owner changes the words.
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
  // MERGE DAY: the day the sign-in release (bluesky-check, carrying signin-lens-bluesky) merges and its Lens and Bluesky
  // lines go live. Set to 2026-11-05 because the owner plans to merge tonight; if the merge moves, this moves with it.
  effective: '2026-11-06',
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
    // 2026-10-23, the owner's "reread" for the Minpentai snap (PR #37): §1 adds "and its game in Farcaster casts". The
    // words before were 1pz1d61.
    // 2026-10-24, the owner's "Reread" for agents, with his own changes (docs/legal/agents-owner-draft.md): a new
    // section 6b "Agents": invited accounts only; can't spend money; the estimate and approval, once per draft, 20
    // frames, 5 video tests and $2 a day; a frame counts like a Remix frame (free frames, or the balance at the price
    // shown); video tests paid by us for now; and the agent key paragraph as drafted. The words before were 1gifacz.
    // Later on 2026-10-24, the owner's own words for §6b: "Each draft is made at most once" instead of "Each draft can be
    // approved once". The words before were ph5udk.
    // 2026-10-30, the owner's "Reread §6c, replaced with this shorter version" for the Support page: a new section 6c
    // "Support" in his own words (a gift; buys nothing, not an investment, no refunds, not tax-deductible; only the
    // networks the page names; how it's shared out is public on Splits). The words before were qnacwf.
    // 2026-10-31, the owner's "Reread looks good" for admin picks and the admin Hide (phase2-admin, with 0030 applied):
    // §7 adds "Admins may also hide the images the project made itself, its starting points, for any reason." and the
    // admins' pick sentence (docs/legal/picks-draft.md). The words before were vd19s3.
    // 2026-10-31, the owner's "Terms §6c, reread, replaced with" for the Support page: §6c now says the money supports
    // the We Are Lum team, who make the Service (the rest as before, in his words). The words before were 1kta0uf.
    // 2026-10-31, the owner's "f: reread done for #73 (no-token)": §2 no longer says "There is no token." (the rest of
    // §2 unchanged). The words before were unq90g.
    // 2026-10-31, the owner's approval of agent play's lines (docs/legal/minpentai-agent-play-draft.md v4, "approved,
    // with one change"): a new section 6d "Minpentai with your agent". The words before were x7zkw.
    // 2026-11-01, the owner's reread of the remix challenge's lines (docs/legal/remix-challenge-draft.md), with his
    // changes: the section is 6e, not 6d; no "No token" note; no Neynar score kept; and his own IPFS-record wording, which
    // 6e's sentence matches. A new section 6e "The remix challenge." and a §7 sentence on posts added to a version's
    // page. The words before were 1ge4d7a.
    // 2026-11-04, Submit (branch remix-submit; docs/legal/remix-submit-draft.md, drafted by the coding agent; reread pack
    // item 9, reviewed by the coordinator, approved by the owner as the reread): §6e, an entry only once its maker
    // submits it with a link to their own post (answer 9.4); up to three per person; withdraw until entries close; the
    // minimum is three different people. The words before were 15lsr9u.
    // 2026-11-04, the contest (branch contest; docs/legal/contest-draft.md, drafted by the coding agent; reviewed by the
    // coordinator, approved by the owner, with the owner's own words): §6e, one entry a day (Pacific time), for any
    // character, any of them withdrawn until entries close, a withdrawn entry still using its day (replacing "up to
    // three … withdraw one"). The words before were 1l0ppvm.
    // 2026-11-04, Lens and Bluesky sign-in: §5's byline (item 8), approved as drafted, and §4 with the owner's own
    // words for the Bluesky check: "a Bluesky account that passes the site's check (Privacy, section 7)" (reread pack
    // 3.3; "reviewed by the coordinator, approved by the owner", 2026-11-04). The words before were 15lsr9u.
    // 2026-11-05, merging signin-lens-bluesky into contest: both sets of Terms lines were approved word for word and
    // touch different sections (§4, §5 and §6e), so the combined words are recorded as approved. The words before were jskf6i (contest) and 15utl87 (sign-in).
    // 2026-11-04, the reread pack, items 4.4 and 4.5, approved as drafted (branch bluesky-check;
    // docs/legal/bluesky-check-draft.md): §6e names a Bluesky account that passes the site's check for it, and the
    // IPFS record's DID for a Bluesky account. The words before were 15utl87.
    // 2026-11-05, merging bluesky-check into contest: its §6e phrases (4.4, 4.5, approved) on contest's approved §6e.
    // 2026-11-04, the owner's reread of the closed-model lines (docs/legal/closed-model-bases-draft.md at 54b895e2, relayed
    // by the coordinating session: "the owner's reread is done"; Privacy §7, Terms §8 and About "approved as drafted"): §8
    // adds the two sentences on the project's own pictures made with closed models by OpenAI and Google, and their makers'
    // terms. The words before were 15lsr9u.
    // 2026-11-05, Midjourney version 2 (docs/legal/midjourney-reference-draft.md, T2: "approved as drafted", reviewed by
    // the coordinator, approved by the owner; it replaces T1 in the release that publishes the first such picture, the
    // launch's first remixes): §8's sentence adds "or by the owner with Midjourney outside the Service".
    // Combined for the launch (2026-11-05, merging closed-model-bases into challenge-moments): contest's approved 7rdbgk
    // (§4, §5, §6e) and closed-model-bases' approved §8 with T2; they touch different sections and nothing else changed.
    // The words before were 7rdbgk (contest) and 7w024g (closed-model-bases, before T2).
    // 2026-11-06, the owner's reread of the remix challenge as moments ("reviewed by the coordinator, approved by the
    // owner"; docs/legal/challenge-moments-draft.md): §6e T1–T7 as drafted (a picture of a challenge character at one of
    // its moments is what counts; Farcaster, Lens or Bluesky; admins' pictures aren't entries; no three-person minimum;
    // entering needs no purchase; "There is no prize for now." and how the final version and any prize are chosen come
    // before entries close), and the IPFS record sentence removed (option R: nothing writes the record yet). The
    // closed-model lines (§8 with Midjourney T2) are as the owner approved them. Lane B computed the same key. The words
    // before were ar3jr5.
    // 2026-11-08, branch challenge-simple: §6e's entry sentence redrafted for the simpler challenge (no moments; any of the
    // character's pictures on the challenge pages, a base or any remix, including your own), the owner's own after-text
    // (docs/legal/challenge-simple-draft.md). NOT REREAD YET: these words no longer match huq39i, so P6k is red until the
    // owner says "reread". An agent never sets a key.
    terms: { words: 'huq39i', on: '2026-11-06', by: 'FID 6786' },
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
    // 2026-10-23, the owner's "reread" for the Minpentai snap (PR #37), after their questions on §4, §6 and §7 were
    // answered: §4 (the latest cast match, kept with the Farcaster ID, placements turn by turn), §6 (a shared challenge's
    // link: the start and the result, not the moves or the Farcaster ID) and §7 (Neynar's hub checks each tap's
    // signer). The words before were l8xev2.
    // 2026-10-23, the owner's "reread" for #36 ("the privacy line matches the code"): the agent line in §4 (drafts,
    // approved spends, gaps shown to the person and read by the owner), from docs/legal/agents-owner-draft.md. The words
    // before were 11qwrx4.
    // 2026-10-24, the owner's "Reread" for agents, with his own changes (docs/legal/agents-owner-draft.md): §3 (frames
    // and video tests your agent makes on approval are saved, privately: only you can see them), §4 (agent keys, as
    // drafted) and §7 (fal.ai's video test: the frame, your note and your acting notes; LongCat-Video; we copy the video
    // at once and keep it privately). The words before were 1wr7m6g.
    // Later on 2026-10-24, the owner's own words for §7: "your note and the acting notes for that shot (yours, and any
    // your agent filed for you)". His deletion line is NOT in: in the one real test (2026-10-24) fal applied neither the
    // "forbid" ACL nor the one-hour expiry (the file was still served anonymously after 63 minutes), so the line would
    // not be true today. Held for the owner's decision. The words before were ewxjzl.
    // Later on 2026-10-24, the owner's "Option 2": §7's fal.ai item ends with his sentence "fal.ai keeps the video it
    // made on its storage, at an unlisted link it gives only to us but that anyone holding it could open, for as long as
    // fal.ai's settings keep it; we don't set a time yet." The deletion line waits for a real test showing the link
    // gone. The words before were bjz6u1.
    // 2026-10-31, the owner's "f: reread done for #73 (no-token)": §3's "a sign-in token that lasts about an hour" became
    // "your sign-in, which lasts about an hour". The words before were ynzu1t.
    // 2026-10-31, the owner's approval of agent play's lines (v4, with his last sentence "Only we remove match records,
    // by hand, on request."): a §4 paragraph for Minpentai through your agent. The words before were 16s4wpe.
    // 2026-11-01, the owner's reread of the remix challenge's lines (docs/legal/remix-challenge-draft.md), with his
    // changes (no Neynar score kept, only the decision and when) and his own words for §4's entry item and its IPFS item
    // ("The challenge record holds fingerprints, not copies"): §4 adds character sheets you publish, the challenge's
    // entries, the IPFS record and the posts you add; §6 adds a sentence on entries; §7's Neynar item adds the challenge
    // check (once, at publish; never on a page view) and reading an added Farcaster post, a new item for Bluesky and
    // Lens, and Bluesky and Lens in the share-link item. The words before were oa9ihf.
    // 2026-11-04, the owner's "reread done for its Privacy §4 and §7 lines, including 'no longer has it' in place of
    // 'no longer verifies it'" (branch wallet-fid-link; docs/legal/wallet-fid-link-draft.md): §4's link reason and §7's
    // Neynar wallet sentences add the custody address (the address that owns a Farcaster account) beside a verified one.
    // The words before were 1frr16h.
    // 2026-11-04, the reread pack, item 2, approved as drafted ("reviewed by the coordinator, approved by the owner";
    // branch check-decisions; docs/legal/check-decisions-draft.md): §7's Neynar item keeps only the decision and when
    // (90 days a pass, a day a fail; sooner after a report or a moderator's hide, or a new threshold), and §4 adds the
    // decision as an item. The words before were 1wgu7z.
    // 2026-11-04, Submit (branch remix-submit; docs/legal/remix-submit-draft.md, drafted by the coding agent; reread pack
    // item 9, reviewed by the coordinator, approved by the owner as the reread): §4's entry item (what Submit keeps: the
    // version, its character, when, the link to your own post; withdrawn ones deleted) and its daily-counts item (sheet
    // remixes); §6's entry sentence (published and submitted). The words before were 1wgu7z. The approved §4 clause "for a
    // Farcaster or Bluesky post, the site checks with its network that you wrote it" restored on the owner's word
    // (2026-11-04, 14:15): an agent had dropped it as an implementation detail (j7y15c).
    // 2026-11-04, the contest (branch contest; docs/legal/contest-draft.md, drafted by the coding agent; reviewed by the
    // coordinator, approved by the owner): the merged Privacy text (check-decisions' words 1rsayc0 and remix-submit's
    // 16bnvqx, each approved on its own branch) plus §4's contest lines: each version you submit (no "up to three"), and
    // a withdrawn submission stops being an entry but is kept, marked withdrawn, with when (was "it is deleted").
    // 2026-11-04, reread pack item 1 (branch privacy-furthest-chapter; docs/legal/privacy-furthest-chapter-draft.md),
    // reviewed by the coordinator, approved by the owner, 2026-11-04 (1.1: keep the parenthesis): §3's "These stay on
    // your device." adds that the assistant sends the furthest chapter, as a number (or another chapter chosen for a
    // conversation), with each question and its search of the book, so that answers stay within it, and that it isn't
    // kept. The words before were 1rsayc0 (main, with check-decisions' item 2).
    // 2026-11-04, the reread pack ("reviewed by the coordinator, approved by the owner"): check-decisions (item 2, as
    // drafted: §7's Neynar item keeps only the decision and when; §4 adds the decision as an item) and Lens and Bluesky
    // sign-in (item 3: §7's Lens line and §4's 30-day sentence as drafted; §4's Lens check item from check-decisions,
    // with the Farcaster item's own sentence "A pass is removed sooner if your account is reported or one of your
    // pictures is hidden by a moderator.", 3.4). The earlier sign-in items 5–11 were approved as drafted
    // (docs/legal/signin-reread-list.md). The words before were 1rsayc0 (check-decisions alone). LEGAL.effective becomes the merge day.
    // 2026-11-05, merging main's privacy-furthest-chapter (bv4cvf) with this branch's sign-in words (iqpiw8): both sets of
    // lines were approved word for word, and §3 holds both unchanged (main's furthest-chapter clause, this branch's
    // sign-in phrases), so the combined words are recorded as approved. The words before were iqpiw8 (this branch) and bv4cvf (main).
    // 2026-11-05, the sign-in release's reread ("reviewed by the coordinator, approved by the owner"; branch bluesky-check;
    // docs/legal/signin-release-2026-11-05.md): Privacy §4's Bluesky check item (L12, reread pack 4.2) and §7's Bluesky
    // check item (L16, 4.1), approved as drafted; §4's challenge phrases (4.3, 4.4) were approved as drafted on
    // 2026-11-04. The words before were m0e1f7 (the approved words without L12 and L16).
    // 2026-11-05, Privacy §3 line approved by the owner 2026-11-05 (coordinator-reviewed): the device-storage list adds
    // "the Bluesky handle you last signed in with, to fill it in next time" (the Bluesky handle box's prefill; merged from
    // signin-lens-bluesky, where it is 19gyyjh), no other word changed. The words before were 1tllgm9.
    // 2026-11-05, merging signin-lens-bluesky (m0e1f7) into contest (1x81p6y): both sets of lines were approved word for
    // word; §6 holds contest's text with the sign-in byline, so the combined words are recorded as approved (oz9gq1).
    // 2026-11-05 ("reviewed by the coordinator, approved by the owner"): the sign-in release's Privacy §4 and §7 Bluesky
    // check items (L12, L16; bluesky-check 1tllgm9), and on contest §4's Submit clause naming Lens, approved as drafted:
    // "for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it" (was "for a Farcaster
    // or Bluesky post"). The words before were oz9gq1 (contest) and 1tllgm9 (bluesky-check).
    // 2026-11-05, merging main (9tvzf3, the §3 Bluesky-handle prefill line) into contest (12o4xqb): both sets of lines
    // were approved word for word and the merge adds no word, so the combined words are recorded as approved.
    // 2026-11-05, the assistant for any account, step 1 ("reviewed by the coordinator, approved by the owner"; branch
    // assistant-any-account; docs/legal/assistant-any-account-step1.md): P1–P7 approved as drafted, with the owner's fix
    // to §5's last sentence ("not linked to your account" in place of "without your account") and "or the assistant"
    // kept in §7's Lens sentence: §4's three check items add "and asking the assistant"; §5 records questions with your
    // account; §7's Neynar, Lens and Bluesky items say each is asked when you ask the assistant. The words before were 9tvzf3.
    // 2026-11-05, the admin activity page (branch admin-activity; docs/proposals/admin-activity.md): Privacy §4 adds
    // "Our admins can see what we keep, to run the site." before "Deletions happen…", the owner's own wording, approved
    // by the owner 2026-11-05 (coordinator-reviewed: "reviewed by the coordinator, approved by the owner"); no other word
    // changed. It ships with the page. The words before were 9tvzf3.
    // Combined at the admin activity page's merge (2026-11-05): both approved changes above, from the same base 9tvzf3,
    // and nothing else (assistant step 1, uxou8g; the admins line, gorslr).
    // 2026-11-05, merging main (kwoekw: assistant step 1 and the admins line, both approved) into challenge-moments
    // (contest's approved 1h0plt9): §4 keeps contest's daily-counts line ("images, sheet remixes and Remix frames") and
    // main's three check items ("and asking the assistant"); §5 is main's (assistant step 1); §6 is contest's entry
    // sentence ("publish and submit is shown as an entry"); the admins line is main's. Approved changes only, no other
    // word; lane B computed the same key (kss5zm). The words before were 1h0plt9 (contest) and kwoekw (main).
    // 2026-11-04, the owner's reread of the closed-model lines (docs/legal/closed-model-bases-draft.md at 54b895e2, relayed
    // by the coordinating session: "the owner's reread is done", "approved as drafted"): §7 adds the OpenAI and Google item
    // after fal.ai (the remix challenge's bases, styles and references; no training; Google on Vertex keeps no copy; OpenAI
    // up to 30 days for abuse monitoring). The words before were 1wgu7z.
    // 2026-11-04 after the restart: Privacy §7's bases item and Terms §8's sentences are redrafted (owner's decisions
    // 6.3, 6.4 and 8; docs/legal/closed-model-bases-draft.md, "Redraft v2"), not yet reread, so these keys no longer
    // match the words (P6k, P6l red) until the owner rereads them. An agent never sets a key.
    // 2026-11-05, the closed-model lines' rewording approved (relayed by the accounts session: "approved by the owner
    // (2026-11-04, with the 2026-11-05 wording fixes)"): §7's OpenAI and Google item, OpenAI "for up to 30 days to check
    // for abuse, and longer if needed to deal with abuse or required by law", Google "except in memory for up to 24
    // hours, and may keep logs to check for abuse, for up to 90 days". Combined for the launch: kss5zm (contest + main,
    // approved) and closed-model-bases' approved §7 item; nothing else changed. The words before were kss5zm.
    // 2026-11-06, the owner's reread of the remix challenge as moments ("reviewed by the coordinator, approved by the
    // owner"; docs/legal/challenge-moments-draft.md): §4 P1–P5 (pictures, not versions; open sheet remixing removed), §6
    // and §7 as drafted, and §4's IPFS record item removed (option R). The closed-model §7 item is as the owner approved
    // it. Lane B computed the same key. The words before were 6llf1.
    privacy: { words: 'ozmbuf', on: '2026-11-06', by: 'FID 6786' },
  },
};

export const TERMS: LegalDoc = {
  title: 'Terms of Use',
  sections: [
    { n: 1, head: 'Who runs this.', body: ['Snowmoon Party (snowmoon.party, its Farcaster mini app and its game in Farcaster casts, together "the Service") is operated by Lum LLC, a Wyoming limited liability company ("we"). By using the Service you agree to these Terms.'] },
    { n: 2, head: 'What this is.', body: ['An independent, open edition of the novel Snowmoon by Vitalik Buterin, with read-aloud audio, pictures, a game reconstruction and a reading assistant. It is not affiliated with or endorsed by the author. You can prepay for generations. Payments are final. Nothing else here is for sale.'] },
    { n: 3, head: 'The book and the licence.', body: ['Snowmoon is the author\'s work, released under the GNU General Public License version 3. The text, pictures, audio and code on the Service are offered under that same licence, and the source and the full record of how each piece was made are public in our repository. Nothing in these Terms limits the rights the licence gives you.'] },
    { n: 4, head: 'Who can use it.', body: ['Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link a wallet, a Lens account or a Bluesky account to your Farcaster account, and a Bluesky account to your Lens account; while it is linked, signing in with it is signing in as that account. Free daily images and frames come with a Farcaster account, with a Lens account whose Lens score is at least the one the Service shows, and with a Bluesky account that passes the site\'s check (Privacy, section 7); a Bluesky account that doesn\'t pass gets them only while it is linked to a Farcaster or Lens account. To prepay for generations, sign in with a wallet (section 6a).'] },
    { n: 5, head: 'What you add.', body: ['If you publish something through the Service, or make a frame in Remix (which is saved, and can be seen by anyone with its link, as soon as it is made), it remains yours, and you license it to everyone under GPL version 3. You confirm it is your own work, or that you have the right to license it this way. Your name is shown with it: your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle. Work made with a wallet that is linked to your Farcaster account is shown with your Farcaster name. Where the Service says so before you publish, the prompts and any planning thread that led to the piece are published with it. Published work is public and others may copy it under the licence. We can hide it on request (see section 7), but we cannot recall copies others have made.'] },
    { n: 6, head: 'What you must not do.', body: ['Don\'t post anything unlawful, harassing or sexual involving minors; don\'t post other people\'s private information; don\'t impersonate anyone or present your work as the author\'s or as official; don\'t try to get around sign-in, daily limits or spending caps; don\'t interfere with the Service.'] },
    { n: '6a', head: 'Prepaid generations.', body: ['You can pay in USDC or ETH on Base to the address the Service shows. Each generation is charged to your balance at the price shown when you start it. If a generation doesn\'t give you a picture (a check or the image model didn\'t answer, the rules refused the prompt, or the safety checker dropped the picture), that charge is added back to your balance. Payments are final: what you pay is never refunded or paid out as money, and your balance can only be spent on generations here. A payment made through the Service is added to your balance once it has 3 confirmations, while the page is open or the next time you open your wallet on that device. You can also add a payment from your wallet by its transaction, on the wallet panel. Either way, this works within 7 days of the payment; after that, write to us and we\'ll add it.'] },
    { n: '6b', head: 'Agents.', body: ['Agents are open only to accounts we invite. They can\'t spend money. When an agent drafts something that costs money (a new frame or a video test), it shows the estimated cost, and nothing is made until you approve it. Each draft is made at most once, and each day is limited to 20 frames, 5 video tests and $2 in all. A frame counts like any other Remix frame: on a Farcaster account it uses your free frames for the day; on a wallet account it\'s charged to your balance at the price shown (section 6a). Video tests are paid by us for now.', 'You can make a personal agent key for an app that connects with a key. Keep it secret, as you would a password. Until it ends (after 30 days, or when you disconnect it), anyone holding it can read and draft for you, but not publish. Nothing it drafts is paid for unless you approve it, and never more than the cap you set. If it gets out, disconnect it on your You page.'] },
    { n: '6c', head: 'Support.', body: ['You can send money to the address on the Support page (a Splits account on Ethereum or Base) to support the We Are Lum team, who make the Service. It\'s a gift: it buys nothing on the Service, isn\'t an investment, can\'t be refunded and isn\'t tax-deductible (Lum LLC is not a charity). Send it only on the networks the page names; money sent on any other network may be lost. How it\'s shared out is public on Splits.'] },
    { n: '6d', head: 'Minpentai with your agent.', body: ['If we invite you, your agent can play Minpentai for you against the site\'s computer: start a match, see your side of the board (never the other side\'s while the match is on), try moves in a private sandbox, and send your moves. It sends the moves you choose, or, if you tell it how to play (a standing order), moves it chooses under it; you can also ask the site\'s computer to play a turn for you. Each turn\'s record says whether you, your agent or the site\'s computer chose it. When a match ends, its record is public: the board, every turn\'s moves, who chose them, and the model your agent said it runs (shown as self-reported; we don\'t check it). The record doesn\'t show your Farcaster name or ID, or your agent\'s name. Agent matches don\'t count toward one-on-one results. Most of Minpentai\'s rules are invented for this edition; the book edition\'s pieces are drawn from passages in the book.'] },
    { n: '6e', head: 'The remix challenge.', body: ['The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster, Lens or Bluesky account that passes the site\'s check for it may remix pictures of its characters; making sheets and styles stays by invitation. Entering is free and needs no purchase. A picture counts as an entry only once its maker submits it on the Service, with a link to their own post about it on Farcaster, Bluesky or Lens that links to its page, and only if it is a picture of a challenge character, remixed from one of that character\'s pictures on the challenge pages (a base or any remix, including your own; not made from scratch), made on the Service during the challenge by an account we invited or one that passed the site\'s check when it was published. Each person can submit one entry a day (Pacific time), for any character, and can withdraw any of them until entries close; a withdrawn entry still uses its day. Admins can make pictures, but theirs aren\'t entries. There is no prize for now. How the final version is chosen, and any prize, are added to the challenge\'s rules before entries close. We may change or end the challenge, and the page will say so.'] },
    { n: 7, head: 'Hiding and removal.', body: ['Nothing on the Service is official or canonical. We may hide content that breaks these Terms. Admins may also hide the images the project made itself, its starting points, for any reason. You may hide your own work yourself where the Service offers "Hide", or ask us to hide it, at any time. A post you add to a version\'s page must be one that links there; you or a moderator can remove it, and we remove a post on its writer\'s request. How this works is set out in our removal policy, linked from About. Admins (the site\'s owner and people the owner names) may pick which image shows first for a moment of the book or a glossary item; it is labelled with who picked it, and you can switch to the most liked, the newest or the images you liked, and every other image stays one tap away.'] },
    { n: 8, head: 'AI-made material.', body: ['The narration, many pictures (every frame made in Remix among them) and the assistant\'s answers are produced by AI models and are labelled as such. They can be wrong. The assistant\'s commentary is not the book and is not advice of any kind. Some pictures are made with closed models by OpenAI and Google, by the project or by someone who chooses one for a challenge picture, or by the owner with Midjourney outside the Service, named with their maker on each picture\'s recipe; they are offered under the licence in section 3, as far as anyone holds rights in them, and their makers\' terms bind us, not you.'] },
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
    { n: 3, head: 'Kept on your device only.', body: ['Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, the Bluesky handle you last signed in with, to fill it in next time, and a payment you have sent but not yet seen credited. If you choose a closed model for a challenge picture, it also stores that you confirmed you are 18 or older, and which makers\' notices you asked not to be shown again; with each such picture we receive only that you confirmed, and don\'t keep it. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn\'t kept. Clearing your browser\'s site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).'] },
    {
      n: 4,
      head: 'Kept by us when you sign in.',
      body: [
        'Your account (a Farcaster account, a wallet address, a Lens account or a Bluesky account), and what you do with it here:',
        [
          'Quote cards you save, and your likes. A saved card\'s page is public. Your individual likes are private; only totals are shown.',
          'That you agreed to the terms for publishing, and any of your own work you have hidden.',
          'If your wallet is linked to your Farcaster account (because Farcaster lists the wallet\'s address as that account\'s, as its custody address or as an address it verified, or because you linked them while signed in with both): which wallet is linked to which account, how, when it was linked or unlinked, and why a link ended. While linked, signing in with the wallet is signing in as that account. You can unlink it on your You page.',
          'If you sign in with Lens: your Lens account\'s address and its Lens username, as Lens gave them at your last sign-in, and when you first and last signed in that way. If you sign in with Bluesky: your Bluesky account\'s identifier (its DID) and your handle, if your handle points back to that account, and when you first and last signed in that way. We keep these while you use the Service (section 9). We keep no token from Lens or from your Bluesky server: we use what they give us once, to confirm who you are, and drop it. We don\'t keep the wallet you signed with for Lens.',
          'If your Lens or Bluesky account is linked to your Farcaster account, or your Bluesky account to your Lens account (you linked them while signed in with both): which is linked to which, and when it was linked or unlinked. While linked, signing in with it is signing in as that account. You can unlink it on your You page. An account you unlink can be linked to a different account only after 30 days.',
          'Images you publish, with their prompt, your name (Farcaster name, wallet address, Lens username or Bluesky handle) and the record of how they were made. These are public.',
          'Character sheets you publish, with their text, their views, your name and the record of how each view was made. These are public.',
          'If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site\'s check: Neynar\'s score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each picture you submit as an entry, with its character and when you submitted it. Submitting needs the link to your own post about it, which is kept and listed on the picture\'s page like any post you add (below); for a Farcaster, Bluesky or Lens post, the site checks with its network that you wrote it. If you withdraw a submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove it. Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character. When you make a challenge picture you can choose its model: an open model, or a closed model, named with its maker on the screen and in the picture\'s record. A picture made with a closed model counts as three of your free pictures that day.',
          'If you add where a version was posted: the post\'s network, its id there, its writer\'s handle, when it was posted, its address, and who added it and when. The network, handle, date and a link to the post are shown on the version\'s page; who added it isn\'t. You can remove a post you added; a moderator can remove any of them, on its writer\'s request or under the Terms.',
          'Frames you make in Remix, each with your words, the full prompt sent, the camera and people you set, the pictures sent with it, what it cost and your name. Anyone with a frame\'s link can see it, with your words and name. You can hide your own frames at any time.',
          'Storyboards you save: the frames in order, how long each is shown and the voice takes you chose. Anyone with a storyboard\'s link can see it, with your name. You can hide it.',
          'The styles and character sheets you choose to use in your pictures ("My picks"), kept until you clear them and seen only by you. An image you publish shows the ones it used, in its recipe.',
          'How many images, sheet remixes and Remix frames you make each day, to count the daily limits, and the reports you make.',
          'Whether your Farcaster account passed the check for making images and asking the assistant (its Neynar score against the score needed), when that was decided, and the score needed then; never the score itself. A pass is kept for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator.',
          'Whether your Lens account passed the check for making images and asking the assistant (its Lens score against the score needed), when that was decided, and the score needed then; never the score itself. A pass is kept for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator.',
          'Whether your Bluesky account passed the check for making images and asking the assistant (section 7), and when that was decided; never its age or its post count. A pass is kept for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator.',
          'If you use an agent here (for now, only people the site has invited): the edits it drafts for your own scene versions (a new frame, another voice take, a shot\'s timing, who speaks in a shot, a video test), each with the note it was drafted from. A frame or video test you approve is kept with what it cost, the model and the pictures sent, privately and only for you. When your agent can\'t do something you asked, it may record what you asked and what was missing. That record is shown to you on your You page, and to the site\'s owner, who reads them, with your name, to decide what to build next. It is never published.',
          'If you make an agent key: its name, the spend cap you set, when it was made, when it ends (30 days later) and when it was last used. The key itself is shown to you once and kept only in coded form, so we can\'t show it again; it isn\'t written to our logs.',
          'The Farcaster usernames we have seen for your ID, so a link with an old name still finds your pages after you rename.',
          'If you play Minpentai: your progress against the computer and the people you block, kept until you ask us to delete them; your matches, deleted 30 days after they end; and invites, deleted when they expire after 24 hours. Challenges you send or receive, deleted an hour after they are answered or expire; and a count of today\'s Play requests and when you last opened a match or the lobby, deleted the next day. While you say you are ready to play, other signed-in players see your Farcaster username.',
          'If you play Minpentai in a Farcaster cast: your latest practice match there, kept with your Farcaster ID (its random seed, the computer level, the extra rule and where you placed your pieces, turn by turn), so you can resume it; deleted when the match ends, or 30 days after your last turn. Nothing else about these matches is kept or recorded.',
          'If you play Minpentai through your agent (for now, only people the site has invited): each match it starts, kept with your account. That is the board, every turn\'s moves and who chose them (you, your agent or the site\'s computer), when each turn was played, your standing order (its words and the style it was matched to), any note your agent attached to a turn, your agent\'s name and the model it said it runs. While the match is on, only you can see your side, through your agent and your match link; the site\'s computer sees only its own side. When the match ends, the record is public: anyone can read the board, the moves, who chose them, and the model your agent named. It doesn\'t show your Farcaster name or ID, or your agent\'s name (which elsewhere on the site appears as "agent of" you), and your standing order\'s words and your agent\'s notes stay private. Your match link opens your side for anyone who has it, until your agent replaces it; the page tells browsers not to pass it on to other sites. Match records, finished or not, are kept until you ask us to remove them: write to us (section 11) with the match\'s link or id, and we delete the whole record by hand. Only we remove match records, by hand, on request.',
        ],
        'For a wallet account we also keep its address and its prepaid balance and spending: the payments you made to us (transaction, token, amount and its value in US dollars), what each generation cost, and any charge added back to your balance because a generation gave you no picture. This links money to your account, to keep your balance. Payments on Base are public on-chain, as every Base transaction is. A wallet\'s balance stays with the wallet when it is linked to a Farcaster account.',
        'Our admins can see what we keep, to run the site.',
        'Deletions happen at the next routine clean-up, so they can come a little later than stated.',
      ],
    },
    { n: 5, head: 'The assistant.', body: ['Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. With your account we record only how many questions you ask and when, to count the daily limit. The assistant\'s costs are kept only as daily totals, not linked to your account, to track our spending.'] },
    { n: 6, head: 'What you publish.', body: ['Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet\'s address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it. If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match\'s start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a picture of one of its characters that you publish and submit is shown as an entry, on its page and on the challenge page.'] },
    {
      n: 7,
      head: 'Outside services and what they receive.',
      body: [
        [
          'Vercel hosts the site and sees your IP address and browser details, as any web host does. To offer a model only where its maker serves, we read the country your connection comes from; we don\'t keep it.',
          'Cloudflare stores and serves the pictures and audio, and sees the same when your device fetches them.',
          'Supabase holds our database.',
          'Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make, which are checked against the published rules.',
          'fal.ai receives the prompt for an image you make, and any pictures sent with it (in Remix: a depth picture of the camera you set, and the shot\'s place and cast pictures), and makes the image. It is asked to keep no copy. For a video test you approve, fal.ai receives the shot\'s frame (already public on the site), your note and the acting notes for that shot (yours, and any your agent filed for you), and makes a short video with the open LongCat-Video model. It is asked to keep no copy of the request. It returns the video at a link on its own storage; we copy it at once and keep it privately, for you. fal.ai keeps the video it made on its storage, at an unlisted link it gives only to us but that anyone holding it could open, for as long as fal.ai\'s settings keep it; we don\'t set a time yet.',
          'If you choose a closed model for a challenge picture, its maker, OpenAI or Google, receives through Vercel AI Gateway your prompt and the picture you chose. It receives nothing else about you, and may not train on them. OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law. Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days. The gateway keeps no copy.',
          'OpenAI and Google receive, through Vercel AI Gateway, the prompt and the reference pictures for some of the pictures the project makes itself, such as the remix challenge\'s bases, styles and references. They receive nothing about you, and may not train on them. OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law. Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days. Each picture\'s recipe names the model and its maker.',
          'Farcaster\'s sign-in services confirm who you are when you sign in. They learn your Farcaster ID and that you signed in here, not what you read or ask. Farcaster\'s public API receives a Farcaster ID when we look up the username to show with published work, and in Minpentai\'s lobby and matches, and a username when a page is opened at /@name.',
          'If you sign in with Lens: our server asks Lens\'s API (api.lens.xyz) for a sign-in message for your Lens account and the wallet you sign with, and sends Lens your signature, which Lens checks. Lens receives those two addresses and learns that you signed in here. To show you which Lens accounts your wallet can sign in as, Lens also receives your wallet\'s address. When you make an image or a frame, or ask the assistant, without a linked Farcaster account, and we have no current decision for your Lens account, Lens\'s API also receives your Lens account\'s address, to look up its Lens score, which decides whether you get free images and frames and can ask the assistant. We don\'t keep the score: we keep only whether your account passed and when, for up to 90 days (a day if it didn\'t pass), and we check again sooner if your account is reported, one of your pictures is hidden by a moderator, or the score needed changes. Lens is never asked about you when someone views a page or when you open the image or frame maker or the assistant.',
          'If you sign in with Bluesky: our server looks up your handle (in its domain\'s DNS, or at the handle\'s own web address), your account\'s public record (at plc.directory, run by Bluesky, or at your own domain), and your Bluesky server (your PDS) and the sign-in server it names, which may be Bluesky\'s or another provider\'s. You approve the sign-in on that sign-in server, under its own terms, and it learns that you signed in here. We ask it only to confirm who you are, not to read or post anything for you.',
          'Neynar receives your Farcaster ID when you make or publish an image or a character sheet, or ask the assistant, and your account has no current check, to look up its account score, which decides whether you can make images and ask the assistant. We don\'t keep the score: we keep only whether your account passed and when, for up to 90 days (a day if it didn\'t pass), and we check again sooner if your account is reported, one of your pictures is hidden by a moderator, or the score needed changes. During the remix challenge, that check also decides, once, when you publish a picture of a challenge character, whether it can count as an entry. Neynar is never asked about you when someone views a page. When someone adds a Farcaster post to a version\'s page, Neynar receives that post\'s address or id, to read it. When you sign in with a wallet, Neynar also receives the wallet\'s address, to find the Farcaster account whose custody address it is or that has verified it; if exactly one account has it, your wallet is linked to that account (section 4). We keep the answer for a day. A linked wallet is looked up again at most once a day, and its link ends if that account no longer has it; a wallet you unlinked isn\'t looked up again. When you play Minpentai inside a Farcaster cast, your Farcaster app signs each tap, and we ask Neynar\'s Farcaster hub which signing keys your Farcaster ID has, to check the signature: Neynar receives your Farcaster ID, and we keep its answer in memory for five minutes.',
          'If you sign in with Bluesky and your Bluesky account isn\'t linked to a Farcaster or Lens account: when you make an image or a frame, ask the assistant, or publish a remix during the remix challenge, and your account has no current check, our server sends your Bluesky account\'s identifier (its DID, not your handle) to Bluesky\'s public AppView (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether you can make images and frames for free, whether you can ask the assistant, and whether a remix can count as an entry. We keep only whether your account passed (at least 30 days old, with at least 5 posts in the last 30 days, when we check) and when, for up to 90 days (a day if it didn\'t pass); never the dates or posts we read. We check again sooner if your account is reported or one of your pictures is hidden by a moderator. Bluesky is never asked about you when someone views a page.',
          'Bluesky and Lens receive the details of a post someone adds to a version\'s page (Bluesky: its writer\'s handle or account id and the post\'s id; Lens: the post\'s id), so our server can read the post and check it links there. They receive nothing about you or the person who added it, and your browser never contacts them for this.',
          'ntfy delivers a short alert to us when an image is reported. It carries no content and nothing about you.',
          'If you listen as a podcast, your podcast app fetches the audio from our media host; Spotify serves its own copy.',
          'If you prepay: Base\'s public network endpoint receives the transaction we look up to confirm your payment.',
          'A "report" or "share" link may open GitHub, Farcaster, X, Bluesky or Lens (through hey.xyz), where what you post is public and under their terms.',
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

/**
 * The closed models' notices on the remix form (owner, 2026-11-04; branch remix-model-choice; version 3 for the
 * challenge's remix screen, branch challenge-models, 2026-11-08, DRAFT, pending the owner's reread: the maker receives
 * the prompt and the picture chosen; the sheet form, off, would need its own words before its switch goes on), one per maker, shown the first time a device picks one of that maker's models, and again when the maker's
 * notice version (src/lib/config.ts CLOSED_PROVIDERS) goes up. The label shows beside the model in the picker always.
 * The 18+ line and its box show with the first notice a device sees. Facts and their sources:
 * docs/legal/remix-model-choice-draft.md.
 */
export const MODEL_NOTICES = {
  OpenAI: {
    label: 'OpenAI keeps prompts up to 30 days',
    title: 'A closed model by OpenAI',
    text: [
      'GPT Image 2.5 Sunburst is made by OpenAI. Its weights aren\'t published, so its recipe can\'t be re-run exactly.',
      'OpenAI receives your prompt and the picture you chose, through Vercel AI Gateway. Nothing else about you.',
      'OpenAI may keep them for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law. It doesn\'t train its models on them. The gateway keeps no copy.',
    ],
  },
  Google: {
    label: 'Google keeps no copy past 24 hours',
    title: 'A closed model by Google',
    text: [
      'Gemini 3.1 Flash Image is made by Google. Its weights aren\'t published, so its recipe can\'t be re-run exactly.',
      'Google receives your prompt and the picture you chose, through Vercel AI Gateway. Nothing else about you.',
      'Google keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days. It doesn\'t train its models on them. The gateway keeps no copy.',
    ],
  },
} as const;
/** With the first closed-model notice a device sees: the 18+ reminder and its box (the Terms' rule; not a verification). */
export const ADULT_CONFIRM = {
  line: 'Closed models are for people 18 or older, as signing in here is (Terms, section 4).',
  box: 'I\'m 18 or older',
} as const;
export const NOTICE_BUTTONS = { ok: 'OK', never: 'Don\'t remind me again' } as const;

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
