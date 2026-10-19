# Consent own-words-v5 and v6, Terms §3, §5 and §8: drafted texts

**DRAFT — for the owner's reread, not live.**

Drafted by the coding agent on 2026-10-19 for the owner's reread, and redrafted the same day after the owner's
answers: "D1 don't wait for notes (v5 now, notes in v6); D4 GPL-3.0; D5 erase the PNG when its frame is deleted or
on request", and option (c) for takes (Chatterbox run by us on Modal). Nothing here is in `src/lib/legal.ts` or
`config/consent.json`, and none of it may go there before that reread. The texts only describe what the site does
on the day they go live.

**v5** describes four features that are built but switched off. It may ship only on the day all four go live; if
only some do, it must lose the parts about the others:
- GPT Remix: `REMIX_MODEL = 'flux'` on branch `editor-v2` (src/lib/remix/model.ts).
- The profile listing: `PROFILE_LISTS_REMIXES = false` on branch `you-page` (src/lib/you-flags.ts).
- Basenames: `SHOW_BASENAMES = false` on branch `you-page` (src/lib/you-flags.ts).
- Recording takes: branch `record-takes` (814f390, flag off), converted on Modal; not deployed (needs the owner's
  Modal account).

**v6** (below v5) adds notes on moments (branch `moment-pages`). Notes aren't built yet; v6 ships with them.

Sources read: `config/consent.json` and `src/lib/legal.ts` on origin/main (live: own-words-v4; Terms reread
2026-10-18, words if3grj); on origin/editor-v2 (bc00ffe), `docs/legal/remix-gpt-draft.md`, `src/lib/remix/model.ts`,
`src/lib/images/stored-jpeg.ts`, `src/lib/remix/frames.ts`, `scripts/erase-remix-frame.ts` and `docs/removal.md`; on
origin/you-page, `docs/legal/privacy-you-page-draft.md`, `src/lib/you-flags.ts` and `src/lib/you.ts` (`whoIs`); on
origin/record-takes (814f390), `docs/legal/record-takes-draft.md` (Modal's terms, quoted there: "Effective May 2026",
§5.5); and origin/moment-pages (a047614, 41d053b).

---

## To verify before anything ships

1. **"OpenAI may keep prompts and pictures for up to 30 days for abuse monitoring."** TO VERIFY against
   OpenAI's current API data-usage terms. The owner's wording (2026-10-19), not yet checked.
2. **"OpenAI does not train on them."** Supported by OpenAI's Services Agreement §4.2 (quoted under "OpenAI's terms"
   below). Still TO VERIFY: we reach OpenAI through Vercel AI Gateway, so the gateway's own terms, and how it passes
   OpenAI's through, are what bind us.
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
7. **GPL-3.0 for GPT Image pictures (D4).** The owner has decided GPL-3.0. OpenAI's Services Agreement §4.1 (quoted
   below) says the customer "owns all Output", so nothing there stops us licensing it under GPL-3.0. Same caveat as
   item 2: we are Vercel AI Gateway's customer, so its terms are the ones that bind us directly.
8. **Takes on Modal.** The paragraph says the model is run "ourselves on Modal". That is true only once it is
   deployed on the owner's Modal account (record-takes-draft.md, "To check at deploy").

## Answered by the owner (2026-10-19)

- **D1. Notes:** "don't wait for notes (v5 now, notes in v6)". Notes, their CC0 clause, Mentions and the spam brake
  moved to the v6 draft below.
- **D2. Licence for notes:** "Notes CC0." In v6.
- **D3. Mentions:** a Mentions list on /you; @mentions resolve to Farcaster names, Basenames and addresses; a mini
  app notification. In v6.
- **Spam brake for notes:** wallets that have never paid get 3 notes a day each and a site-wide cap of 20 an hour
  across all of them; wallets with a payment get Farcaster limits; no Basename requirement; the same for attaching
  X posts. In v6.
- **D4. GPT pictures: GPL-3.0.** Consent ¶4 is unchanged from v4 ("like everything in this edition" is now true of
  them). Terms §3, §5 and §8 say so (below). One check of OpenAI's terms remains (item 7).
- **D5. The PNG:** "erase the PNG when its frame is deleted or on request". Consent ¶6 and the Privacy line say so.
  Built on editor-v2 (bc00ffe): erasing a frame deletes its PNG (`eraseFrameFiles`, test P6), and on request the PNG
  alone is deleted while the frame stays (`eraseOriginalPng`, `scripts/erase-remix-frame.ts <id> --png-only`, test
  P11). Both are the maintainer's, run by hand; no route deletes either (P9). Procedure in docs/removal.md.
- **D5a. Who can ask for the PNG to be erased:** "maker + me": the frame's maker, or the maintainer on their own
  decision. In docs/removal.md (editor-v2, d82a852), consent ¶6 and the Privacy line.
- **D7 / D-takes-1. Takes: option (c)**, Chatterbox run by us on Modal, whose terms say it will not "train any AI
  model using Customer Data". Consent ¶7 is the other session's wording, with no mention of fal.

