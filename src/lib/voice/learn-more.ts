import type { LearnMoreText } from '../challenge/learn-more';

/**
 * "Learn more about Lord Ephelion" on the Ephelion challenge (/storyboard/record; Nate, 2026-11-22): the same expander and
 * parts as the remix challenge's characters (src/lib/challenge/learn-more.ts: who, start, later, drives, room to invent,
 * with citations and glossary terms). Kept apart from LEARN_MORE so the assistant's notes and the /challenge pages don't
 * take it up (they link /challenge/<slug>, which Ephelion doesn't have).
 *
 * Drafted by the coding agent (Claude, a closed model by Anthropic) on 2026-11-22, from the book's blocks cited in it;
 * approved: false until Nate approves it, so it shows "Draft wording". Every quotation is the book's, word for word
 * (scripts/test-voice.ts checks each against its block).
 */
export const EPHELION_LEARN_MORE: LearnMoreText = {
  name: 'Lord Ephelion',
  pronoun: 'he',
  author: 'coding agent (Claude, a closed model by Anthropic), draft of 2026-11-22',
  approved: false,
  who: [
    { text: 'Lord Ephelion is the ' },
    { term: 'Arctic Empire', glossaryId: 'arctic-empire' },
    { text: '’s consul to ' },
    { term: 'Veridia', glossaryId: 'veridia' },
    { text: ': his messages are signed “Lord Ephelion”, then “Arctic Empire consul to Veridia.” ' },
    { cite: 'c3-b5' },
    { text: ' The header of a live debate calls him “Arctic ambassador to Veridia” ' },
    { cite: 'c8-b17' },
    { text: '. In the book, Veridians never meet him: they meet his messages.' },
  ],
  start: [
    { text: 'Walking through a tunnel, Gladias finds one of his messages pasted on the wall, a poster that ends “Build the future.” ' },
    { cite: 'c3-b4' },
    { cite: 'c3-b5' },
    { text: ' He thinks: “Yay, more Arctic propaganda” ' },
    { cite: 'c3-b6' },
    { text: '. Later, on an ' },
    { term: 'autobus', glossaryId: 'autobus' },
    { text: ', Gladias listens to him debate Professor ' },
    { term: 'Sylka', glossaryId: 'sylka' },
    { text: ', president of ' },
    { term: 'VNU', glossaryId: 'vnu' },
    { text: '. Ephelion argues that the “softer” traits of a society move in cycles, while economic growth keeps compounding ' },
    { cite: 'c8-b26–b35' },
    { text: '. Gladias concludes: “A gifted demagogue” ' },
    { cite: 'c8-b37' },
    { text: '.' },
  ],
  later: [
    { text: 'His speech “The Dead Hand of Egalitarianism, and the Path of Strength” cuts into a ' },
    { term: 'Helisport', glossaryId: 'helisport' },
    { text: ' game on a restaurant screen while Gladias’s family eats; Seila tries to unplug the screen, and Lily stares at the message ' },
    { cite: 'c13-b62–b66' },
    { text: '. When the Arctics take ' },
    { term: 'Northshore', glossaryId: 'northshore' },
    { text: ', a report says he was in ' },
    { term: 'Northglade', glossaryId: 'northglade' },
    { text: ' at the time ' },
    { cite: 'c20-b8' },
    { text: '. Gladias learns that Lily had been in a chat group “Cheering on Lord Ephelion’s messages” ' },
    { cite: 'c23-b84' },
    { text: ', and that his sermons made her feel valued ' },
    { cite: 'c24-b40' },
    { text: '.' },
  ],
  drives: [
    { text: 'As Seila puts it, “Ephelion’s goal is to inspire people inside Veridia to join the Arctic cause.” ' },
    { cite: 'c21-b76' },
    { text: ' She calls him and Delwart “not intellectuals, they are propagandists” ' },
    { cite: 'c21-b75' },
    { text: '. His messages praise strength and winning: “you are good because you can win.” ' },
    { cite: 'c13-b64' },
  ],
  invent: [
    [
      { text: 'His looks: the book never describes them. It shows only “An image of Lord Ephelion” on a screen ' },
      { cite: 'c13-b63' },
      { text: '. Every picture’s look of him is this edition’s.' },
    ],
    [
      { text: 'Where he speaks from: the book never says. His messages reach Veridians as a poster ' },
      { cite: 'c3-b4' },
      { text: ', a live debate on a hand device ' },
      { cite: 'c8-b17' },
      { text: ' and a broadcast on a restaurant screen ' },
      { cite: 'c13-b62' },
      { text: '; the one place the book puts him is Northglade, on the day of the invasion ' },
      { cite: 'c20-b8' },
      { text: '.' },
    ],
    [{ text: 'His voice: the book gives his words, not how he sounds. Every voice here is this edition’s.' }],
  ],
};

/**
 * The quotations in EPHELION_LEARN_MORE, each with the block it must appear in word for word (the test checks them; the
 * book's straight apostrophes compare equal to the text's curly ones).
 */
export const EPHELION_QUOTES: readonly { quote: string; block: string }[] = [
  { quote: 'Arctic Empire consul to Veridia.', block: 'c3-b5' },
  { quote: 'Arctic ambassador to Veridia', block: 'c8-b17' },
  { quote: 'Build the future.', block: 'c3-b5' },
  { quote: 'Yay, more Arctic propaganda', block: 'c3-b6' },
  { quote: 'A gifted demagogue', block: 'c8-b37' },
  { quote: 'The Dead Hand of Egalitarianism, and the Path of Strength', block: 'c13-b64' },
  { quote: 'Cheering on Lord Ephelion’s messages', block: 'c23-b84' },
  { quote: 'Ephelion’s goal is to inspire people inside Veridia to join the Arctic cause.', block: 'c21-b76' },
  { quote: 'not intellectuals, they are propagandists', block: 'c21-b75' },
  { quote: 'you are good because you can win.', block: 'c13-b64' },
  { quote: 'An image of Lord Ephelion', block: 'c13-b63' },
];
