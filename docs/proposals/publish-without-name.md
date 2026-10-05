# Proposal: publish without one's name

> **Proposal on file. Not now** (owner, Oct 5, 2026). Nothing here is built.

## What it would offer

A person could choose, per contribution, to publish their words (a prompt, a
line) without their Farcaster name. The public would see "a reader" instead
of the name. The project would still record internally who wrote it.

## How it would work

- **The choice.** In the preview before publishing, a toggle: "Show my
  Farcaster name" (on by default) or "Publish without my name". The consent
  screen and the line under every text box would gain one clause: "shown with
  your Farcaster name, unless you choose to publish without it". That is new
  wording, so everyone would be asked again (a new version in
  `config/consent.json`).
- **The record.** `created_by_fid` stays on every row as now; it is needed for
  limits, likes, removal requests and moderation. A new column,
  `elements.show_author boolean not null default true`, says whether the name
  is shown. It is set at publication and can change only from true to false
  (a person can later remove their name, never add it to something published
  anonymously by someone else's choice).
- **The public read.** Today the public can read `created_by_fid` on published
  elements. For anonymous work, that column must not reach the public: the
  public would read elements through a view that returns `null` for
  `created_by_fid` where `show_author` is false, and the base table's FID
  column would stop being publicly readable (the same pattern as 0004's
  totals). Recipes carry `created_by_fid` too and would need the same view.
- **What stays visible.** The words, the prompt, the recipe, the date, likes.
  Principle 1 still holds: the prompt is public, only the name is not.

## Limits to say plainly

- It is not anonymity from the project: the maintainer and moderators can see
  who wrote it, and a legal request could reach it.
- Writing style, timing and other public activity can still identify someone.
- Words already published with a name cannot be made unnamed in copies others
  have made.

## Tensions

- **Principle 2** says the words of a piece are "the author's or a signed-in
  person's". Anonymous publication keeps that true (a signed-in person wrote
  them) but the reader can no longer see which person. The principle may need
  to say "a signed-in person's, named unless they chose otherwise".
- **Moderation and abuse.** Unnamed contributions are easier to abuse. Limits
  stay per FID, so this is mostly about what readers can judge.
- **Brief rule 4 (likes and ratings).** Nothing changes: likes stay counted per
  FID and are already private after 0004.
