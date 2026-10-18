# Publish runbook: Fifteen Days, the scene pages and the live editor (DRAFT)

Written by the coding agent. First version 2026-10-17 from a dry run on branch `publish-dryrun`;
updated 2026-10-17 late for the owner's new answers:
- publish v5 as is;
- the video is on version 1 in the seed;
- upload it in (b);
- don't merge friday-drafts-scene;
- names are recorded only at sign-in;
- the live editor goes in between (e) and (f).

Nothing here has been run against Vercel or the hosted database. Every step is the owner's to run,
in the owner's order. Nothing is merged into main or posted until the owner says "publish".

Paths used below:

    SCENES=/Users/nathan/snowmoon-scenes          # branch scenes-sound
    PAGES=/Users/nathan/snowmoon-adaptation-pages # branch adaptation-pages
    EDITOR=/Users/nathan/snowmoon-editor-live     # branch editor-live (this runbook): adaptation-pages + scenes-sound + the editor
    MAIN=/Users/nathan/snowmoon                   # branch main

How the branches nest: `editor-live` = `adaptation-pages` + `scenes-sound` + the editor. Merging
scenes-sound in (b), adaptation-pages in (c) and editor-live in "editor live" adds each layer in
turn. Each merge brings in only what the previous ones didn't.

## Before you start: preview deployments

`vercel.json`'s `git.deploymentEnabled` turns previews off only for the branches it lists. Any
branch not listed deploys a preview on every push, with the Preview-scoped variables. On
2026-10-17 those were `GROQ_API_KEY`, `FAL_KEY`, `R2_ACCOUNT_ID` and `STUDIO_DATABASE_URL`, and
`adaptation-pages` and `friday-drafts-scene` were not listed. The owner's rule is previews off for
every branch except editor-live, with no secrets in the Preview scope. The owner is deciding how.
One way is to list every branch as `false`, or to add `"*": false` (and `"main": true`) on main.

## (a) Commit the picked frames, the voice lines and the mix to scenes-sound: DONE

Done 2026-10-17 with v5 (owner: "Publish v5 as is"), commit `cfc1aba` on scenes-sound, pushed.

What it holds:
- 108 frames as sent to the model (`adaptations/fifteen-days/preprod/sent/frames`, `sent/edit-src`), from
  `scripts/sent-frames.py --cut coverage-v5`;
- the frames' recipes (`preprod/overnight/frames-recipe.json`);
- the 43 converted voice lines and the mix;
- the cut, `scenes-out/fifteen-days/cuts/coverage-v5/coverage-v5.mp4`, with sha256 `f76a3312…`;
- its timeline and recipes.

It holds no raw takes. Every unpushed commit was scanned before the push. The only hits were the
words "raw takes" in the commit message.

To swap a frame after the final watch:
1. Change `preprod/overnight/coverage-pictures-v5.json`.
2. Re-render with `scripts/cut-coverage.py fifteen-days --name v5 --render`.
3. Re-run `sent-frames.py` and commit.
4. Then the cut's sha256 changes, so update `scripts/publish-scene-video.ts` (`mp4Sha256`) and the two
   URLs it prints, in `supabase/migrations/0012_adaptations.sql` and `src/lib/adaptation-pages.ts`,
   on adaptation-pages. Merge that into editor-live.

## (b) Merge scenes-sound into main, and upload the video

Note the restore point: the current production deployment.

    cd $MAIN
    npx -y vercel ls --prod --scope nates-projects-d1780cff | head -5

Merge. Expect the `vercel.json` conflict, and keep both sides' entries:

    git status --short                     # clean apart from .voice-models/
    git fetch origin && git merge --ff-only origin/main
    git merge --no-ff origin/scenes-sound
    # vercel.json: keep every branch from both sides ("site-make-p1c", "scenes-sound", "dog-dawn-comic", ...)
    git add vercel.json && git commit --no-edit
    npx tsc --noEmit -p . && npm run check:principles && npm run check:adaptations && npm run test:db
    git push origin main                   # Vercel deploys main to production

The upload needs the cut (now on main) and the upload script, which comes with adaptation-pages in
(c). So run it from `$EDITOR`, which has both, with main's `.env.local` for the R2 keys. The keys are
read, not copied. The script refuses if the file, its sha256, the faststart order or the seed's
URLs don't match.

    cd $EDITOR
    npx tsx scripts/publish-scene-video.ts --dry                                   # the two URLs; "the files match"
    npx tsx --env-file=$MAIN/.env.local scripts/publish-scene-video.ts             # uploads the cut and the poster
    curl -sI https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-f76a3312e1fd.mp4 | head -1          # 200
    curl -sI https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-poster-3caad9b75656.jpg | head -1   # 200

The cut is 50.6 MB. It goes to the book's media bucket (`snowmoon-media`, the key in
Development only), under a name that carries its sha256, cached forever. That is where the site
already serves the book's audio.

## (c) Merge adaptation-pages

The dry run's three fixes are already on adaptation-pages, so there is nothing to cherry-pick. So
are names-at-sign-in, lowercase wallet addresses, and version 1's video and poster URLs.

    cd $MAIN
    git fetch origin && git merge --no-ff origin/adaptation-pages
    npx tsc --noEmit -p . && npm run check:principles && npm run test:db && npm run test:adaptation-pages   # 12 of 12
    git push origin main

Until 0012 is applied, the pages read the built-in fallback (adaptation 1 and the owner). On
production they say "Nothing here yet" while `ADAPTATION_PAGES.live` is false.

