# Consent own-words-v5 and Terms §8: drafted texts

**DRAFT — for the owner's reread, not live.**

Drafted by the coding agent on 2026-10-19 for the owner's reread. Nothing here is in `src/lib/legal.ts` or
`config/consent.json`, and none of it may go there before that reread. The texts only describe what the site
does on the day they go live.

These texts describe features that are built but switched off:
- GPT Remix: `REMIX_MODEL = 'flux'` on branch `editor-v2` (src/lib/remix/model.ts).
- The profile listing: `PROFILE_LISTS_REMIXES = false` on branch `you-page` (src/lib/you-flags.ts).
- Basenames: `SHOW_BASENAMES = false` on branch `you-page` (src/lib/you-flags.ts).
- Moments: branch `moment-pages`.

They may ship only on the day those features go live. If only some go live, the texts must lose the parts
about the others.

Sources read: `config/consent.json` and `src/lib/legal.ts` on origin/main (live: own-words-v4; Terms reread
2026-10-18, words if3grj); on origin/editor-v2, `docs/legal/remix-gpt-draft.md`, `src/lib/remix/model.ts`,
`src/lib/images/stored-jpeg.ts`, `src/lib/remix/frames.ts` and `docs/removal.md`; on origin/you-page,
`docs/legal/privacy-you-page-draft.md`, `src/lib/you-flags.ts` and `src/lib/you.ts` (`whoIs`); and
origin/moment-pages (two commits: a047614, 41d053b).

---

## To verify before anything ships

1. **"OpenAI may keep prompts and pictures for up to 30 days for abuse monitoring."** TO VERIFY against
   OpenAI's current API data-usage terms. The owner's wording (2026-10-19), not yet checked.
2. **"OpenAI does not train on them."** TO VERIFY against the same terms.
3. **"Vercel AI Gateway does not keep them."** UNVERIFIED. It is not used in the texts below. It appears only
   in the Privacy §7 draft on editor-v2. The lead is Vercel's AI Gateway ZDR docs. Those docs are not a
   contract term, so the owner must confirm the clause applies to this team's plan.
4. **"Labelled wherever it appears" (Terms §8).** TO VERIFY. The labels are in the code for remix frames
   (`remixFrameLabel`), for the cut's frames in the editor and for the image card. Not checked: the owner's two
   share images for Fifteen Days (`public/share/fifteen-days-*.png`, b53c1bf). If they show GPT Image pictures,
   they carry no label in the code.
5. **"Nothing that identifies you" is sent to OpenAI.** This is confirmed only from the editor-v2 draft's list
   (the FID, wallet and name are not sent). Check `makeGptEdit` (src/lib/images/gateway-image.ts) once more
   before shipping, in case a `user` field or header is ever added.
6. **The prompt check route.** The live text says Groq, through Vercel AI Gateway when Groq is busy. The
   editor-v2 draft says the check is "Groq through Vercel AI Gateway, as today". The text below keeps the live
   wording. Check which is true on the day.

## Needs the owner's decision

- **D1. Notes on moments.** origin/moment-pages has no notes. Its moment pages are read only, and
  `src/lib/moments.ts` says "Nothing is stored". The branch has no note form, no licence for notes, no CC0 and
  no way to tell people who are mentioned. So the text leaves a placeholder: [NOTES ON MOMENTS]. Either the
  notes are built first, and the paragraph describes what they do, or the paragraph is dropped from v5.
- **D2. The licence for notes: ANSWERED** (owner, in their approval of the moment pages, relayed 2026-10-19:
  "Notes CC0."). Notes are CC0, the one exception to "like everything in this edition"; paragraph 4 now says so.
- **D3. How mentioned people are told: ANSWERED** (owner: "Add a Mentions list on /you, and let @mentions
  resolve to Farcaster names, Basenames and addresses (ships with consent v5)"; earlier, a Farcaster mini app
  notification when the tagged person has added the app). Drafted into paragraph 7. Still to build on
  moment-pages, so the paragraph ships only with it (D1).
