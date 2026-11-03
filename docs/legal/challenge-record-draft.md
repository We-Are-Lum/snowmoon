# The challenge record's storage: a Privacy §7 line (DRAFT, for the owner's reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-02, on branch `deep-funding`. DRAFT until
the owner says "reread". Nothing in `src/lib/legal.ts` has changed. The record itself is already described by the
owner's own words, live since 2026-11-01 (Privacy §4 and Terms §6e); this line only names who stores it.

**It must be live before the export runs** (entries close Sun 22 Nov 2026, 23:59 Pacific; the record is exported and
pinned after that). Legal texts describe today: if the owner picks a different service, its name replaces Filebase
here before the first upload.

## Privacy §7 (Outside services and what they receive): a new item, after the Bluesky and Lens item

Before (main's `src/lib/legal.ts`, the item it follows, unchanged):

> Bluesky and Lens receive the details of a post someone adds to a version's page (Bluesky: its writer's handle or
> account id and the post's id; Lens: the post's id), so our server can read the post and check it links there. They
> receive nothing about you or the person who added it, and your browser never contacts them for this.

After (that item, unchanged, then the new item):

> Bluesky and Lens receive the details of a post someone adds to a version's page (Bluesky: its writer's handle or
> account id and the post's id; Lens: the post's id), so our server can read the post and check it links there. They
> receive nothing about you or the person who added it, and your browser never contacts them for this.

> Filebase stores the remix challenge's record on IPFS for us (section 4), and receives only that record, which is
> public: the fingerprints of each entry's pictures and recipe, its maker's Farcaster ID, when it was published and
> which versions it was built on. Nothing else about you is sent to it. On IPFS, anyone can fetch and copy the
> record.

## Notes for the owner

- **What Filebase receives is the record file only**, uploaded from the owner's machine with the owner's account.
  The site never talks to Filebase: the export script writes the file locally and has no upload path.
- **Your account with Filebase** (email, billing) is the owner's, not users' data, so it isn't in the Privacy Policy.
- **The local pin** (kubo on the owner's machine) sends the same public record to IPFS peers that ask for it; IPFS
  peers see the owner's machine's address, not users'. The item's last sentence covers what IPFS itself does.
- **Later files** (the final versions' pictures and metadata, and the results record) need their own words in their
  own release: the results record holds the deep funding shares, and the finals' pictures go on IPFS too.
- If Pinata is chosen instead, replace "Filebase" with "Pinata"; nothing else changes.
