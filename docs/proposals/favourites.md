# Proposal: favourites

> **Proposal. Nothing here is built.** Written Oct 6, 2026 at the owner's
> request. It builds on "my picks" in the brief (v5, §4e.4) and on
> `studio.picks` (migration 0002), which exist in the schema but have no
> interface yet.

## What it would offer

A person can mark designs as their favourites: one version of a character, a
location, and a style. From then on, whatever *they* create (an image
proposal, a quote card's look, a comic panel) starts from their favourites by
default. Nobody else's view, defaults or creations change, and nothing is
marked official.

## How it would work

- **What can be a favourite.** One version per entity: per character, per
  location, and one style. This is `studio.picks` as it stands: `(fid,
  entity_id, version_id)`, one row per person per entity, pinned to a version.
  A style is a `design` element on a `style` entity, so styles need no new
  table.
- **Choosing.** On a design's page, "Use this as my default for Deluin" (or
  for this location, or as my style). Choosing another version of the same
  entity replaces the pick. "Clear" removes it.
- **Where it applies.** Only in the creating person's own composer. When they
  start a generation, their picks that fit the scene are pre-filled as
  references, shown as chips they can remove or swap for this one creation
  without changing the pick. Each reference actually used is written as a
  `uses` link on the result (the brief's rule: references live only in
  `links`), and the recipe records the exact versions.
- **Pinned, not floating.** A pick names a version. If the design's author
  publishes a newer version, the person sees "newer version available" and
  decides; their past and future creations never change silently.
- **With no picks.** The composer falls back to the brief's default (the most
  built-on version), labelled as exactly that ("most built on"), never as
  "official" or "canon".

## What nobody else sees

- **Picks are private.** `studio.picks` already has no public read and no
  grant to the public roles (0002); `P6b` checks it. Nobody can list whose
  favourite a design is.
- **No counts.** Pick counts are not shown or used for ordering. A visible
  "favourited by 1,240" would turn favourites into a popularity ranking and a
  de facto canon (principle 5). "Most built on" stays based on published
  `uses` links, which are public because the works that use them are.
- **What is public is the work, not the preference.** A published creation's
  recipe and `uses` links show which design versions it was made with, as
  every recipe already does (principle 1). That reveals what was used for that
  one work, not a person's standing favourites.

## Rules that would be checked

- A pick never changes another person's defaults: the composer reads picks
  only for the signed-in FID (a check on the route, like `P4a`).
- No public read of `studio.picks`, and no count derived from it in any
  public response or ordering (`P6b`, plus a code check like `P7a`).
- No UI text calls a picked or most-built-on version official, canonical or
  featured (`P5a` already covers the words).

## Open questions for the owner

1. Should a person's picks also shape what *they* see while reading (for
   example, their chosen Deluin in the player's images), or only what they
   create? Reading is not part of this proposal; it would show seeded and
   published images chosen by the person, still affecting nobody else.
2. Should the pick screen say how many works use each version ("built on by
   12 works")? That is public information already, but showing it next to the
   choice nudges everyone toward the same version.
3. Narration voices could be picked the same way (a default voice for one's
   own narrated adaptations). Same rules; not proposed here.
