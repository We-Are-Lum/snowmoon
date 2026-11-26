# Entering a take in the Ephelion challenge, with its picture, report and hide, and the free picture: legal lines (DRAFT)

For Nate's reread. Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-26, v2 (with Nate's answers
of 2026-11-26: report and hide folded into PR 6; the free picture uses GPT Image). Nothing here is in `src/lib/legal.ts`
yet: each line ships in the PR that makes it true, after the reread.

Already said, and not repeated:
- Terms §5: "If you record a speech, record only your own voice, and don't imitate a real person. Your recording is
  never published; the converted speech you publish is licensed GPL-3.0, like everything else you publish here."
- Terms §7: we may hide content that breaks these Terms; you may hide your own work yourself where the Service offers it.
- The consent (own-voice-v4): once published, the converted speech is "public and permanent, licensed GPL-3.0"; its public
  recipe names the voice, the model, its settings and the recording's fingerprint.
- Privacy §7: Groq (and Vercel AI Gateway when Groq is busy) receives "the prompts for images you make, which are
  checked against the published rules".

## Privacy §4 (what we keep), two new items

1. Entering a take (PR 6):
   > If you enter a take in the Ephelion challenge: the converted speech, with your name, the speech, the voice, the
   > words of your take as transcribed (with any corrections), and its picture: a ready-made picture of Lord Ephelion
   > (an approved one or a ready-made scene), one of your own published pictures of him, or the one you described, with
   > its labels, credit and recipe. These are public until you take the take down. Never your recording.

2. The free picture (the free-picture PR), Nate's wording:
   > If you describe your own scene for the Ephelion challenge, your description is checked against the published rules
   > and sent, with Lord Ephelion's published sheet, to the model that makes the picture. Each account can make one free
   > picture; we keep that you made it. A refused or failed one doesn't count.

## Privacy §6 (what you publish), added (PR 6)

> A take you enter in the Ephelion challenge is public, shown with your name and its picture, with that picture's labels
> and credit, on its own page, in its Share card and under its speech on the challenge page, until you take it down. A
> picture of yours used in a take is shown with it, credited to you. If a picture is hidden after a report, the takes
> that use it are hidden with it.

## Privacy §7 (who receives what)

1. #225's ntfy item becomes (PR 6, which now has Report for takes):
   > ntfy delivers a short alert to us when an image, a storyboard or a take is reported. It carries no content and
   > nothing about you.
2. The free picture's model (the free-picture PR; GPT Image, Nate 2026-11-26), added after the storyboard pictures' item:
   > If you describe your own scene for the Ephelion challenge, OpenAI receives your description and Lord Ephelion's
   > published sheet, through Vercel AI Gateway, to make the picture. It keeps them as set out above for its pictures,
   > and receives nothing else about you.

## Terms, a new §6f, "The Ephelion challenge." (PR 6; the free-picture sentence with the free-picture PR)

> The challenge page sets out its speeches and what happens after. Admins and the people we invite can enter now; once
> it opens, anyone signed in whose account passes the site's check for it. An entered take is public and credited to you
> (section 5), with its picture; you can have one live take of each speech, enter another in its place, and take it down
> at any time. Each account can make one free picture of its own scene; one that's refused or doesn't come back doesn't
> count. We may change or end the challenge, and the page will say so.

If the challenge has rewards: nothing that sells entries goes live before a lawyer has looked (Nate, 2026-11-25); paid
pictures are parked in #245.

## On screen (the free picture), Nate's lines

- Quotation marks: "Take out the words in quotation marks: this picture can't show writing. Describe what he wears and
  where he is instead. Your free picture isn't used."
- The rules: "That description isn't allowed by the site's rules (no real people). Change it and try again. Your free
  picture isn't used."
- Didn't come back: "The picture didn't come back. Try again. Your free picture isn't used."
- Under the button: "One free picture per account. If it's refused or doesn't come back, it isn't used. If it comes out
  differently than you hoped, it is."
- Made: "Made. It's in the preview above. That was your free picture." (desktop: "Made. It's in the preview. That was
  your free picture.")
- Used: "You've made your free picture."