## (d) Apply migration 0012

By hand in the Supabase SQL Editor, as `postgres`, dry run first. "Never apply migrations from a
terminal with a privileged key."

1. Dry run, with the last `commit;` turned into `rollback;`. It must finish with no error.

       cd $MAIN
       sed 's/^commit;$/rollback;/' supabase/migrations/0012_adaptations.sql | pbcopy

2. Apply it, by copying the file as it is:

       pbcopy < supabase/migrations/0012_adaptations.sql

   The check query must show four rows, every one with `rls = true` and `anon_writes = false`.
   `anon_reads` must be true for adaptations, adaptation_versions and adaptation_pages, and false for
   account_names.

3. Check the seed:

       select id, owner_person, title from studio.adaptations;                                          -- 1, 6786, Fifteen Days
       select id, recipe->>'video_url', recipe->>'poster_url' from studio.adaptation_versions;          -- 1, …/fifteen-days-f76a3312e1fd.mp4, …/fifteen-days-poster-3caad9b75656.jpg
       select * from studio.adaptation_pages;                                                           -- 6786, 1, 1

4. Mark it applied on main by editing line 3 to `-- APPLIED on production by the owner, <date> …`:

       git commit -am "0012 applied on production (owner, <date>)" && git push origin main

## (e) Turn on the adaptation pages

    cd $MAIN
    sed -i '' 's/^export const ADAPTATION_PAGES = { live: false };$/export const ADAPTATION_PAGES = { live: true };/' src/lib/config.ts
    git diff                               # one line
    npx tsc --noEmit -p . && npm run check:principles && npm run test:adaptation-pages
    git commit -am "Adaptation pages live (owner, <date>)" && git push origin main

## (e2) Editor live

Merge editor-live. That adds the live shot editor at `/@<name>/<id>/shot/<shot>`, the scene page's
shot links, REMIX pointing at the editor (Fork renamed Remix, the fork file removed, the recipe on the site;
owner, 2026-10-18), and the narrower function tracing. Generate stays disabled ("Remixing opens this week."): Remix
lands later as its own merge, after the owner's Terms and Privacy reread.

    cd $MAIN
    git fetch origin && git merge --no-ff origin/editor-live
    # vercel.json: if editor-live carries its own preview entry, keep main's list and drop editor-live's line
    npx tsc --noEmit -p . && npm run check:principles && npm run test:adaptation-pages   # 17 of 17 (12 + the editor's 13-17)
    git push origin main

On Vercel, the build runs `prebuild` (`node scripts/editor-data.mjs`). It makes `public/editor/1/v1/`
(about 58 MB: frames, thumbs, set frames, plates, cards, voice lines) from committed files only. Check
that it ran:

    curl -s https://snowmoon.party/editor/1/v1/data.json | head -c 120     # {"about":"Made by scripts/editor-data.mjs …

## (e3) Terms and Privacy

Only after the owner's reread: the baseline, account and wallet lines the owner approved for this publish (the
list is in the viewer, "Tomorrow's publish"). The texts describe only what the site does that day.

## (f) Check that it all loads

    curl -s -o /dev/null -w '%{http_code}\n' https://snowmoon.party/@naaate/1                    # 200
    curl -s https://snowmoon.party/@naaate/1 | grep -c 'Nothing here yet'                         # 0
    curl -s https://snowmoon.party/@naaate/1 | grep -o 'fifteen-days-f76a3312e1fd.mp4' | head -1  # the player's video
    curl -s -o /dev/null -w '%{http_code}\n' https://snowmoon.party/@naaate/1/v/1                # 200
    curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://snowmoon.party/1            # 307 https://snowmoon.party/@naaate/1
    curl -s -o /dev/null -w '%{http_code}\n' https://snowmoon.party/@naaate/1/shot/first         # 200
    curl -s -o /dev/null -w '%{http_code}\n' https://snowmoon.party/editor/1/v1/voice/b4-1.wav   # 200
    curl -s -o /dev/null -w '%{http_code}\n' https://github.com/We-Are-Lum/snowmoon/tree/main/adaptations/fifteen-days   # 200

Then open `/@naaate/1` on a phone and press play, open REMIX, drag the set, and open the RECIPE tab from the
scene page's Recipe link. Then run
`npm run check:principles` from `$MAIN`; all 47 checks should run there.

## (g) Post

The drafts are in `docs/drafts/friday-post.md` on branch `friday-drafts-scene`.

The cast is 261 characters. Its two embeds:
- `https://snowmoon.party/@naaate/1`;
- `https://snowmoon.party/@naaate/1/shot/first`, the live editor.

The cast has no GitHub link (owner, 2026-10-18); the bounty post keeps one "Source (GPL-3.0)" link.

The prototype is in the text as "Where it's going". The bounty post is beside it. Both are drafts
for the owner's OK.

Posting is by hand: the cast as @naaate, and the bounty claim on https://poidh.xyz/mainnet/bounty/34.
The bounty closes Sunday 18 October, 11:59pm Pacific.

## friday-drafts-scene

Not merged into main (owner, 2026-10-17). It stays a branch.

## If something goes wrong

- Production: promote the restore point noted in (b) (`vercel promote <url> --scope nates-projects-d1780cff`,
  as in `docs/restore-point-2026-10-07.md`). Nothing on main is force-pushed.
- The pages: set `ADAPTATION_PAGES.live` back to false and push. The pages then say "Nothing here yet".
- 0012: it only adds tables and its seed. Drop them in the SQL Editor only after asking.
