# own-voice-v1 (draft, not approved)

Drafted by the coding agent on 2026-10-13 from the owner's terms of the same
day. Nothing records agreement to it until the owner approves the wording; it
then moves into `config/consent.json` as a version of kind `own_voice`, and
its sha256 is recorded with each agreement, as for `own-words`.

Agreed once per performer, before their first take is converted. A performer
who isn't signed in (a friend recording offline) agrees in writing, and the
signed copy's sha256 is recorded instead; the copy stays private.

## Line

Your converted voice is public and GPL-3.0. Your own recordings are never released.

## Title

Your performance, in a character's voice

## Text

1. You record lines from a script. Each recording is converted into a
   character's voice, and only the converted line is published.
2. The converted line is public and permanent, licensed GPL-3.0 like
   everything in this edition. Anyone may copy, edit and adapt it, including
   converting it again into another voice.
3. Your own recordings are never published or released. They stay on the
   device that recorded and converted them, in a private folder, and are not
   uploaded to the project's repository or storage. A hosted service is used
   for a recording only if you agree to that for that recording.
4. Each converted line's public recipe names the model, its settings, the
   character's reference clip, and a fingerprint (sha256) of your recording.
   The fingerprint shows which recording was used; your voice can't be
   recovered from it.
5. A converted line can keep your timing, phrasing and delivery, though not
   your voice. You're credited as its performer by your Farcaster name (or
   the name you give), unless you ask not to be named.
6. You can ask for a line to be hidden from view, like any other contribution.
   Copies others have already made may remain.
7. You must not perform a voice that imitates a real person.

## Notes for the owner

- Point 5 says the converted voice isn't yours. That is the intent; conversion
  replaces timbre but keeps prosody. Test 1 will show how much of you comes
  through, and the wording can be tightened after it.
- Crediting performers by default (point 5) is my addition; the terms you sent
  didn't say. Strike it if you'd rather credit "performed by a person" only.
- Point 6 follows `docs/removal.md` as for written contributions.

## The Modal conversion: what is proven, and what Modal keeps

Point 3 promises that our own server on Modal deletes the recording right after
conversion. The owner asked for a proof before own-voice-v1 ships (2026-10-23).

**Proven, with no Modal and no spending** (`npm run check:modal-vc`, and `P1h`
in `check:principles`), on `modal/chatterbox_vc.py`:

- A static read: no volume write or `.commit()`, no Dict, Queue or other Modal
  storage, no Web Function or Modal Function (see below), no network client,
  only one log helper (`_log`), which refuses any field but sizes, durations, the
  input's sha256, timings and an error's type name; the HTTP server's request
  log and traceback printing are switched off; the files the model reads are
  written only into a per-call folder made by `tempfile.mkdtemp` and removed
  with `shutil.rmtree` in a `finally`, which also confirms the folder is gone
  (or stops the container); one request per container at a time.
- A local run (`scripts/modal_vc_proof.py`): the real handler on 127.0.0.1, with
  a stub model that reads both files, drops a library-style temp file and a
  cache file, and in some cases raises an error quoting the recording's base64,
  times out, or is cancelled (a `BaseException`). Ten scenarios, including bad
  requests and the folder of a container killed mid-call (swept at the next call
  and at exit). Before and after each, the temp root, the weights path, the
  working folder and HOME are snapshotted: no new or changed file may remain.
  Everything written to stdout and stderr (at the file-descriptor level) and to
  `logging`, and every reply, is searched for the input's bytes, base64 and hex,
  and any long hex run other than its sha256. No stub storage may be touched,
  and afterwards no live Python object may hold the recording.
- Ten planted violations (folder not removed, base64 printed, an error's
  message logged, a traceback printed, a volume committed, the recording put in
  a Dict, kept in a list, a temp file outside the folder, a Web Function, the
  request log left on) are each caught.

**Not proven by it**: the real model and GPU (a stub stands in), and anything
outside our code. In memory, Python frees the recording but does not wipe it;
the container's RAM and GPU memory are released when it stops (at most 120 s
after the last call). The site's side, which sends the recording to Modal, is
not part of this file and needs its own check when /record is built.

**What Modal says it keeps** (https://modal.com/docs/guide/security, read
2026-10-23):

- "Inputs and outputs" of "Functions (`.remote`, `.spawn`, `.map`, Web
  Functions, Scheduled Functions)": "Up to 7 days, then deleted". A Web Function
  is what `@modal.fastapi_endpoint` makes, which the earlier draft on
  `record-takes` used: there, Modal would have kept the recording up to 7 days.
- "Request and response payloads" of "Server and Auto Endpoints": "Not stored
  — proxied directly to your container". This is why the conversion is a Modal
  Server (`@app.server`), and why the check fails on any Web Function.
- "App and container logs": "1 day on Starter, 30 days on Team". Ours hold only
  sizes, durations, the sha256, timings and error type names.
- Modal's terms (§5.5) forbid training on or feeding customer data to language
  models without consent.

So point 3's "deletes your recording right after conversion" holds for our
code, and for Modal's platform as far as Modal documents it for Servers. The
documentation is one table row, not a contractual promise; a written
confirmation from Modal that Server request bodies are never written to disk
would close the remaining gap.

**Deploying, for the owner (not done; nothing has been spent).** In the owner's
Modal account:

1. `modal deploy modal/chatterbox_vc.py` (builds the image with the pinned
   weights; prints the Server's URL).
2. In Modal's dashboard, create a proxy auth token for the site (Settings,
   Proxy Auth Tokens). Keep its key and secret out of chat; set them in Vercel
   later as `MODAL_VC_KEY` and `MODAL_VC_SECRET`, with `MODAL_VC_URL`.
3. A test with no person's voice (a macOS system voice, as for the local test
   of 2026-10-13): `say -o /tmp/vc-src.aiff "A test line." && ffmpeg -i
   /tmp/vc-src.aiff /tmp/vc-src.wav`, then a JSON body with `source_b64`,
   `target_b64` (a published character clip, as WAV), `source_ext: "wav"`,
   `target_ext: "wav"`, POSTed with the headers `Modal-Key` and `Modal-Secret`;
   the reply is the converted WAV.
4. `modal app logs snowmoon-chatterbox-vc`: only JSON lines with sizes,
   durations, timings and the sha256 (compare with `shasum -a 256
   /tmp/vc-src.wav`). `modal volume list`, `modal dict list` and `modal queue
   list` show nothing new.
5. `modal app stop snowmoon-chatterbox-vc` when done.

Expected cost (Modal's list prices, read 2026-10-23: T4 $0.000164/s, CPU
$0.0000131/core/s, memory $0.00000222/GiB/s): a cold call is about 60 s of
start and model load, 5–20 s of conversion and up to 120 s idle before the
container stops, so about 200 s: about $0.03 of GPU and under $0.01 of CPU and
memory, about $0.04 a test, under $0.25 for five. The Starter plan's $30 monthly
credit covers it.
