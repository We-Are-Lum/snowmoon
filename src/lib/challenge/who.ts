import { ADMINS, CHALLENGE, IMAGES } from '../config';

/**
 * Who the remix challenge's eligibility reads: admins (never eligible for rewards; owner, 2026-10-31), the invited
 * list, and the challenge's own Neynar threshold (CHALLENGE.neynarMinScore, fixed for the whole challenge; owner,
 * 2026-11-01). Only read here; nothing in this file orders, publishes or hides anything (P5b).
 */
export const CHALLENGE_LISTS = { admins: ADMINS, invited: IMAGES.invited, min: CHALLENGE.neynarMinScore } as const;
