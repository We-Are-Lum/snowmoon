import { EPISODE } from '../../config';
import { isAdmin } from '../../admins';

/**
 * Who may see Episode 1 (owner, 2026-11-24: "off until then, with its own switch"): everyone once the owner turns
 * EPISODE.public on, admins before. Its pages and APIs answer "not found" to everyone else. Seeing it is all this
 * grants: Submit also needs the window (src/lib/challenge/episode/rules.ts submissionsOpen).
 */
export const episodeVisibleTo = (person: number | null | undefined, pub: boolean = EPISODE.public) => pub || isAdmin(person);
