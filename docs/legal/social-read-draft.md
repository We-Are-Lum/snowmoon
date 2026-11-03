# "Posts that link here": Privacy and Terms lines (DRAFT, for the owner's reread)

Branch `social-read`, 2026-10-29/30. Drafted by the coding agent; **not** in `src/lib/legal.ts` (the agent does not edit
it). Awaiting the owner's reread. Per "legal texts describe today", the feature stays off (`SOCIAL_READ.show = false` in
`src/lib/config.ts`) until these words are in `legal.ts` with the owner's reread; `check:principles` P6r fails if it is
turned on while Privacy §7 doesn't name Bluesky.

**Re-anchored 2026-11-02** on main at 17e2c63 (after #73 no-token, #93 the remix challenge, Minpentai's agent play and
#96). Every "Today" quote below is main's current wording, checked word for word against `src/lib/legal.ts`; the
proposed words are unchanged. What moved: Privacy §6 now ends with the remix challenge's sentence; Privacy §7 now has
the remix challenge's "Bluesky and Lens receive the details of a post someone adds…" item right after Neynar's; and
Terms §7 gained the admins' hide, the "Posted on" sentence and the admins' picks. (The check that guards this switch was
P6p on this branch; it is P6r since the merge, as main and the sign-in branch hold P6p and P6q.)

Owner, 2026-10-29: "Social threads, reading half, branch social-read: posts on Farcaster (Neynar) and Bluesky that link
to a snowmoon.party page, shown newest first on that page, removable on request. Free tiers only, no posting, no bot
account needed. Draft the Privacy §6/§7 lines for my reread."

## What the branch does, in short

| What | New data, or new place it goes | Switch |
|---|---|---|
| Our server asks Neynar for Farcaster casts whose links start with `snowmoon.party` (Neynar's feed filtered by embed URL; the site's existing Neynar key), and Bluesky's public API (`api.bsky.app`, no account) for posts linking to `snowmoon.party`. One question to each, for the whole site, at most every half hour. | **New: Bluesky receives a request from our server** (the question names only our domain). Neynar receives a new kind of request, also naming only our domain. Neither receives anything about a reader. | `SOCIAL_READ.show` (off) |
| Under a chapter, an image, or an adaptation scene (latest or a fixed version), the posts that link to that page are shown after the page's own content, under "Posts that link here": the network, the writer's handle, the date, the post's text (up to 500 characters) as a quotation, and a link to the post. Newest first, at most 20. No avatar, display name, picture, counts or score. | **New: other people's public posts (handle, date, text) are shown on our pages.** Kept only in our server's cache for about half an hour; not in our database. | `SOCIAL_READ.show` |
| Left out automatically: Bluesky posts or accounts with any label (moderation labels, and an account's own "don't show me to signed-out people"). | (none) | always |
| Moderators and admins see every post read on `/moderate` and can hide one ("the writer asked" or "breaks the Terms"). A writer can ask by email. A hidden post leaves every page. | **New kept data:** for each hidden post, its network, its id, who hid it (a moderator's FID), why, and when (`studio.social_hidden`, private). | always (needs the migration) |

The reader's browser never contacts Farcaster, Neynar or Bluesky: the section is plain text and links, rendered by our
server (P6a). Clicking a post's link opens that network, like any outside link.

## 1. Privacy, section 6 ("What you publish."): one paragraph added at the end

**Today (section 6 ends):**
> … During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page.

**Proposed (new paragraph after it):**
> If you post on Farcaster or Bluesky with a link to a page here, your post may be shown on that page, under "Posts that
> link here": your handle on that network, the date, the post's text (up to 500 characters) and a link to it, newest
> first. We never show your picture or display name, and nothing is counted or ranked. We find these posts through
> Neynar (for Farcaster) and Bluesky's public service (section 7), and keep them only in our server's short-term cache,
> for about half an hour, not in our database. A Bluesky post or account with a label, including an account that asks
> not to be shown to people who aren't signed in, is not shown. If you delete your post, it leaves this site within
> about an hour. To have it removed here sooner, or kept off, write to snowmoon@wearelum.xyz; we then keep only the
> post's id, to keep it hidden.

## 2. Privacy, section 7 ("Outside services and what they receive."): the Neynar item, and one new item

**Neynar item, one sentence added at the end** (it now ends "…and we keep its answer in memory for five minutes."):
> To find public Farcaster posts that link to pages here, our server asks Neynar for them, at most every half hour;
> this sends nothing about you.

**New item, after the remix challenge's Bluesky and Lens item** (which follows the Neynar item; it was "after the
Neynar item" before main added that one, and the two Bluesky items now sit together):
> Bluesky's public service (api.bsky.app) is asked by our server, at most every half hour, for public posts that link
> to pages here. It receives nothing about you or what you read; your browser doesn't contact it.

## 3. Terms, section 7 ("Hiding and removal."): one sentence added

**Today:**
> Nothing on the Service is official or canonical. We may hide content that breaks these Terms. Admins may also hide the images the project made itself, its starting points, for any reason. You may hide your own work yourself where the Service offers "Hide", or ask us to hide it, at any time. A post you add to a version's page must be one that links there; you or a moderator can remove it, and we remove a post on its writer's request. How this works is set out in our removal policy, linked from About. Admins (the site's owner and people the owner names) may pick which image shows first for a moment of the book or a glossary item; it is labelled with who picked it, and you can switch to the most liked, the newest or the images you liked, and every other image stays one tap away.

**Proposed (added after "…and we remove a post on its writer's request."; it was after the second sentence before
main added the admins' hide and the "Posted on" sentence, and now sits next to the other sentence about posts):**
> Public posts on other networks that link to a page here may be shown on that page; they are their writers' and under
> those networks' terms, not part of the Service's own content, and we may hide any of them, and do so when the person
> who wrote one asks.

## 4. About (not a legal page; in the branch already, shown only when the switch is on)

`src/app/about/page.tsx` has a paragraph, model-drafted, shown only while `SOCIAL_READ.show` is on, so About and Privacy
name Bluesky together (P6h now counts Bluesky among the outside services):

> Posts that link here: under a chapter, an image or a scene, public posts on Farcaster and Bluesky that link to that
> page are shown, newest first, with the writer's handle, the date and a link to the post. Our server finds them,
> through Neynar for Farcaster and Bluesky's public API, sending only this site's address; your browser asks neither.
> Moderators can hide any of them, and the person who wrote one can ask us to remove it at snowmoon@wearelum.xyz.

## For the reread

- **Two kinds of posts since the remix challenge.** Main's "Posted on" lists posts that a signed-in person adds to a
  version's page (kept in `studio.version_posts`, Privacy §4). "Posts that link here" are found by our server, kept only
  in its cache, and shown under chapters, images and scenes. The lines above describe only the second; the two can
  appear on the same image page. Whether to keep them as two sections, or have one feed the other, is yours.
- **About and P6h.** Production's Privacy now names Bluesky (and Lens) for "Posted on", but About names neither. This
  branch adds Bluesky to the services P6h compares, so `check:principles` fails P6h against production until About
  names Bluesky (or the check is scoped to this switch). See the branch report.

- **Order of going live.** (1) Your reread of sections 1–3 (with any changes); (2) the agent puts them in `legal.ts`
  with `LEGAL.ownerReread` and a new `LEGAL.effective`; (3) you paste `NEXT_social_read.sql` (numbered at merge) and
  say "applied"; (4) `SOCIAL_READ.show = true` in the same merge. Until (3) the site shows no posts even if the switch
  is on (it can't read the hide list, so it shows nothing).
- **"Within about an hour" after deletion.** A look at each network is kept half an hour; chapter pages are remade at
  most every half hour; so a deleted post can stay up to about an hour. Image and scene pages follow within about half
  an hour. If you want "half an hour", chapter pages can be remade more often.
- **What a hide keeps.** The post's id (a cast hash or a Bluesky post address), the moderator's FID, the reason and
  the time. Nothing about the writer beyond what the id itself points to. The app can't unhide; you can, by deleting
  the row in the SQL Editor.
- **Numbers you may want to change:** at most 20 posts a page; text cut at 500 characters; one look per network per
  half hour (Neynar: about 0.6M of the free plan's 10M credits a month).
- **Spam.** Nothing filters Farcaster spam automatically (Bluesky's labels do some of it there). Options: hide by hand
  on `/moderate`, or show only casts from accounts above a Neynar score (as for image making). The second is a filter,
  not an order, but it is a judgment about people, so it is yours to make; not built.
- **Not legal advice, worth checking:** showing others' public posts (handle, short text, link) on our pages, under the
  networks' own terms (Neynar's terms, and Bluesky's developer guidelines; not read for this draft. The branch already
  drops deleted posts within the hour and every labelled Bluesky post or account), and
  for EU/UK readers whose posts appear (legitimate interest, removal on request). The Privacy lines above say what is
  shown, where it comes from, how long it stays and how to have it removed.
