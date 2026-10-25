# fal storage: the order of changes (owner, 2026-10-24)

fal keeps every output file at a `*.fal.media` link. The account settings are `{"expiration_duration_seconds":null,
"initial_acl":null}` (GET `https://api.fal.ai/v1/storage/settings`, 2026-10-24): no expiry, public to anyone with
the link. Per-request lifecycle headers were not honoured for LongCat video, through either sync `fal.run` or the
queue (tests of 2026-10-24: anonymous fetch 200, file ACL "allow"). The queue did honour `num_frames`.

The order, each step only after the one before:

1. **open-call copies everything and stops using fal links.** Its bench plays only our R2 copy, and "Retry copy"
   reads with a fresh CDN token or fails plainly (We-Are-Lum/open-call#4). Checked 2026-10-24: no render existed
   only as a fal link.
2. **The owner says "PUT" → a fresh GET → PUT the 24-hour expiry → GET again** (owner, 2026-10-25: "24 hours, not
   1"). `PUT https://api.fal.ai/v1/storage/settings` replaces the whole object, so the PUT is exactly
   `{"expiration_duration_seconds": 86400, "initial_acl": null}`, and `scripts/fal-expiry.ts put` refuses if the fresh
   GET holds anything else. Then a test file (`scripts/fal-expiry.ts make`, an upload, no model call), checked at 24
   and 25 hours (`check`). Before "PUT": open-call copies without the webhook (We-Are-Lum/open-call, branch
   poll-and-copy), and the owner checks fal's usage page for other users of the account and scans the database for
   fal links as postgres.
3. **The eight offline scripts and open-call download with a fresh token.** The scripts are `fal-render.py`,
   `fal-batch.py`, `fal-shots.py`, `shot-options.py`, `redo-c2.py`, `style-round-two.py`, `design-voice.py` and
   `make-music.py` (anonymous `curl -o` today). open-call is done in step 1. The site's `runVideo` already does it.
4. **Only then account-wide blocking** (`"initial_acl": {"default": "forbid"}`), after one cheap check that models
   can still read our uploaded inputs.

Privacy §7 gets a deletion line only once a real test shows a link gone after the 24 hours.
