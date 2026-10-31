import { ADMINS, IMAGES } from '../config';

/**
 * Who the remix challenge's eligibility reads: admins (never eligible for rewards; owner, 2026-10-31), the invited
 * list, and the Neynar threshold. Only read here; nothing in this file orders, publishes or hides anything (P5b).
 */
export const CHALLENGE_LISTS = { admins: ADMINS, invited: IMAGES.invited, min: IMAGES.neynarMinScore } as const;
