import { CHALLENGE } from '../config';
import { isAdmin } from '../admins';

/**
 * Who may see the remix challenge (owner, 2026-11-04: "/challenge is admin-only for now"): everyone once the owner opens
 * it (CHALLENGE.public), admins (ADMINS) before. Pages and the challenge APIs answer "not found" to everyone else.
 * Seeing it, and marking to test it, is all it grants: an admin's version is never an entry (admins aren't eligible),
 * and nothing here orders, publishes or hides anything (P5b).
 */
export const challengeVisibleTo = (person: number | null | undefined, pub: boolean = CHALLENGE.public) => pub || isAdmin(person);
