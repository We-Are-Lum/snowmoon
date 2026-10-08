# 010: Podcast loudness and cover; reporting mispronunciations

Given to the coding agent (Claude Code) on 2026-10-08, verbatim, in two messages.
The owner email arrived as the placeholder "[your address]" both times and has
not been used.

## First message

> Podcast:
> - Cover art and its script are attached. Commit make_channel_art.py under scripts/ with a note that it needs Playwright and the two fontsource packages, commit the PNG, give it a recipe, and add it to the feed and the episodes.
> - Owner email: [your address]. Add itunes:owner back with it.
> - Loudness: re-encode all 32 episodes to −16 LUFS with a true peak of −1 dB, two-pass. Update the recipes, file names, lengths and durations. Tell me whether the app's own narration files are equally quiet; don't change those yet.
> - Keep episode titles as "Chapter N".
> - Re-run check:podcast and both validators. Don't submit anywhere.
>
> Principles check: count skipped checks separately from passes in the summary, and make the summary say "not run" for each one. A run where any check was skipped must not report all passing.
>
> Desktop layout: leave it unmerged until I've looked at the screenshots. No website sign-in for now.
>
> Report: validator results, loudness before and after, and the Principles section.

## Second message

> Change of plan on the podcast: no listening sheet and no pronunciation pass now.
>
> 1. Loudness: re-encode all 32 episodes to −16 LUFS, true peak −1 dB, two-pass. Update recipes, file names, lengths and durations. Tell me whether the app's own narration is equally quiet; don't change it yet.
> 2. Cover art, owner email and the principles-check fix as in my last message.
> 3. Reporting mispronunciations, with no new table and no new text field:
>    - In the chapter player, a "Report a mispronunciation" link for the block being read. Inside Farcaster it opens the cast composer to the /snowmoon channel, prefilled with the chapter, paragraph number and a link to the block. Outside Farcaster it opens a prefilled GitHub issue in the repo with the same details and a "pronunciation" label.
>    - Add the line I give below to the episode description template, linking to that chapter's report page. Wait for my wording.
>    - Document the fix process in docs/: a report, my approval, the entry marked reviewed by FID 6786, only affected blocks re-spoken, podcast and app files updated together.
>    - Fix "breathed" as the first one, and tell me how many blocks it touched.
> 4. Re-run check:podcast and both validators. Don't submit anywhere; I'll do that.
>
> Report: loudness before and after, validator results, a screenshot of the report link in the player, and the Principles section.
