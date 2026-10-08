# 009: Publish the house narration as a podcast

Given to the coding agent (Claude Code) on 2026-10-07, verbatim. The owner's four
texts followed in a separate message, also verbatim below; they are used exactly
in `config/podcast.json`.

## Prompt

> Publish the house narration as a podcast feed. Don't submit it to any directory; I'll do that after listening.
>
> 1. Feed at snowmoon.party/podcast.xml: RSS 2.0 with the itunes and podcast namespaces, serial type, one episode per chapter in order, category Fiction › Science Fiction, language en. Each item needs a stable guid, pubDate, title, description, enclosure (url, type, length), duration and episode number. Check it against Spotify's delivery spec and Apple's feed requirements, and run a feed validator.
>
> 2. Audio: make an MP3 of each chapter (mono, 128 kbps) from the existing stitched files, with a spoken opener at the start in the same Kokoro voice. Give each MP3 a recipe. Confirm media.snowmoon.party serves byte-range requests.
>
> 3. Words: the show title, show description, episode description template and spoken opener come from me. Use the text I paste below this prompt exactly, tagged "by FID 6786" with today's date. If I haven't pasted any, stop and ask.
>
> 4. Every episode description names the model and voice, links the chapter in the reader and its recipe, and carries the GPL notice. The author field is the publisher, not the book's author.
>
> 5. Cover art: render the channel avatar script at 3000×3000 and commit the script change.
>
> 6. Add a "Listen as a podcast" link on About, and a check that fails if the feed is invalid, an enclosure is missing, or an episode lacks the disclosure.
>
> Report: the feed URL, validator output, total size, anything in either platform's rules that this doesn't meet, and the Principles section.

## The owner's texts

> Show title: Snowmoon Party: an independent reading of Snowmoon
>
> Show description: Vitalik Buterin's open novel Snowmoon, read aloud one chapter per episode by a synthetic voice. An independent project, not affiliated with the author. No token. Text and audio are GPL v3; every step of how this was made is public at snowmoon.party.
>
> Episode description template: Chapter {n} of Snowmoon by Vitalik Buterin, read by a synthetic voice (Kokoro-82M, stock voice af_heart). An independent reading, not affiliated with the author. Read along: {chapter link}. How this audio was made: {recipe link}. Text and audio: GPL v3.
>
> Spoken opener: This is an independent reading of Snowmoon, by Vitalik Buterin. The voice is synthetic. A short tone marks a description that is not the book's own words.
