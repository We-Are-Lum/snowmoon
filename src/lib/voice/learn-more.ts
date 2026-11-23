import { LEARN_MORE, type LearnMoreText, type Segment } from '../challenge/learn-more';

/**
 * "Learn more about Lord Ephelion" on the Ephelion challenge (/storyboard/record; Nate, 2026-11-22): the remix
 * challenge's expander with his approved texts, LEARN_MORE.ephelion, the same as /challenge/ephelion. Its "Room to
 * invent" item "Where he speaks from" was drafted by the coding agent (Claude, a closed model by Anthropic) and approved
 * by Nate on 2026-11-23 with one change ("the book places him in Northglade, …"); it now lives in LEARN_MORE.ephelion
 * itself, second, after his face, so both pages show it.
 */
export const EPHELION_LEARN_MORE: LearnMoreText = LEARN_MORE.ephelion;

/** The approved "Where he speaks from" item, as it stands in LEARN_MORE.ephelion. */
export const WHERE_HE_SPEAKS_FROM: Segment[] = LEARN_MORE.ephelion.invent[1];
