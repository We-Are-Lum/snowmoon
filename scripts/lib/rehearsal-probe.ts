/**
 * For scripts/test-rehearsal.ts only: what the app's own modules make of this process's settings, as one JSON line.
 * Run in a child process so the config is read afresh under the settings being tested.
 */
const { CHALLENGE, REHEARSAL } = await import('../../src/lib/config');
const { CHALLENGE_LISTS } = await import('../../src/lib/challenge/who');
const { eligibility } = await import('../../src/lib/challenge/rules');
const { linksToVersion } = await import('../../src/lib/challenge/post-links');
const { challengeVisibleTo } = await import('../../src/lib/challenge/visibility');
const v = '0000ba5e-0000-4000-8000-000000001001';
console.log(
  JSON.stringify({
    on: REHEARSAL.on,
    id: CHALLENGE.id,
    public: CHALLENGE.public,
    opens: CHALLENGE.dates.opens,
    closes: CHALLENGE.dates.closes,
    bases: CHALLENGE.bases,
    admins: CHALLENGE_LISTS.admins,
    owner: eligibility({ maker: 6786, passed: null }).why,
    visibleSignedOut: challengeVisibleTo(null),
    rehearsalLink: linksToVersion({ links: [`http://127.0.0.1:3000/references/designs/${v}`] }, v),
    otherPortLink: linksToVersion({ links: [`http://127.0.0.1:4000/references/designs/${v}`] }, v),
    siteLink: linksToVersion({ links: [`https://snowmoon.party/references/designs/${v}`] }, v),
  }),
);
