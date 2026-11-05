import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, SOCIAL_SIGN_IN, WORK_ID } from '../config';
import { checkNeynar } from '../images/neynar';
import { CHALLENGE_LISTS } from './who';
import { bookCharacter } from '../images/designs';
import { PRIVACY } from '../legal';
import { privacyDescribesChallenge } from './open-sheets';
import { refusedBases } from './bases';
import { remixLines } from './lineage';
import { eligibility, entriesOpen, inWindow, needsScore, remixOfBase } from './rules';
import { isSocialPerson, socialAccountOf } from '../people';
import { socialAccount } from '../social/accounts';
import { blueskyDecision, type BlueskyFacts } from '../social/bluesky-check';
import { lensDecision } from '../social/lens-check';

/**
 * The remix challenge's eligibility, decided once, when a version is published (owner, 2026-10-31: "checked once at
 * publish and stored; never on page view"). Called only by the publish route (/api/designs), after the version is
 * written. For a version of a challenge character's fork made inside the window (a fork of one of its bases, or of a
 * remix of one; CHALLENGE.bases), it stores the decision in
 * studio.challenge_eligibility: 'admin', 'invited', 'passed' or 'below' (the account's Neynar check against
 * CHALLENGE.neynarMinScore), or 'unchecked' if Neynar didn't answer, and when. The check uses the stored decision
 * (studio.check_decisions; src/lib/checks/decisions.ts) while one is current, a pass for 90 days and a fail for 24
 * hours, so publishing asks Neynar only if no current decision exists; the Generate gate the publish route passes just
 * before stores the decision for this threshold too, so publishing asks Neynar at most once. No score is kept anywhere
 * (owner, 2026-11-04). Never throws: a version whose decision can't be stored
 * simply doesn't count (and the table missing, as on a database without 0033_remix_challenge, is the same).
 * Nothing is stored until the Privacy page describes the remix challenge (the owner's reread; legal texts describe
 * today), the same condition that opens sheets to everyone.
 */
type Sql = postgres.Sql;

export async function recordEligibility(sql: Sql, versionId: string, fid: number, now = new Date(), privacy = PRIVACY, bluesky?: (did: string) => Promise<BlueskyFacts>, lensScore?: (account: string) => Promise<number | null>): Promise<'stored' | 'not-a-candidate' | 'not-stored'> {
  try {
    if (!privacyDescribesChallenge(privacy)) return 'not-stored';
    if (!inWindow(now)) return 'not-a-candidate';
    // Nothing is recorded, and Neynar is not asked, until the owner opens the challenge (CHALLENGE.public; 2026-11-04).
    if (!entriesOpen(now)) return 'not-a-candidate';
    const names = CHALLENGE.characters.map((s) => bookCharacter(s)?.name).filter((n): n is string => Boolean(n));
    const [v] = await sql`
      select e.created_by_fid, e.id as element_id, en.name
      from studio.element_versions v join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
      where v.id = ${versionId} and e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID}
        and en.kind = 'character' and en.name in ${sql(names)}`;
    if (!v || Number(v.created_by_fid) !== fid) return 'not-a-candidate';
    // A remix that counts: a fork of one of the character's bases, or of a remix of one (CHALLENGE.bases).
    const slug = CHALLENGE.characters.find((s) => bookCharacter(s)?.name === String(v.name)) ?? '';
    const line = (await remixLines(sql, [String(v.element_id)])).get(String(v.element_id)) ?? [];
    if (!remixOfBase(slug, line, CHALLENGE.bases, await refusedBases(sql))) return 'not-a-candidate';
    let passed: boolean | null = null;
    if (fid > 0 && needsScore(fid)) {
      const r = await checkNeynar(sql, fid, CHALLENGE_LISTS.min);
      passed = r.ok ? r.passed : null;
    }
    // A Lens or Bluesky account: its own check, from the shared decision store (studio.check_decisions) while a decision
    // is current, or asked now, the same moment as Neynar's; only the decision is kept.
    if (isSocialPerson(fid)) {
      const account = await socialAccount(sql, socialAccountOf(fid));
      // Lens (overnight run 2026-11-05, item 4): its Lens score against SOCIAL_SIGN_IN.lens.minScore, network 'lens',
      // rule 'lens-score>=1000' (src/lib/social/lens-check.ts). Lens down: 'unchecked', as Neynar down is.
      if (account?.kind === 'lens') {
        const d = await lensDecision(sql, account.subject, { lookUp: true, score: lensScore });
        const e = eligibility({ maker: fid, passed: null, bluesky: d === 'passed' ? 'passed' : d === 'below' ? 'failed' : null });
        await sql`insert into studio.challenge_eligibility ${sql({ version_id: versionId, challenge: CHALLENGE.id, fid, decision: e.why, eligible: e.eligible, account: 'lens' })} on conflict (version_id) do nothing`;
        return 'stored';
      }
      if (account?.kind !== 'bluesky' || !SOCIAL_SIGN_IN.bluesky.check.on) return 'not-a-candidate';
      const d = await blueskyDecision(sql, account, bluesky, now);
      const e = eligibility({ maker: fid, passed: null, bluesky: d.ok ? d.decision : null });
      await sql`insert into studio.challenge_eligibility ${sql({ version_id: versionId, challenge: CHALLENGE.id, fid, decision: e.why, eligible: e.eligible, account: 'bluesky' })} on conflict (version_id) do nothing`;
      return 'stored';
    }
    const e = eligibility({ maker: fid, passed });
    if (e.why === 'not-a-farcaster-account') return 'not-a-candidate';
    const decision = e.why;
    await sql`insert into studio.challenge_eligibility ${sql({ version_id: versionId, challenge: CHALLENGE.id, fid, decision, eligible: e.eligible })} on conflict (version_id) do nothing`;
    return 'stored';
  } catch (e) {
    console.error('challenge: eligibility not stored', (e as { code?: string }).code ?? (e as Error).name);
    return 'not-stored';
  }
}
