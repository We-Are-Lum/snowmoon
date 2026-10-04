"""Build a podcast RSS feed for the house narration, one episode per chapter.

The feed is free and non-exclusive: podcast apps read it, and the same audio
files stay downloadable without DRM. Every episode carries the GPL-3.0 notice,
a link to the source, and a statement that the narration is synthetic.

Nothing is published by this script. It reads the narration recipes in
content/snowmoon/recipes/narration/ and the local chapter files, and writes an
XML file. The audio must be hosted at --audio-base-url (R2, Milestone 3) before
the feed means anything.

Run:
  python3 scripts/podcast-feed.py --audio-base-url https://example.org/audio \\
      --site-url https://example.org --out narration-out/podcast.xml
"""

import argparse
import json
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / "content" / "snowmoon" / "recipes" / "narration"
AUDIO = ROOT / "narration-out"
REPO_URL = "https://github.com/We-Are-Lum/snowmoon"
SOURCE_URL = "https://vitalik.eth.limo/snowmoon/"

NOTICE = (
    "Snowmoon was written by Vitalik Buterin and released under the GNU General Public "
    f"License v3 ({SOURCE_URL}). This is an independent adaptation, not affiliated with "
    "or endorsed by the author. The narration is synthetic speech from an open-weights "
    "model (Kokoro-82M, stock voice af_heart); no real person's voice was cloned. "
    "This recording is published under GPL-3.0. Everything used to make it, including "
    f"the scripts, prompts and per-block recipes, is at {REPO_URL}."
)


def hms(ms):
    s = round(ms / 1000)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-base-url", required=True, help="where chapter-N.m4a files are hosted")
    ap.add_argument("--site-url", required=True)
    ap.add_argument("--cover-url", help="square cover art, 1400 to 3000 px")
    ap.add_argument("--out", default=str(AUDIO / "podcast.xml"))
    args = ap.parse_args()

    base = args.audio_base_url.rstrip("/")
    items = []
    recipes = sorted(RECIPES.glob("chapter-*.json"), key=lambda p: int(p.stem.split("-")[1]))
    first = None
    for path in recipes:
        r = json.loads(path.read_text())
        n = r["chapter"]
        audio = AUDIO / f"chapter-{n}" / r["stitched"]["m4a"]
        size = audio.stat().st_size if audio.exists() else 0
        made = datetime.fromisoformat(r["generated_at"])
        first = first or made
        # Episodes keep book order in apps that sort by date.
        pub = first + timedelta(minutes=n)
        items.append(f"""    <item>
      <title>Chapter {n}</title>
      <itunes:episode>{n}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <description>{escape(NOTICE)}</description>
      <enclosure url="{escape(f'{base}/chapter-{n}.m4a')}" length="{size}" type="audio/mp4"/>
      <guid isPermaLink="false">sha256:{r['stitched']['m4a_sha256']}</guid>
      <pubDate>{format_datetime(pub)}</pubDate>
      <itunes:duration>{hms(r['total_duration_ms'])}</itunes:duration>
      <link>{escape(args.site_url)}</link>
    </item>""")

    cover = f'\n    <itunes:image href="{escape(args.cover_url)}"/>' if args.cover_url else ""
    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Snowmoon (synthetic narration)</title>
    <link>{escape(args.site_url)}</link>
    <language>en</language>
    <copyright>GPL-3.0. Text by Vitalik Buterin; adaptation and narration pipeline at {REPO_URL}</copyright>
    <itunes:author>Vitalik Buterin (text); Snowmoon project (synthetic narration)</itunes:author>
    <description>{escape(NOTICE)}</description>
    <itunes:type>serial</itunes:type>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Fiction"><itunes:category text="Science Fiction"/></itunes:category>{cover}
    <lastBuildDate>{format_datetime(datetime.now(timezone.utc))}</lastBuildDate>
{chr(10).join(items)}
  </channel>
</rss>
"""
    Path(args.out).write_text(feed)
    print(f"{len(items)} episodes -> {args.out}")


if __name__ == "__main__":
    main()
