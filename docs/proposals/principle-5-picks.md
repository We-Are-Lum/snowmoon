# Principle 5 with labelled picks (REREAD by the owner, 2026-10-29, with one change)

Owner, 2026-10-29, on the next-version plan report: "Principle 5: option (a), with a switch on each moment and
glossary item: 'Picked by @naaate · Most liked · Newest · My picks', remembered per reader, my picks as the starting
view. Draft the new principle 5 and the P5a/P5b checks for my reread."

Read here as: the starting view is the admins' pick ("Picked by @naaate", or by @garance for one she picked); "My
picks" in the switch is the reader's own picks. If "my picks as the starting view" meant each reader's own picks,
say so and only the default in step 3 below changes.

**Reread, 2026-10-29:** "Your reading is right: the admin's pick is the starting view. In the switch, replace 'My picks' with 'Liked by me' (the reader's own likes, which already exist), so no new per-reader pick feature is needed. Update P5d to match." The reread text and checks are in docs/principles.md and scripts/check-principles.ts on branch principle-5-picks; the Terms line is docs/legal/picks-draft.md. The draft below is kept as the record (it still says "My picks"). The new
checks are written below as they would go in, and each is proven to fail on a planted violation like the others.

## Today (docs/principles.md §5)

> ## 5. Nothing is marked canon, official, or featured. Moderators can hide and nothing else.
>
> **In this app.** Defaults come from scoring and are labelled as what they are ("most liked"). Seeded material is a
> "starting point". Moderators (FIDs in `MODERATOR_FIDS`) can set content hidden; they cannot promote, order or label.
>
> **Checked by.** `P5a`: no migration adds a canon/official/featured/pinned field, and no UI string uses those words
> except to deny them. `P5b`: code that checks moderator FIDs does not publish, order or sort.

## Proposed

> ## 5. Nothing is marked canon, official, or featured. An admin's pick is labelled as a pick, and every reader can switch away from it.
>
> **Source.** Unchanged ("AI as the engine, humans as the steering wheel"; inference, not endorsement).
>
> **In this app.** Admins (FIDs in `ADMINS`: the owner and @garance) can hide content, and can pick one image per
> moment or glossary item to show first. A pick is always shown as "Picked by @handle", never as canon, official or
> featured. Every place that shows a pick also shows the switch "Picked by @handle · Most liked · Newest · My picks";
> the reader's choice is remembered on their device, and the pick is only the starting view. Where no one has
> picked, the starting view is "Most liked", then "Newest". Seeded material is still a "starting point". Moderators
> who are not admins can hide and nothing else. Picks never affect the feed, search or anyone's own pages.
>
> **Checked by.**
> - `P5a`: no migration adds a canon/official/featured/pinned field, and no UI string uses those words except to deny
>   them. (Unchanged. The table is `studio.admin_picks`; the word "pick" is allowed.)
> - `P5b`: code that checks `MODERATOR_FIDS` or `ADMINS` does not publish, order or sort, with one exception: admin
>   code may write `studio.admin_picks` (insert, and a newer row replacing an older one), and nothing else.
> - `P5d`: every component that renders a pick renders its label ("Picked by @…") and the four-way switch, and the
>   switch's choice is kept only on the reader's device (localStorage), never sent to the server.
> - `P5e`: no ordering outside the pick switch reads `studio.admin_picks` (the feed, search, profiles, the agent
>   tools and the read API stay unpicked).
> - Review: does any default, badge or ordering reflect a person's choice without saying whose?

(`P5c`, hidden images moved to the private bucket, is unchanged.)

## The checks as they would go in (scripts/check-principles.ts)

```ts
// P5b, rewritten: moderator and admin code only hides, plus writing picks.
add({
  id: 'P5b',
  principle: 5,
  name: 'moderator and admin powers: hide, and write a labelled pick, nothing else',
  load: async () => walk('src', /\.tsx?$/).map((f) => ({ file: f, text: read(f) })),
  run: (files) =>
    files
      .filter((f) => /MODERATOR_FIDS|\bADMINS\b/.test(f.text) && !f.file.endsWith('config.ts'))
      .flatMap((f) => {
        const text = f.text.replace(/insert into studio\.admin_picks[\s\S]*?`/g, ''); // the one allowed write
        const bad = /status\s*[:=]\s*['"](published|draft)['"]|set\s+status\s*=\s*'(published|draft)'|order by|\.sort\(/i.test(text)
          || /(insert into|update)\s+studio\.(?!admin_picks\b|removal_log\b|elements\b[^`]*status\s*=\s*'hidden')\w+/i.test(text);
        return bad ? [`${f.file}: moderator or admin code does more than hide or pick`] : [];
      }),
  plant: (files) => {
    files.push({ file: 'src/planted.ts', text: "if (ADMINS.includes(fid)) await sql`update studio.elements set status = 'published'`" });
  },
});

// P5d: a pick is always labelled and switchable, and the switch stays on the device.
add({
  id: 'P5d',
  principle: 5,
  name: 'every pick shows "Picked by @…" and the switch; the choice stays on the reader\'s device',
  load: async () => walk('src', /\.tsx$/).map((f) => ({ file: f, text: read(f) })),
  run: (files) => {
    const problems: string[] = [];
    for (const f of files.filter((x) => /\bpickedBy\b|admin_picks|<Pick\b/.test(x.text))) {
      if (!/Picked by @/.test(f.text) && !/PICK_LABEL/.test(f.text)) problems.push(`${f.file}: shows a pick without its label`);
      if (!/<PickSwitch\b/.test(f.text) && !f.file.endsWith('pick-switch.tsx')) problems.push(`${f.file}: shows a pick without the switch`);
    }
    const sw = files.find((x) => x.file.endsWith('pick-switch.tsx'));
    if (!sw) problems.push('src/components/pick-switch.tsx: missing');
    else {
      for (const v of ['Most liked', 'Newest', 'My picks']) if (!sw.text.includes(v)) problems.push(`pick-switch.tsx: no "${v}"`);
      if (!/localStorage/.test(sw.text) || /fetch\(|authFetch\(/.test(sw.text)) problems.push('pick-switch.tsx: the choice must stay in localStorage and never be sent');
    }
    return problems;
  },
  plant: (files) => {
    files.push({ file: 'src/components/planted-pick.tsx', text: 'export const X = ({ pickedBy }) => <img alt={pickedBy} />;' });
  },
});

// P5e: picks only order the pick switch.
add({
  id: 'P5e',
  principle: 5,
  name: 'picks order nothing but the pick switch (not the feed, search, profiles, agent tools or the read API)',
  load: async () => walk('src', /\.tsx?$/).map((f) => ({ file: f, text: read(f) })),
  run: (files) =>
    files
      .filter((f) => /admin_picks/.test(f.text))
      .filter((f) => !/src\/lib\/picks\.ts$|pick-switch\.tsx$|src\/app\/api\/admin\/picks\//.test(f.file))
      .map((f) => `${f.file}: reads picks outside the pick switch`),
  plant: (files) => {
    files.push({ file: 'src/lib/images/data.ts', text: 'select * from studio.elements e left join studio.admin_picks p on true order by p.at' });
  },
});
```

## What else changes with it

- `src/lib/config.ts`: `ADMINS = [6786, 193912]` (owner, 2026-10-29). `MODERATOR_FIDS` stays for hide-only moderators.
- Terms §7 (Hiding and removal), one line for the reread when picks ship: "Admins may pick which image shows first
  for a moment or a glossary item; it is labelled with who picked it, and every other image stays one tap away."
- No Privacy change: the switch's choice stays on the reader's device; a pick stores the admin's FID and the time.
