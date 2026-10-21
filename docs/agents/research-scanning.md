# Research: scanning brought-in images for CSAM, and the legal duties

Research by a coding-agent helper, 2026-10-20. Not legal advice: the reporting procedure needs
counsel. Sources are the vendors' and the law's own pages unless marked.

## Options

| Option | Access | Before storage? | Price as published |
|---|---|---|---|
| **Project Arachnid Shield** (Canadian Centre for Child Protection) | register, then an API key; aimed at service providers ([projectarachnid.ca](https://projectarachnid.ca/en/)) | yes: scans bytes, a URL or a PDQ hash; official SDKs | free |
| **Microsoft PhotoDNA Cloud** | apply; vetted by a third party, at Microsoft's discretion; may be re-verified or suspended ([cloudservice](https://www.microsoft.com/en-us/photodna/cloudservice), [terms](https://www.microsoft.com/en-us/photodna/termsofuse)) | yes: REST, images only; Microsoft keeps no images | free for qualified customers; a "Limited Offering" with an unstated monthly cap |
| **Thorn Safer** (Match: hashes; Predict: a classifier for new material) | sales only ([safer.io](https://safer.io/)) | yes | AWS Marketplace's smallest Match tier: 1M queries a month, $30,720 on a 12-month contract |
| **Hive CSAM API** (resells Thorn's hashes plus a classifier) | sales ([thehive.ai](https://thehive.ai/apis/csam-detection)) | yes; deletes the original after making embeddings; can prepare NCMEC reports | "contact sales" |
| Google Content Safety API / CSAI Match | interest form, approved partners ([tools](https://protectingchildren.google/tools-for-partners/)) | a priority score for human review; CSAI Match is video only | free to approved partners |
| **Cloudflare CSAM Scanning Tool** | a verified email since Feb 2025 ([docs](https://developers.cloudflare.com/cache/reference/csam-scanning/)) | **no**: it scans what is served through the cache, after storage; R2 only if served through a proxied custom domain (likely, unconfirmed) | free |
| IWF hash list | needs over 12 months of trading and more than 2 unrelated staff | — | fees; this LLC likely ineligible |

## The law (US)

- **18 U.S.C. §2258A** ([text](https://www.law.cornell.edu/uscode/text/18/2258A)): a provider
  with **actual knowledge** of apparent CSAM (and, since the REPORT Act of 2024, child sex
  trafficking and enticement) must report to NCMEC's CyberTipline as soon as reasonably possible.
  A report counts as a request to **preserve for 1 year** (was 90 days), stored securely with
  limited access. Fines for a knowing failure: up to $600k first, $850k after (providers under
  100M monthly users).
- **Scanning is not required** (§2258A(f)); it is voluntary.
- **Registering:** 28 CFR 81.12: call NCMEC (1-800-843-5678) for provider reporting credentials.
- **§2258B immunity** covers reporting and preservation, not misconduct; limit who can access the
  material; don't forward, share, re-upload or keep it outside the preservation copy.
- **Viewing before reporting is unsettled:** *US v. Wilson* (9th Cir. 2021) and *Lawshe v. Verizon*
  (M.D. Fla. 2025, non-binding) point different ways. Describe the review accurately in each
  report; ask counsel whether a person should look.
- **States:** some require technicians to report (Utah, North Carolina); Illinois (from
  2026-01-01) requires a designated contact with the CyberTipline. No Wyoming provision found
  (unverified).

## Recommended minimal setup (about 1,000 images a day)

1. **Before uploads open:** register with NCMEC; write a short procedure (who reviews, how to
   report, how to preserve), with counsel.
2. **In the upload function:** keep the bytes in memory; check them with Arachnid Shield (and
   PhotoDNA once approved); store to R2 only if every check is clean; **fail closed** if a check
   can't answer.
3. **On a match:** never store in the normal buckets; suspend the agent and its human's agents;
   keep the file and its metadata in a separate encrypted, access-restricted preservation store for
   1 year; report.
4. **A free second layer:** Cloudflare's tool on the zone that serves the images.
5. **Later:** classifiers for new material (Hive, Safer Predict, Google) need human review and
   contracts.

Cost: $0 as published for Arachnid Shield, PhotoDNA and Cloudflare; the real costs are a few days
of engineering, approval time (weeks, unpublished) and an hour of counsel.
