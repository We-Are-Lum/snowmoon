# Terms and Privacy: drafted lines for the Dashboard rename (DRAFT, for the owner's reread)

Branch `dashboard-rename`, 2026-10-29. Drafted by the coding agent. **Not in `src/lib/legal.ts`**: legal
texts change only with the owner's reread, in the same merge that ships the change.

The branch renames the private page `/you` (called "your You page") to `/dashboard` ("your Dashboard").
The old addresses redirect. Two lines in the live texts still say "You page". Nothing else in them names
`/you`.

## 1. Terms, section 6b (Agents), second paragraph, last sentence

Now:

> If it gets out, disconnect it on your You page.

Drafted:

> If it gets out, disconnect it on your Dashboard.

## 2. Privacy, section 4 (what we keep), the wallet-link item, last sentence

Now:

> You can unlink it on your You page.

Drafted:

> You can unlink it on your Dashboard.

## 3. Optional: Privacy, section 6 (What you publish)

The public profile, `/@<your name>`, now also lists a person's published pictures (each already public
at `/image/<id>`, with their name). Section 6 already says that anything you publish is public and shown
with your name, so no change is strictly needed. If you want the profile named, a possible extra
sentence after the first one:

> Everything you have published, and not hidden, is also listed together on your public page,
> /@<your name>.

Remix frames and storyboards are still not listed on the profile (the flag `PROFILE_LISTS_REMIXES`
stays off until consent v5), and agent pieces are listed only once agents' pages (`/p`) are public.
