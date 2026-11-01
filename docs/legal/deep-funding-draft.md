# The deep funding test: Privacy and Terms lines (DRAFT, for the owner's reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-01, on branch `deep-funding` (from
`remix-challenge`). DRAFT until the owner says "reread". Nothing in `src/lib/legal.ts` has changed, and its reread
record is untouched. These lines follow `docs/legal/remix-challenge-draft.md`, which must be reread and merged first.

Legal texts describe today (owner, 2026-10-18): these lines ship in the same merge as what they describe, and the
switch stays off until then:

- `DEEP_FUNDING.jurors` (off): the juror page `/challenge/jurors` and its API, which keep each juror's answers in
  `studio.juror_answers` (and the list of jurors in `studio.deep_funding_jurors`, which the owner fills in the SQL
  Editor). `jurorsOn()` also waits for Privacy §4 to say "deep funding", so these words are what turn it on;
  `npm run check:principles` (P6r) fails if the switch is on without them.
- The model run (`scripts/deep-funding.ts run`) is a batch job the owner starts by hand. It sends published sheets
  (their pictures by address, titles, texts and recipes) and the book's words to the models below. Nothing private and
  no account details are sent. The Privacy §7 item below should still be live before the first run, since it names
  where published work goes.

## Before you reread: decisions these lines depend on

1. **Who receives the book's share** (`DEEP_FUNDING.bookRecipient`, UNSET). The plan sends it to the Lake; the setting
   lets you name another recipient. The Terms line below says "the Lake, unless the challenge page names another
   recipient"; change it once you decide.
2. **"No token".** Terms §2 says "There is no token" and principle 7's check wants "No token" on the first screen (it
   fails on production today: the home page's first screen no longer shows "no token"). These lines don't announce a
   mint; they describe how credit is divided and that the split is a plan. The mint gets its own Terms section in its
   own release (as the remix-challenge draft says).
3. **Which models.** The §7 item names the providers of the six open-weight models in
   `src/lib/deep-funding/models.ts`. If you add a closed model for comparison, its provider must be named here first.

---

## Privacy §4 (Kept by us when you sign in): one new list item, after the remix challenge items

> If you are a juror in the remix challenge's deep funding test: that you are a juror for a character, who added you
> and when, and your answers to its questions (which of two versions mattered more and how many times more, and how
> much of a version is new), each with when you gave it. Your answers are published with the test's results under a
> juror number, never with your name or account. Only the site's owner adds jurors.

## Privacy §6 (What you publish): one sentence added at the end

> If you take part in the remix challenge, the versions you publish, with their pictures, words and recipes, may be
> shown to AI models in the deep funding test, which divides the credit for each final version among what it was built
> on. The test's results, published in full, name each version and how much credit it received.

## Privacy §7 (Outside services): a new item

> For the remix challenge's deep funding test, the Vercel AI Gateway, and through it Baseten, Parasail and Mistral AI,
> receive published character sheets (the addresses of their pictures, their titles, texts and recipes) and the
> book's words, to answer how the credit for each final version divides. Every request asks for zero data retention
> and no training on what is sent. They receive nothing about you beyond what is already public on the version's page,
> and nothing about jurors.

---

## Terms: a new section 6e, after 6d (the remix challenge)

> **6e. The deep funding test.** After the remix challenge, AI models and a few jurors divide the credit for each
> final version among the versions it was built on, back to the book. Jurors are people with no entry for that
> character; the site's owner invites them. The method, every model's answers, the jurors' answers (by number), the
> scores and the resulting shares are published. Shares that go to the site's owner, to the book, to admins' work, to
> makers who weren't eligible, to anyone whose total is under 1%, or to anyone without an address that can receive on
> Ethereum go to the Lake, the site's support wallet (the book's share goes to the Lake unless the challenge page
> names another recipient). Any payment that follows is a plan, not a promise, and is decided as the challenge page
> says.

---

## Notes for the owner

- **Juror answers are personal data** (what a person thought), kept with their FID in the database and published by
  number only. The runner's results file holds juror numbers, never FIDs (`answersByNumber`).
- **No admin power is added** (P5b): jurors are added by you in the SQL Editor
  (`supabase/drafts/ADD-JUROR-deep_funding.sql`), so the Terms line says "the site's owner invites them".
- **Addresses.** The payout needs each recipient's mainnet address, checked (an ordinary wallet, or a contract wallet
  deployed on mainnet) and screened. Where those addresses come from (Farcaster-verified addresses through Neynar) is a
  later step with its own Privacy line: Neynar would receive recipients' FIDs to read their verified addresses. Not
  drafted here, because nothing reads addresses yet.
