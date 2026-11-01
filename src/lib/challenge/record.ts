import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, WORK_ID } from '../config';
import { lookUp } from '../images/neynar';
import { bookCharacter } from '../images/designs';
import { eligibility, inWindow, needsScore } from './rules';

/**
 * The remix challenge's eligibility, decided once, when a version is published (owner, 2026-10-31: "checked once at
 * publish and stored; never on page view"). Called only by the publish route (/api/designs), after the version is
 * written. For a version of a challenge character's fork made inside the window, it stores the decision in
 * studio.challenge_eligibility: 'admin', 'invited', or the Neynar score at publish ('score' or 'below'; 'unchecked' if
 * Neynar didn't answer). The score comes from the same lookup the publish gate just made (kept a day in
 * studio.image_scores), so publishing asks Neynar at most once. Never throws: a version whose decision can't be stored
 * simply doesn't count (and the table missing before the owner applies NEXT_remix_challenge is the same).
 */
type Sql = postgres.Sql;

export async function recordEligibility(sql: Sql, versionId: string, fid: number, now = new Date()): Promise<'stored' | 'not-a-candidate' | 'not-stored'> {
  try {
    if (!inWindow(now)) return 'not-a-candidate';
    const names = CHALLENGE.characters.map((s) => bookCharacter(s)?.name).filter((n): n is string => Boolean(n));
    const [v] = await sql`
      select e.created_by_fid,
        exists (select 1 from studio.element_versions v1 join studio.links l on l.from_version_id = v1.id and l.kind = 'remixed_from'
                where v1.element_id = e.id and v1.version_no = 1) as forked
      from studio.element_versions v join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
      where v.id = ${versionId} and e.element_type = 'design' and e.status = 'published' and e.work_id = ${WORK_ID}
        and en.kind = 'character' and en.name in ${sql(names)}`;
    if (!v || !v.forked || Number(v.created_by_fid) !== fid) return 'not-a-candidate';
    let score: number | null = null;
    if (fid > 0 && needsScore(fid)) {
      const r = await lookUp(sql, fid);
      score = r.ok ? r.value : null;
    }
    const e = eligibility({ maker: fid, score });
    if (e.why === 'not-a-farcaster-account') return 'not-a-candidate';
    const decision = e.why;
    await sql`insert into studio.challenge_eligibility ${sql({
      version_id: versionId, challenge: CHALLENGE.id, fid, decision,
      score: decision === 'score' || decision === 'below' ? score : null, eligible: e.eligible,
    })} on conflict (version_id) do nothing`;
    return 'stored';
  } catch (e) {
    console.error('challenge: eligibility not stored', (e as { code?: string }).code ?? (e as Error).name);
    return 'not-stored';
  }
}
