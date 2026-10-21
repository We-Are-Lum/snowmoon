"""Recording sheet for an adaptation: every spoken line of script.md, numbered in script order.

  python3 scripts/recording-sheet.py fifteen-days

Writes adaptations/<seed>/recording-sheet.md (for the performer) and recording-lines.json (for
scripts/split-takes.py): each line's number, its place in the script (b<beat>-<n>, the timeline's
reference), the speaker, the words to say, and the moment, taken from the picture notes before it.
Nothing here is new wording: the words are the script's, the moments are its directions, shortened.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BEAT = re.compile(r"^## Beat (\d+) · (.+)$")
FIELD = re.compile(r"^- \*\*([a-z ]+):\*\*\s*(.*)$")
ITEM = re.compile(r"^\s+- (?:`([^`]+)`\s*)?(.*)$")
NOTE = re.compile(r"\s*\*\(([^)]*)\)\*\s*$")
DIRECTION = re.compile(r"^\s+\*\[(.+?)\]")
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def number_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    t, o = divmod(n, 10)
    return TENS[t] + ("-" + ONES[o] if o else "")


def short(text: str, words: int = 14) -> str:
    w = text.replace("**", "").split()
    return " ".join(w[:words]) + ("…" if len(w) > words else "")


def spoken(text: str) -> str:
    """The words to say: no surrounding quotes, no cut marks at the edges."""
    t = text.strip()
    if len(t) >= 2 and t[0] == '"' and t[-1] == '"':
        t = t[1:-1]
    return t.strip("… ").strip()


def read_lines(seed: str) -> list[dict]:
    lines, beat, title, field, k, moment = [], 0, "", "", 0, []
    for raw in (ROOT / "adaptations" / seed / "script.md").read_text().split("\n"):
        if m := BEAT.match(raw):
            beat, title, field, k, moment = int(m[1]), m[2], "", 0, []
            continue
        if not beat:
            continue
        if f := FIELD.match(raw):
            field = f[1]
            continue
        if field != "dialogue":
            continue
        if d := DIRECTION.match(raw):
            moment.append(d[1])
            continue
        if it := ITEM.match(raw):
            body = it[2]
            note = NOTE.search(body)
            body = NOTE.sub("", body).strip()
            speaker, _, text = body.partition(":")
            k += 1
            lines.append({
                "n": len(lines) + 1, "ref": f"b{beat}-{k}", "beat": beat, "beat_title": title,
                "speaker": speaker.strip(), "text": spoken(text), "tag": it[1],
                "note": note[1] if note else None,
                "moment": short(moment[-1]) if moment else None,
            })
            moment = []
    return lines


def main() -> None:
    seed = sys.argv[1]
    lines = read_lines(seed)
    out = ROOT / "adaptations" / seed
    (out / "recording-lines.json").write_text(json.dumps({"seed": seed, "lines": lines}, indent=2, ensure_ascii=False) + "\n")
    beats = sorted({l["beat"] for l in lines})
    md = [
        f"# {seed}: recording sheet",
        "",
        "> Made by `scripts/recording-sheet.py` from `script.md`; run it again after any script change.",
        "> The words are the script's; the moments are its picture notes, shortened.",
        "",
        "**How to record.** One file per beat, in `~/snowmoon-takes/full/`, named `beat-<n>` (any audio",
        "format; beats with no spoken lines need no file). Before each line, say its number (\"line",
        "twelve\"), then do as many takes as you like. After a take you like, say \"keep\"; with no",
        "\"keep\", the last take is used. Leave a short breath between takes.",
        "",
        "**Afterwards.** Whisper (local) finds the slates and the keeps; the slates and \"keep\" are cut",
        "out; the chosen take of each line is converted into its character's voice; the other takes stay",
        "in `~/snowmoon-takes/full/takes/`, outside the repository, in case you want to swap one.",
        "Lines that can't be matched are flagged.",
        "",
        f"{len(lines)} lines, {sum(len(l['text'].split()) for l in lines)} words, in {len(beats)} files.",
    ]
    for b in beats:
        bl = [l for l in lines if l["beat"] == b]
        md += ["", f"## beat-{b} · {bl[0]['beat_title']}", ""]
        for l in bl:
            moment = l["moment"] or f"straight after line {l['n'] - 1}" if l["n"] > 1 else l["moment"] or ""
            cue = re.sub(r"(after )?c\d+-b\d+;?\s*|,?\s*book$", "", l["note"] or "").strip(" ;,")
            how = f" *({cue})*" if cue else ""
            if not (ROOT / "adaptations" / seed / "voices" / f"{l['speaker'].lower()}.json").exists():
                how += " *(no voice sheet yet: recorded, not converted)*"
            md.append(f"**{l['n']}.** ({number_words(l['n'])}) **{l['speaker'].upper()}**: {l['text']}{how}  ")
            md.append(f"<sub>{moment}</sub>" if moment else "")
            md.append("")
    (out / "recording-sheet.md").write_text("\n".join(md).rstrip() + "\n")
    print(f"{len(lines)} lines → adaptations/{seed}/recording-sheet.md, recording-lines.json")


if __name__ == "__main__":
    main()
