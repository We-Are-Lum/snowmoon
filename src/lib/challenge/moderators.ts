import { MODERATOR_FIDS } from '../config';

/** Moderators (and admins, who are moderators) may remove a listed post, on the writer's request or for the Terms. They can only remove. */
export const isModerator = (person: number) => person > 0 && MODERATOR_FIDS.includes(person);