## Still needs the owner's decision

- **D6. Other live texts these features touch** (outside this file, listed so none is missed):
  - Privacy §4 and §6 need the Basename (Terms §5 has it below).
  - Privacy §6 needs the you-page draft's line A; §7 needs lines B and B2 and the editor-v2 OpenAI item.
  - Privacy §4 needs the PNG line (drafted below, and in editor-v2's remix-gpt-draft.md).
  - Privacy §7 needs the Modal item (below) and record-takes' other Privacy lines (record-takes-draft.md).
  - For v6: Privacy lines for notes, the Mentions list and the mini app notification (Farcaster's notification
    service is told who is notified and receives the text); the consent **line** needs "GPL-3.0 (notes CC0)" or
    similar; Terms §5 needs the CC0 exception for notes.

---

## Consent own-words-v5 (full text) — DRAFT

**Line:** Public, permanent, GPL-3.0, shown with your name. You can hide it.

**Title:** Your words will be public

**Text:**

1. What you write here (a prompt, a line, a description) is published with what it makes.

2. It is public: anyone can read it, signed in or not, including the prompt that made an image or a voice.

3. It is permanent: the project keeps the record. You can hide your own work at any time, and it disappears
   from view at once. Moderators can also hide it. Copies others have already made may remain.

4. It is licensed GPL-3.0, like everything in this edition, so others may copy and adapt it under the same
   license.

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
   original picture (a PNG) privately; it is never public. We erase it when the frame is deleted, when you ask
   us to, or when we decide to. Your Farcaster ID is sent to Neynar to check your account's score. In Remix, every frame you make
   is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don't publish
   stay on your device.

7. If you record a take, your recording is converted into the character's voice by an open-weight model we run
   ourselves on Modal, which may not train on it. Only the converted take is kept: public at once, with your
   name, labelled as AI-converted, under the same licence as your words. Your recording itself is never kept or
   published.

**For `about` in config/consent.json (suggested):** own-words-v5 ships with Remix on GPT Image
(`REMIX_MODEL = 'gpt'`), the profile listing (`PROFILE_LISTS_REMIXES`), Basenames (`SHOW_BASENAMES`) and recording
takes (record-takes, on Modal), all on the same day. It names OpenAI and Vercel AI Gateway for GPT Remix (P6j), the
private PNG and when it is erased, the /@ page listing, the Basename, and Modal for takes. Everyone is asked again,
once.

### What changed from own-words-v4

- **Paragraph 4:** unchanged. "Like everything in this edition" now covers GPT Image pictures too (D4).
- **Paragraph 5:**
  - A wallet account is named by its Basename if it has one, before the shortened address.
  - New: the public /@ page lists scenes, Remix frames and storyboards, and hiding takes an item off it.
- **Paragraph 6:**
  - New: GPT Remix sends the person's words, the shot's prompt and the pictures to OpenAI, through Vercel AI
    Gateway. The provider is named first, and the model is labelled closed.
  - New: what OpenAI may keep and doesn't train on (both TO VERIFY), and that nothing identifying is sent.
  - New: the frame is stored as a JPEG; the PNG is kept privately and erased when the frame is deleted, on the
    maker's request, or on our own decision (D5, D5a).
  - The v4 sentence is split into short ones. Groq, the gateway fallback, Neynar, Remix being public at once,
    and drafts staying on the device are all unchanged.
- **Paragraph 7:** new: recording your own takes, converted by an open-weight model we run on Modal, which may not
  train on it; only the converted take is kept and published (AI-converted label, your name, the same licence);
  the recording is never kept. The other session's wording (record-takes, 814f390).
- **Line and title:** unchanged.
- **Removed since the first draft:** notes on moments (now v6) and the fal.ai takes paragraph (option c replaced it).

---

## Consent own-words-v6 (notes on moments) — DRAFT, ships only with notes

v6 is v5 with these changes, on the day notes on moments go live (branch `moment-pages`; not built yet: no note
form, no Mentions list, no notification, no spam brake). If v5 has not shipped by then, the two are merged.

**Line:** Public, permanent, GPL-3.0 (notes CC0), shown with your name. You can hide it.

**Paragraph 4, one sentence added:** … under the same license. Notes on moments are the exception: they are
released under CC0 (paragraph 8).

**Paragraph 8, new:**

8. A note you write on a moment is public, shown with your name, and released under CC0: anyone may use it for
   anything, without asking. If you @mention someone (by Farcaster name, Basename or address), the mention is
   shown to them in a Mentions list on their You page and, if they have added the Snowmoon mini app on
   Farcaster, sent to them as a notification. A wallet account that has never paid can write 3 notes a day,
   within a limit for all such accounts together; once it has paid, it has the same limits as a Farcaster
   account. [Only if built: the same limits apply to attaching X posts.]

The Farcaster accounts' limit for notes isn't in the repo yet, so the text names no number for it.

---

## Terms of Use §3, §5 and §8 — DRAFT

Ship with v5 (§3 and §8 on the day GPT Remix goes live; §5's Basename on the day Basenames go live).

> **3. The book and the licence.** Snowmoon is the author's work, released under the GNU General Public License
> version 3. The text, pictures, audio and code on the Service are offered under that same licence, including
> pictures made with a closed AI model (section 8), and the source and the full record of how each piece was made
> are public in our repository. Nothing in these Terms limits the rights the licence gives you.

Changed: "including pictures made with a closed AI model (section 8)" added (D4).

> **5. What you add.** If you publish something through the Service, or make a frame in Remix (which is saved,
> and can be seen by anyone with its link, as soon as it is made), it remains yours, and you license it to
> everyone under GPL version 3, whichever model drew it. You confirm it is your own work, or that you have the
> right to license it this way. Your name is shown with it: your Farcaster name, or, for a wallet account, its
> Basename if it has one, otherwise its address shortened. Where the Service says so before you publish, the
> prompts and any planning thread that led to the piece are published with it. Published work is public and
> others may copy it under the licence. We can hide it on request (see section 7), but we cannot recall copies
> others have made.

Changed: "whichever model drew it" (D4: a Remix frame from GPT Image is GPL-3.0 like one from FLUX); the Basename
before the shortened address (Basenames, D6).

> **8. AI-made material.** The narration, many pictures (every frame made in Remix among them) and the
> assistant's answers are produced by AI models and are labelled as such. Some pictures are made with a closed
> model, one whose maker does not publish its weights. The closed model used now is OpenAI's GPT Image 2.5
> Sunburst, through Vercel AI Gateway. It drew a version of an adaptation (version 2 of Fifteen Days), and it
> draws Remix frames for that version. Wherever such a picture appears, it is labelled with the model, its
> maker and that it is closed [TO VERIFY: share images, item 4]. Its recipe records the date it was made. These
> pictures are AI-generated, not the author's work. Like everything else on the Service, they are offered under
> GPL version 3 (section 3). AI-made material can be wrong. The assistant's commentary is not the book and is not
> advice of any kind.

### OpenAI's terms (for §3, §5 and §8)

Read 2026-10-19 by the other session from OpenAI's own page, https://openai.com/policies/services-agreement/
("Updated: December 1, 2025"):

> 4. Customer Content. 4.1. Generally. Customer and Customer's End Users may provide Input and receive Output. As
> between Customer and OpenAI, to the extent permitted by applicable law, Customer: (a) retains all ownership rights
> in Input; and (b) owns all Output. OpenAI hereby assigns to Customer all OpenAI's right, title, and interest, if
> any, in and to Output.

> 4.2. OpenAI Obligations. OpenAI will only use Customer Content as necessary to provide Customer with the Services,
> comply with applicable law, enforce the OpenAI Policies, and prevent abuse. OpenAI will not use Customer Content to
> develop or improve the Services, unless Customer explicitly agrees to such use.

Notes:
- **§4.2** supports "doesn't train on them" (consent ¶6). It stays TO VERIFY because we reach OpenAI through Vercel AI
  Gateway: the gateway's own terms, and how it passes these through, are what bind us.
- **§3.3(e)** says we may not "use Output to develop artificial intelligence models that compete with OpenAI's
  products and services". That binds us as the customer. It doesn't stop us licensing the frames under GPL-3.0
  (§4.1), but it's worth recording: people who copy the frames under GPL-3.0 aren't OpenAI's customers through us.
- The consumer Terms of Use say the same about ownership ("you … (b) own the Output. We hereby assign to you all our
  right, title, and interest, if any, in and to Output"; "Effective: January 1, 2026"). The API Services Agreement is
  the one that applies to us.

### What changed from the live §8

- **New:** some pictures come from a closed model. The text names the provider and model (OpenAI's GPT Image
  2.5 Sunburst) and the route (Vercel AI Gateway).
- **New:** where its output is used: version 2 of Fifteen Days, and Remix frames for that version.
- **New:** each such picture is labelled with the model, the maker and "closed", and its recipe records the
  date. This is the same as the editor-v2 draft's §8 clause.
- **New:** these pictures are AI-generated, not the author's, and are GPL-3.0 like everything else (D4).
- "They can be wrong" becomes "AI-made material can be wrong", so it still covers everything above it. The first
  and last sentences are unchanged.

---

## Privacy lines these answers need — DRAFT

**§4 (what we keep), new item, with GPT Remix (D5):**

> For a Remix frame drawn with GPT Image, we also keep the model's original picture (a PNG) privately; it is
> never public. We erase it when the frame is deleted, when you ask us to, or when we decide to.

**§7 (outside services), new item, with recording takes** (the other session's wording, record-takes 814f390):

> Modal, where we run the open-weight voice model ourselves, receives your recording and the character's
> published voice when you convert a take, and returns the take. The recording is held only for the seconds the
> conversion takes and then deleted; Modal's terms forbid it to train any AI model on what we send.
