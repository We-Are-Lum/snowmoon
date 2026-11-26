# Entering a take in the Ephelion challenge, with its picture, and the free picture: legal lines (DRAFT)

For Nate's reread. Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-26, for PR 6 (entering
and sharing takes) and the free picture. Nothing here is in `src/lib/legal.ts` yet: each line ships in the PR that
makes it true, after the reread.

What is already said, and not repeated:
- Terms §5: "If you record a speech, record only your own voice, and don't imitate a real person. Your recording is
  never published; the converted speech you publish is licensed GPL-3.0, like everything else you publish here."
- The consent (own-voice-v4): once published, the converted speech is "public and permanent, licensed GPL-3.0";
  the public recipe names the voice, the model, its settings and the recording's fingerprint.
- Privacy §7: Groq (and Vercel AI Gateway when Groq is busy) receives "the prompts for images you make, which are
  checked against the published rules"; fal.ai receives image prompts and pictures for FLUX; OpenAI or Google receive
  them through Vercel AI Gateway for theirs.

## Privacy §4 (what we keep), two new items

1. Entering a take (PR 6):
   > If you enter a take in the Ephelion challenge: the converted speech, with your name, the speech, the voice, the
   > words of your take as transcribed (with any corrections), and its picture: a ready-made scene, an approved picture
   > of Lord Ephelion, one of your own published pictures, or the one you described, with its labels, credit and
   > recipe. These are public until you take the take down. Never your recording.

2. The free picture (the free-picture PR), Nate's wording:
   > If you describe your own scene for the Ephelion challenge, your description is checked against the published rules
   > and sent, with Lord Ephelion's published sheet, to the model that makes the picture. Each account can make one free
   > picture; we keep that you made it. A refused or failed one doesn't count.

## Privacy §6 (what you publish), added (PR 6)

> A take you enter in the Ephelion challenge is public, shown with your name and its picture, with that picture's labels
> and credit, on its own page, in its Share card and under its speech on the challenge page, until you take it down. A
> picture of yours used in a take is shown with it, credited to you.

## Privacy §7 (who receives what)

1. The free picture's model (the free-picture PR), added after the storyboard pictures' item:
   > If you describe your own scene for the Ephelion challenge, the model that makes the picture receives your
   > description and Lord Ephelion's published sheet: fal.ai for FLUX; OpenAI or Google, through Vercel AI Gateway, for
   > theirs. Each keeps them as set out above for its pictures, and receives nothing else about you.

   (Which model makes it is still Nate's decision: GPT Image, about $0.05 a picture measured, or FLUX, about $0.01.
   If only one is used, this names only its maker.)
2. #225's ntfy item becomes, in the report-and-hide PR for takes (PR 7, not PR 6: PR 6 has no Report button):
   > ntfy delivers a short alert to us when an image, a storyboard or a take is reported. It carries no content and
   > nothing about you.

## Terms, a new §6f, "The Ephelion challenge." (PR 6; the free-picture sentence with the free-picture PR)

> The challenge page sets out its speeches and what happens after. Admins and the people we invite can enter now; once
> it opens, anyone signed in whose account passes the site's check for it. An entered take is public and credited to you
> (section 5), with its picture; you can have one live take of each speech, and take it down at any time. Each account
> can make one free picture of its own scene; one that's refused or doesn't come back doesn't count. We may change or
> end the challenge, and the page will say so.

If the challenge has rewards: nothing that sells entries goes live before a lawyer has looked (Nate, 2026-11-25); the
paid pictures are parked in #245.

## On screen, for the reread (the free picture)

- The refusal for a description with words in quotation marks (Nate, 2026-11-26: "Refuse descriptions with words in
  quotation marks"):
  > Leave out words in quotation marks: the picture can't have writing in it. Nothing was made, and your free picture
  > is still yours.
- A refused description (the rules): "This description wasn't allowed by the site's rules, so nothing was made. Your
  free picture is still yours: change it and try again."
- A picture that didn't come back: "The picture didn't come back. Your free picture is still yours: try again."
- After it is made: "Made. That was your free picture." (plan v3's line)
- A picture that came out wrong is not redone for free: "Your free picture is used. You can still choose a ready
  picture."
