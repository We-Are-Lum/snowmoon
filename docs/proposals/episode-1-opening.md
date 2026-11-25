# Episode 1: the opening (proposal)

DRAFT. Written by a coding agent (a Claude model, made by Anthropic) for the owner, 2026-11-24. Nothing is built yet.
Mocks: `docs/proposals/episode-1-opening/` (`phone-mock.png`: five phone screens; `desktop-editor.png`,
`desktop-outline.png`; the source is `mock.html`). In the mocks, words in [brackets] are placeholders. The only real
card is the owner's own example ("Zei laughs off the drone" / "we like him straight away").

## What it is

A short card challenge, and partly a lesson in how an opening hooks people. A person outlines Snowmoon's first
episode in at most ten cards. Each card pairs **what happens** with **what it does for the viewer**. A line
marks where the first minute ends.

The goals come first on every screen (landing, editor side panel, the published outline):

1. The first minute is dynamic and compelling.
2. Viewers get hooked on the plot.
3. By the end, they love a character.

## Screens (see mocks)

| # | Screen | Path (proposed) |
|---|---|---|
| P1 | Landing: title, one-line pitch, dates, **the goals**, the owner's example card, *Start with blank cards* / *Start from the sample deck*, *Everyone's outlines*, *Rules* | `/challenge/episode-1` |
| P2 / D1 | The deck: optional title, cards (drag ⋮⋮ to reorder; ↑ ↓ buttons for keyboard and screen readers), the **first-minute line** (dragged like a card, sits between two cards), *+ Add a card* until there are 10. Phone: Goals, Ask AI to comment and Submit sit in a bottom bar. Desktop: the goals and the comment are in a right-hand panel. | `/challenge/episode-1/make` |
| P3 | Tap a card to edit it in a bottom sheet: two fields, each with a counter (100 suggested, hard stop at 120), *Choose a picture from the site*, Delete, Done | (in the deck) |
| P4 | Picture picker: published pictures only (characters, chapter pictures, remixes, mine) and search. Each shows its AI tag, maker and recipe link. | (in the deck) |
| P5 | Everyone's outlines: *Newest* / *Shuffled*, each outline's first cards up to the minute line, then "+ n more". No likes, counts or ranking. | `/challenge/episode-1/outlines` |
| D2 | One outline: the full deck with the minute line, "Words by @maker; no AI wrote them", Share (Farcaster, Bluesky, Lens, Copy link: the person's own app posts it), picture credits, *Make your own outline* | `/challenge/episode-1/o/[id]` |

Starting decks:
- **Blank:** three empty cards, with the line after card 2. The person can move it.
- **Sample deck:** the owner writes it (P2; an agent won't). The sample text shows as grey placeholders. A card
  still holding sample text can't be submitted (checked on the server, word for word against the sample), so every
  published word is the person's.

## AI comment (P2)

- Only when the person taps *Ask AI to comment*. It sends the outline's words only (no pictures, no name).
- It goes through the assistant's existing path (Groq, or Vercel AI Gateway when Groq is busy, both set to keep
  nothing) and counts toward the assistant's daily limit. No new provider.
- The system prompt says: comment against the three goals, ask questions, **never write or rewrite a card**.
  The interface backs this up: there's no "apply" or "copy into card" button. The comment is labelled
  "AI · model, by maker", isn't kept, and is never published.
- Possible addition (owner's call): a check that refuses a reply quoting more than a few words that aren't
  already in the outline.

## Fit with the existing challenge pages

- **Own config entry** (`EPISODE_CHALLENGE = { id: 'episode-1', dates, public }`) next to `CHALLENGE`, with the same
  admin-only switch (404 for everyone else while it's off) and dates in one place. The remix challenge
  (`remix-2026-11`, closing 29 Nov) stays untouched.
- **Paths under `/challenge/episode-1/…`.** A static folder takes precedence over `/challenge/[slug]` (character
  pages), and a test makes sure no character slug can be `episode-1`.
- After 29 Nov, `/challenge` could become a small index with the open challenge first and past ones below, in
  date order, not picked (P5). Until then, *Remix the cast* stays in the menu and Episode 1 is added beside it.
- **Reused as they are:** the `chh-*` header and goals box, `ch-chip` filters, `ChallengeEntriesList`'s
  Newest/Shuffled with `shuffleFresh` (P5g: its exception is widened to name this challenge, and the
  uniform-shuffle test covers it), the share text pattern, `AiTag`, and the eligibility check at submit.
- **Who can submit:** signed in with Farcaster, Lens or Bluesky, and the account passes the site's check (the same
  check as the remix challenge, run once, at submit). Wallet-only accounts can draft but not submit, as for remixes.
- **No post link required** to enter (simpler than the remix challenge). Sharing is optional. *Owner's call.*

## Data it keeps

Drafts stay **on the device** (localStorage) until Submit. Nothing is on the server before then.

One new migration, `supabase/migrations/NEXT_episode_outlines.sql` (run as `postgres`; dry run, migration and a
read-back that inserts and deletes a realistic outline):

```sql
create table studio.challenge_outlines (
  id uuid primary key default gen_random_uuid(),
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),     -- 'episode-1'
  fid bigint not null check (fid <> 0),                               -- person number, as version_posts
  title text check (title is null or length(title) between 1 and 80),
  cards jsonb not null check (jsonb_typeof(cards) = 'array'
                              and jsonb_array_length(cards) between 1 and 10),
      -- [{ "happens": text<=120, "does": text<=120, "picture": uuid|null (element_versions.id) }], in order
  minute_after smallint not null check (minute_after between 0 and 10), -- line after card n (0 = before card 1)
  submitted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint minute_in_deck check (minute_after <= jsonb_array_length(cards))
);
create index on studio.challenge_outlines (challenge, submitted_at desc) where withdrawn_at is null;
create index on studio.challenge_outlines (challenge, fid);
```

- `studio_writer`: select and insert, plus update of `withdrawn_at` only. No delete.
- The server checks each card's lengths, that every `picture` is a published, unhidden version, and that no card
  equals the sample deck.
- The eligibility decision reuses the pattern of `challenge_eligibility` (decided once, at submit, with when).
  The current table is keyed by `version_id`, so this needs either an `outline_id` column or a small sister table.
  Decided when it's built; it's in the same migration.
- **Not kept:** the AI comment and what was sent for it; views; likes; any count.
- **Fixed once submitted** (edits would need a version history). To change an outline, withdraw it and submit
  again. *Limit per person: owner's call. Suggestion: up to 3 live outlines per person.*
- If a moderator hides an attached picture, the card shows "picture hidden" and the outline stays up.

## Legal lines (DRAFT, for the owner's reread; they ship in the feature's own release)

**Privacy §4, new item:**
> If you take part in Episode 1: the opening, your outline stays on your device until you submit it. When you
> submit it, we keep its cards, their order, where the first minute ends, any picture from the site you attached,
> your account and when you submitted; it is public, with your name. If you withdraw it, it is no longer shown, but
> is kept, marked withdrawn, with when.

**Privacy §7, the Groq line adds:** "…and the words of an outline you ask to have commented on."
**Privacy §5 (the assistant):** a clause saying the comment counts as a question there. No other change: nothing
is kept.

**Terms §6f (new, short):** dates on the challenge page; who can submit (the same check as §6e); the words must be
your own (no sample words, and no AI-written words); pictures only from the site, credited to their makers; no
prize *(unless the owner adds one)*.

All of these go to the owner for a reread together with the release. Legal texts describe today.

## Open questions for the owner

1. Dates, and whether it opens after the remix challenge closes (29 Nov).
2. Limit per person (suggestion: 3 live outlines) and whether a post link is needed to enter (suggestion: no).
3. The sample deck: the owner writes it (about 5 cards?).
4. Add the reply check on the AI comment (no long quotes of new words)? Suggestion: yes.
5. Turn `/challenge` into an index after 29 Nov?

## Principles

- **P1 (recipes):** Pass. Nothing is generated. Attached pictures keep their recipe link and AI tag.
- **P2 (people's words):** Pass by design. Cards hold only the person's words. Sample text can't be submitted.
  The AI only comments, labelled, never kept, and it can't fill a card.
  Tension: a comment could still suggest wording that a person types in. The reply check (Q4) narrows this but
  can't rule it out.
- **P3 (models):** Pass. The assistant's existing open model. No new model.
- **P4 (person's action):** Pass. Only Submit publishes.
- **P5 (no featuring):** Pass. Newest or a uniform shuffle (P5g's exception widened to name this challenge,
  with a test). No counts (P5i).
- **P6 (no third-party requests):** Pass. Pictures come from our own hosts, and sharing opens the person's own app.
- **P7 (payments):** Not touched. It's free.
- **P8 (in-world screens):** Not touched.
- **New tension:** P5g's randomness exception currently says "here and nowhere else". Widening it to a second
  challenge is a wording change to the principle, which is the owner's decision.
