import { ADMINS, CHALLENGE, IMAGES, REHEARSAL } from '../config';

/**
 * Who the remix challenge's eligibility reads: admins (never eligible for rewards; owner, 2026-10-31), the invited
 * list, and the challenge's own Neynar threshold (CHALLENGE.neynarMinScore, fixed for the whole challenge; owner,
 * 2026-11-01). Only read here; nothing in this file orders, publishes or hides anything (P5b).
 */
// Under the rehearsal switch only (REHEARSAL.on, never in production), admins are eligible, so the owner can enter.
export const CHALLENGE_LISTS = { admins: REHEARSAL.on ? ([] as readonly number[]) : ADMINS, invited: IMAGES.invited, min: CHALLENGE.neynarMinScore } as const;
