# Branch report: phase2-admin (admin tools in the reader)

Branch `phase2-admin`, from main `02ddf08`, 2026-10-29/30. Built overnight by the coding agent. Not merged, no PR, no
migration applied, nothing spent.

## What it does

**One list of admins.** `ADMINS` (you and @garance, FIDs 6786 and 193912) is now the only list any admin power reads,
through one small check (`src/lib/admins.ts`). It replaces:
- the moderators list (`MODERATOR_FIDS` is now "every admin", plus anyone you later add as a hide-only moderator);
- the image review's owners;
- the "maintainer" who could hide anyone's remix frames, storyboards and scene versions (that was FID 6786 alone; now
  any admin);
- the storage check (was FID 6786 alone);
- the higher daily image count (300 a day, was FID 6786 alone; now each admin);
- the image gate (admins skip the Neynar score, as invited FIDs do).

`SYSTEM_FID` stays: it is the account system work is credited to, and it grants nothing.

**Hide in the reader.** Signed in as an admin, every image in a chapter has a "Hide (admin)" button:
- **Seeded images** (the project's own) are hidden by a row in a new table, `studio.seeded_hidden`. The chapter page,
  the References cards and the design sheets leave them out.
- **Readers' images** are hidden exactly as the moderator queue hides them: their status, the removal log, and the file
  moved to the private bucket.

**Make an image from any selected text.** For admins, a passage can be any run of blocks in one chapter (up to 400),
instead of 8. The selection's "Add an image" and the composer follow it, and the server checks it again.

**Review pages.** `/admin/review` lists every chapter and every glossary word with images. Each chapter's page shows
every moment with images: the seeded image (hidden ones marked) and readers' images, each with **Hide** and **Pick for
this moment**, and the current pick marked "Picked by @…". A word's page (`/admin/review/term/<word>`) does the same for
its sheets' images. Anyone else sees "This page is for admins."; signed out, a sign-in. The pages hold nothing
themselves: the images come from an admins-only address.

**Picks, as principle 5 now says.** When an admin picks an image for a moment (or a word), readers see it at that
moment first, labelled with its maker's AI label. Under it is the switch **"Picked by @naaate · Most liked · Newest ·
Liked by me"**:
- the reader's choice is kept on their device and never sent;
- "Liked by me" reads their own likes, one image at a time, as the like button does;
- the seeded image the pick stands in for stays one tap away.

Where: chapter moments, and the cards on References → Glossary. Moments and words with no pick are untouched. Until
the database change is applied, there are no picks, and every page looks exactly as it does today.

## The database change (draft, for you to paste)

- `supabase/migrations/NEXT_admin_picks.sql`: two tables, `studio.admin_picks` and `studio.seeded_hidden`.
  - Both are append-only: the site can read and add, never change or delete. A new pick is a new row; the latest
    counts; clearing a pick is a row too.
  - Neither is readable by the public.
  - It must run as postgres, in one transaction (begin…commit).
- `supabase/drafts/NEXT_admin_picks.DRY-RUN.sql`: the same, ending in `rollback;`.
- `supabase/drafts/READ-BACK-admin_picks.sql`: ten lines that should all say true.

## Legal (for your reread)

`docs/legal/picks-draft.md` has two Terms §7 sentences:
1. The picks line drafted on 2026-10-29: "Admins (the site's owner and people the owner names) may pick which image
   shows first … every other image stays one tap away."
2. New: "Admins may also hide the images the project made itself, its starting points, for any reason." Today's §7 only
   covers hiding content that breaks the Terms. A reader's image is still hidden only under the Terms and the removal
   policy.

No Privacy change: a pick stores the admin's FID and the time, the switch's choice stays on the device, and "Liked by
me" uses the likes already described.

## What was checked

- `npx tsc --noEmit -p .`: passes. (There is no `lint` script in this repo, so no lint ran; earlier reports that said
  lint passed were wrong about that.)
- `npm run build`: passes.
  - The first build timed out on 7 chapter pages: each page read the hidden list on the build worker's single database
    connection. It now reads the list once per worker, with a 5-second limit that fails the build rather than ship a
    hidden image.
  - The second build had 0 slow pages.
- `npm run check:ui` on a local build: **passed (59 pages)**. New: the review page signed out, as an admin (the buttons
  "Pick for this moment | Hide" and "Clear the pick | Hide", and "Picked by @naaate") and as anyone else; and a chapter
  moment with a pick (the picked image first with its AI label, the seeded image set aside, the four-way switch, the
  choice kept on the device). The admin APIs were stood in for these checks, since the tables don't exist yet.
  - The run before that failed once: `/chapter/1?view=listen` didn't go quiet, because its picks request queued behind
    a database read that stalled for over 5 seconds. Root cause and fix (54476ae): the reader's pages each asked for
    picks from a table that doesn't exist yet, 120 times, on the server's one connection. Now a missing table is
    remembered for a minute, reads have 3- and 5-second limits, and the browser gives up after 8 seconds. The rerun
    passed with 0 failed server reads.
- `npm run check:principles` (static): **53 pass, 0 fail, 1 not run** (P6d); all 54 proven to fail on a planted
  violation.
- `npm run check:principles` against the local build: 52 pass, 1 fail (P6a), 1 not run. The P6a failure comes from
  testing on localhost: it lists only `media.snowmoon.party` and `pictures.snowmoon.party`, the site's own picture
  hosts.
- `npm run test:db-swaps`: passes (384 writes, 224 hides, 128 refused hides, 0 errors), after the hide code moved.
- `npm run test:remix`: **19 of 19 pass** (hiding and unhiding frames, by the maker and by an admin).

**P5b now also covers `isAdmin`.** Code that checks an admin may only hide or write a pick. To keep that true, the
remix hide code moved into its own file, `src/lib/remix/hide.ts`, away from the listing code that sorts.

## What's left, or needs your decision

- **Not covered by the Hide:** seeded images on the home page and About (the intro's cards, `src/lib/intro.ts`), and
  quote cards, still show a hidden seeded image. Those are hand-chosen; say if a hide should reach them too.
- **No unhide** for seeded images, since admins only hide (principle 5). Undo means deleting the row as postgres.
- **Picks for a word** show on References → Glossary only, not yet on the glossary's own word pages.
- **The admin passage limit** is 400 blocks: any run within one chapter. Say if you want a lower number.

## Principles

- **1 (recipes open): pass.** Picks and hides change no recipe; every image still links to its own.
- **2 (AI labels): pass.** The picked image carries its maker's AI label, with "AI-generated image, not by the author"
  served (check:ui checks it).
- **4 (a person's action): pass.** Hides and picks are an admin's taps, signed in. Nothing is chosen by a model.
- **5 (no canon; labelled picks): pass.**
  - P5a: no schema field or wording marks anything canon, official or featured.
  - P5b (now also covering isAdmin): admin code hides or picks, nothing else.
  - P5d: every pick shows "Picked by @…" and the switch, and the choice stays on the device.
  - P5e: only the pick code reads `admin_picks`.
- **6 (privacy, no third parties): pass** (P6a's localhost note above). Neither table is public. The switch sends
  nothing.
- **Concern:** @garance gets every admin power the owner had alone (the maintainer hide, the storage check, 300 images
  a day, no gate). That is what "ADMINS replaces the scattered owner lists" says, but it's a real change.
