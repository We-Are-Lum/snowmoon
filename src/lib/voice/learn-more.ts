import { LEARN_MORE, type LearnMoreText, type Segment } from '../challenge/learn-more';

/**
 * "Learn more about Lord Ephelion" on the Ephelion challenge (/storyboard/record; Nate, 2026-11-22): the remix
 * challenge's expander with his own approved texts (LEARN_MORE.ephelion, the same as /challenge/ephelion), plus one item
 * for "Room to invent" Nate asked for: what the book gives about where he speaks from. That item is a draft by the
 * coding agent (Claude, a closed model by Anthropic), so the whole text shows "Draft wording" (approved: false) until Nate
 * approves it; it then goes into LEARN_MORE.ephelion itself, for both pages, and this file uses that.
 */
export const WHERE_HE_SPEAKS_FROM: Segment[] = [
  { text: 'Where he speaks from: the book never says. His messages reach Veridians as a poster in a tunnel ' },
  { cite: 'c3-b3–b4' },
  { text: ', a live debate on a hand device ' },
  { cite: 'c8-b17' },
  { text: ' and a broadcast on a restaurant screen ' },
  { cite: 'c13-b62' },
  { text: '; the one place the book puts him is Northglade, in the province of Northshore, at the time of the Arctic invasion ' },
  { cite: 'c20-b8' },
  { text: '.' },
];

const approved = LEARN_MORE.ephelion;
export const EPHELION_LEARN_MORE: LearnMoreText = {
  ...approved,
  author: `${approved.author}; "Where he speaks from" drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-22`,
  approved: false,
  // After his face (the first item), before his life in the Arctic Empire.
  invent: [approved.invent[0], WHERE_HE_SPEAKS_FROM, ...approved.invent.slice(1)],
};