- **Spam brake for notes** (owner, relayed 2026-10-19: "Wallets that have never paid: 3 notes a day each and a
  site-wide cap of 20 an hour across all of them. Wallets with at least one payment: the same limits as
  Farcaster accounts. No Basename requirement. The same rule applies to attaching X posts."). Drafted into
  paragraph 7. The Farcaster accounts' limit for notes isn't in the repo yet, so the text names no number for it.
- **D4. The licence of closed-model output (open item G7).** Do OpenAI's terms allow publishing GPT Image
  pictures, both the cut's and remix frames, under GPL-3.0? `config/models.json` says "owner to review". Until
  that is settled:
  - Terms §8 has a placeholder: [LICENCE OF CLOSED-MODEL OUTPUT].
  - Consent paragraph 4's words "like everything in this edition" are marked.
  - Terms §3 ("The text, pictures, audio and code … are offered under that same licence") and §5 ("it remains
    yours, and you license it … under GPL version 3") may need the same exception.
- **D7. Recording your own takes (paragraph 8): D-takes-1.** fal.ai's terms let it use "Usage Data", which is
  "anonymized or aggregated data" that "may include data based on or derived from Customer Input", "to design,
  develop, and offer Company products, services, and AI models". So the text can't say fal doesn't train on it. The
  owner chooses: (a) use fal.ai and say so (the paragraph as drafted); (b) get an agreement with fal.ai first; or
  (c) self-host the conversion. Settled facts (record-takes branch): fal-ai/chatterbox/speech-to-speech (Chatterbox,
  MIT, open weights); the recording goes inside the request as a data: URI (no upload to fal's CDN); X-Fal-Store-IO: 0;
  fal's copy of the output expires after 600 s and is copied at once; only the converted take is kept; the
  recording's sha256 is in the recipe with kept: false; the recording is never stored or logged.
- **D5. "Erased on request."** Under docs/removal.md, erasure is the maintainer's decision. It is for a legal
  requirement, personal data or a safety risk, after the work is hidden. It does not happen on a person's
  request alone. Should the PNG sentence say "if we erase the frame (you can ask; see the removal policy)", as
  drafted, or promise more?
- **D6. Other live texts the same features touch** (outside this file's two texts, listed so none is missed):
  - Terms §5 says "for a wallet account, its address shortened". It needs the Basename once Basenames are on.
  - Privacy §4 and §6 also need the Basename.
  - Privacy §6 needs the you-page draft's line A, and §7 needs lines B and B2 and the editor-v2 OpenAI and
    fal.ai items.
  - Privacy now has no line for the private PNG. The editor-v2 draft says that wording is still to be added.
  - Notes (if they ship): Privacy needs lines for notes, the Mentions list, and the mini app notification (the
    notification goes through Farcaster's mini app notification service, so that service is told who is
    notified and receives the notification's text). The consent **line** ("Public, permanent, GPL-3.0") would
    need "GPL-3.0 (notes CC0)" or similar. Terms §5 (GPL-3.0 for what you write) needs the CC0 exception.

---

## Consent own-words-v5 (full text) — DRAFT

**Line:** Public, permanent, GPL-3.0, shown with your name. You can hide it.

**Title:** Your words will be public

**Text:**

1. What you write here (a prompt, a line, a description) is published with what it makes.

2. It is public: anyone can read it, signed in or not, including the prompt that made an image or a voice.

3. It is permanent: the project keeps the record. You can hide your own work at any time, and it disappears
   from view at once. Moderators can also hide it. Copies others have already made may remain.

4. It is licensed GPL-3.0, like everything in this edition [D4: keep "like everything in this edition" only if
   G7 settles closed-model output as GPL-3.0], so others may copy and adapt it under the same license.
   Notes on moments are the exception: they are released under CC0 (paragraph 7) [D1: only if notes ship].

5. It is shown with your name: your Farcaster name; for a wallet account, its Basename if it has one,
   otherwise its address shortened. Your public page, at /@ and your name (or your address, for a wallet
   account), lists the scenes, Remix frames and storyboards you have published. Hiding something takes it off
   that page.

6. To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy).
   It is then sent to fal.ai to make the image, except in Remix for a version drawn with GPT Image. There, it
   goes to OpenAI's GPT Image 2.5 Sunburst (a closed model) through Vercel AI Gateway. OpenAI receives your
   words, the shot's prompt, and the pictures sent with it (the layout of the camera you set, the character
   cards and the set's plate), but nothing that identifies you. OpenAI may keep the prompt and pictures for up
   to 30 days for abuse monitoring [TO VERIFY against OpenAI's terms]. It doesn't train on them [TO VERIFY
   against OpenAI's terms]. We store that frame as a JPEG, converted on our server. We keep the model's
   original picture (a PNG) privately; it is never public. Hiding the frame keeps it private. It is deleted
   only if we erase the frame [D5: "erased on request"?]. Your Farcaster ID is sent to Neynar to check your
   account's score. In Remix, every frame you make is saved and public at its link as soon as it is made, with
   your words. Elsewhere, drafts you don't publish stay on your device.

7. [D1: ships only if notes ship with v5; otherwise drop this paragraph, and the CC0 clause in paragraph 4.]
   A note you write on a moment is public, shown with your name, and released under CC0: anyone may use it
   for anything, without asking. If you @mention someone (by Farcaster name, Basename or address), the
   mention is shown to them in a Mentions list on their You page and, if they have added the Snowmoon mini
   app on Farcaster, sent to them as a notification. A wallet account that has never paid can write 3 notes
   a day, within a limit for all such accounts together; once it has paid, it has the same limits as a
   Farcaster account. [Only if built: the same limits apply to attaching X posts.]

8. [D7 / D-takes-1: this wording is option (a), keep using fal.ai and say so. It ships only with recording takes
   (branch record-takes, flag off), and only if the owner picks (a). Facts from docs/legal/record-takes-draft.md on
   that branch.] If you record a take, your recording is sent to fal.ai to be converted into the character's
   voice, and only the converted take is kept: public at once, with your name, labelled as AI-converted, under the
   same licence as your words. Your recording itself is never kept or published. Under fal.ai's terms, anonymised
   or aggregated data derived from it may be used to develop its services.

**For `about` in config/consent.json (suggested):** own-words-v5 ships with Remix on GPT Image
(`REMIX_MODEL = 'gpt'`), the profile listing (`PROFILE_LISTS_REMIXES`) and Basenames (`SHOW_BASENAMES`), all
on the same day. It names OpenAI and Vercel AI Gateway for GPT Remix (P6j), the private PNG, the /@ page
listing and the Basename. Everyone is asked again, once.

### What changed from own-words-v4

- **Paragraph 4:** the words are unchanged. "Like everything in this edition" is marked until G7 is settled.
- **Paragraph 5:**
  - A wallet account is named by its Basename if it has one, before the shortened address.
  - New: the public /@ page lists scenes, Remix frames and storyboards, and hiding takes an item off it.
- **Paragraph 6:**
  - New: GPT Remix sends the person's words, the shot's prompt and the pictures to OpenAI, through Vercel AI
    Gateway. The provider is named first, and the model is labelled closed.
  - New: what OpenAI may keep and doesn't train on (both TO VERIFY), and that nothing identifying is sent.
  - New: the frame is stored as a JPEG, and the PNG is kept privately until the frame is erased.
  - The v4 sentence is split into short ones. Groq, the gateway fallback, Neynar, Remix being public at once,
    and drafts staying on the device are all unchanged.
- **Paragraph 4:** adds that notes on moments are CC0 (owner: "Notes CC0."), only if notes ship.
- **Paragraph 8:** new: recording your own takes, sent to fal.ai to convert; only the converted take is kept and
  published (AI-converted label, your name, the same licence); the recording never kept; fal.ai's Usage Data term.
  Depends on D-takes-1.
- **Paragraph 7:** new: notes on moments are public, with your name, CC0; @mentions resolve to Farcaster names,
  Basenames and addresses and reach the person in a Mentions list on /you and, if they added the mini app, as
  a notification; the owner's spam brake for wallets that have never paid. Ships only with notes (D1).
- **Line and title:** unchanged.

---

## Terms of Use §8 (full section) — DRAFT

Numbering around it is unchanged: §7 "Hiding and removal.", §8, then §9 "Outside services." (which already
says the outside companies' terms apply to their part).

> **8. AI-made material.** The narration, many pictures (every frame made in Remix among them) and the
> assistant's answers are produced by AI models and are labelled as such. Some pictures are made with a closed
> model, one whose maker does not publish its weights. The closed model used now is OpenAI's GPT Image 2.5
> Sunburst, through Vercel AI Gateway. It drew a version of an adaptation (version 2 of Fifteen Days), and it
> draws Remix frames for that version. Wherever such a picture appears, it is labelled with the model, its
> maker and that it is closed [TO VERIFY: share images, see item 4]. Its recipe records the date it was
> made. These pictures are AI-generated, not the author's work. [LICENCE OF CLOSED-MODEL OUTPUT — D4: which
> licence and whose terms apply to these pictures, e.g. GPL-3.0 as in section 3, subject to OpenAI's terms.]
> AI-made material can be wrong. The assistant's commentary is not the book and is not advice of any kind.

### What changed from the live §8

- **New:** some pictures come from a closed model. The text names the provider and model (OpenAI's GPT Image
  2.5 Sunburst) and the route (Vercel AI Gateway).
- **New:** where its output is used: version 2 of Fifteen Days, and Remix frames for that version.
- **New:** each such picture is labelled with the model, the maker and "closed", and its recipe records the
  date. This is the same as the editor-v2 draft's §8 clause.
- **New:** these pictures are AI-generated, not the author's.
- **New:** a placeholder for their licence (D4). "They can be wrong" becomes "AI-made material can be wrong",
  so it still covers everything above it. The first and last sentences are unchanged.
