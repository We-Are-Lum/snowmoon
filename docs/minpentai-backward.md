# Minpentai: where the book runs the rules backward

Every block in the book that says or shows Minpentai's rules running backward, quoted in full. Blocks that run something else backward follow at the end, kept apart. Source: the committed chapter text in `content/snowmoon/text/`. Block IDs are `c<chapter>-b<idx>`. Found by searching every chapter for "revers", "backward", "inverse", "invert", "undo", "rewind" and "step back", then reading the surrounding blocks.

> **Spoilers** for chapters 2–27.

## The answer

**No block shows time reversed on a live match board.** Every match the book narrates runs forward, turn by turn:
- the quarter-final (c4-b105–c4-b140);
- the hex-grid qualifier (c12-b181–c12-b196);
- the final against Bai (c7-b81–c7-b117);
- the semi-final against Gun (c14-b44–c14-b87).

Players change a match only by putting down squares on intervention turns (c4-b110).

The rules are reversed in two places only:
- **In discussion.** Zei tells Fin the rules are time-reversible, so no wall is invincible (c4-b9, c4-b13). Zei also thinks about a rule change during a semi-final's setup, before the battle starts (c14-b35).
- **In a sandbox.** In chapter 12, during the twenty minutes of setup before a live qualifying match, Zei plays a glider and a symbol backward in his private sandbox. He uses the sandbox's controls to step forward and to shift time back (c12-b163–c12-b177). The match board itself has not started. The countdown runs through the whole passage (c12-b151, c12-b155, c12-b158, c12-b168, c12-b178), and the battle begins after it (c12-b180).

**What the book does not say:** no block states that time *cannot* run backward in a match. "In a match, time only moves forward" is our reading of how every match is told, not a quoted rule.

The figure c4-b5 is a replay of a past game on Zei's hand device (c4-b4, c4-b7). It animates forward, `t=0` to `t=119`. The rule recovered from it happens to run backward exactly (`docs/minpentai-rules.md`, section 3.1), but the figure itself never plays in reverse.

## 1. Says the rules run backward (discussion)

Zei, explaining to Fin over the c4-b5 replay:

- **c4-b9:** "Well, remember, the rules are time-reversible. So any wall that can be created in some way can be destroyed in some way."
- **c4-b13:** "Turns out they weren't dumb, we are. Because the laws of physics are time-reversible, nothing can be invincible. Anything that can be created can be destroyed. You just have to take the path that creates it and do the same thing in reverse. So a shield that can't be destroyed is not something that can be created. There has to be a weakness somewhere - it's just a matter of how well you hide it."

Zei's thought on hearing a rule change at the start of the semi-final, before the battle begins. It is about the shrines, a one-match rule:

- **c14-b35:** Zei immediately understood the meaning of the new rules. The shrines are the only objects that violate mass conservation - though even still, with these new rules, nothing decreases entropy. XOR is not weight-preserving, but it is reversible. So the game board would get more and more full, and more and more messy, over time. The reduced resource allocation meant that the intervention turns were not for building - they were for *steering*.

## 2. Shows the rules run backward (Zei's sandbox, before a live match)

The setting: a qualifying match is about to start on a hex grid. Players get twenty minutes to work out their structures (c12-b147–c12-b151). Zei is working in his sandbox (c12-b152). The quoted line at c12-b162 is from the cryptography textbook he had been reading that day (c12-b48–c12-b55).

- **c12-b162:** *The core building block maps inputs to outputs one-to-one. And not only that, it can be efficiently run both forwards and backwards.*
- **c12-b163:** But unlike the hash function, here there was no truncate-and-xor wrapper at the end. And so if he knew his desired end state ... he just had to put that end state into the sandbox, and play it backwards.
- **c12-b164:** But ... how do you play it backwards?
- **c12-b165:** In the internal permutation of a hash function, you walk backwards from the last layer to the first layer, and invert each step as you go.
- **c12-b166:** Here ... what was the inverse of the hexgrid rules that Zei was interacting with for the first time in his life?
- **c12-b167:** Zei took the gliders he saw, and tried the most basic transformations: flipping them, rotating them 60 degrees, launching them one timestep later. None worked.
- **c12-b169:** Zei stepped through each step more slowly. And then he saw it. During each step, the game board split up into triangles, and the hexagons rotated inside each triangle - clockwise if it had one hex filled, counterclockwise if it had two hexes filled.
- **c12-b170:** And so in order to time reverse, he just had to ... let each time step happen twice. The opposite of a 120-degree rotation is, after all, two 120-degree rotations. But there was a problem: after each time step, the split into triangles shifted. So to play a time step backward, he had to... play one step forward, then shift time back one step so that he could play the next step forward under the same tiling, then play a second step forward to bring the total rotation under that tiling to 240 degrees within each triangle, then shift time back *two* steps so that the game would shift to the *previous* tiling. Invert each step, and play the steps in reverse order, just like inverting a permutation in a hash.
- **c12-b171:** He confirmed: there was a button to play one step forward, and two buttons to shift time - either forward or backward. So that's what he would have to do. A, B, A, B, B. Like some kind of video game cheat code. Which, in some sense, here it literally was.
- **c12-b173:** He put a glider into the sandbox, and tried it. It was an arduous process, and his fingers quickly tired. But it worked. The glider moved backwards.
- **c12-b176:** The first time, it failed: as time went backwards, the glider and the symbol crashed, but then the same symbol re-formed a few steps away, and the glider flew away. So in that particular history that Zei had just sampled, before the crash, the symbol had been there all along.
- **c12-b177:** He tried again, with a different glider. This time, it succeeded. As time moved backwards, past the moment of the crash, the rock-formation-plus-symbol turned into a bare rock formation, and two gliders flew back out.

## 3. Related, but not Minpentai's rules

These blocks run something other than the game's rules backward. They are listed so nothing is missed. None is about a match.

**Physics, in the chapter 2 thermodynamics lecture:**

- **c2-b83:** "Let's prove by contradiction. Suppose we did have a magic procedure that could go in reverse: start with the merged jars with eleven point four million digits of unknown, and bring us to the separate jars with eight million digits of unknown."
- **c2-b87:** "I remember the laws of physics of our universe are fully time-reversible, right? So if you can do something in one direction, you can always run the same steps in reverse."
- **c2-b88:** "Exactly. Now why does that time reversibility, at that level of atom-by-atom physics, imply that temperature equalization is something you cannot reverse? Isn't that a paradox?"
- **c2-b90:** "Like, imagine you had a file with eleven point four million digits of data. You would make a really perfect double-jar, and have a gun that shoots out the gas molecules with exactly the right velocities. Then, you would use your process to un-mix the gas, then split the jar, and measure the velocities at the end. You would get eight million digits out."
- **c2-b91:** "And because our universe's physics is time-reversible, you would be able to do the same thing in reverse: take those eight million digits, put them into the gun to shoot out gas molecules at the right velocities, apply the exact same un-mixing procedure backwards, measure it, and you would get out whatever your original eleven point four million digits were. The output of the time-reversed process has to equal the input of the original process. And so we get a fully general-purpose way to represent any eleven point four million digits inside of eight million digits. And if we could do that, we could do it again and again, and represent the whole planet in eight million digits, or even make it smaller and do it in eight digits. And that's impossible!"
- **c2-b92:** "Exactly. Or in other words, you can't go from not knowing more things to not knowing fewer things in a universe with time-reversible physics. In a universe with time-irreversible physics, you *could*, because you can just destroy all the things you don't know."
- **c2-b94:** "But in a universe with time-reversible physics, there's always things you don't know, and that lack of knowledge can only be shuffled around, and inevitably increased. The best we can do, is go from not knowing things we care about, to not knowing things we don't care about. Like going from not understanding thermodynamics, to not knowing the velocities of the molecules that are coming out of the projector showing these slides as waste heat."

**A hash function's core, in the textbook Zei reads in chapter 12:**

- **c12-b55:** The core building block maps inputs to outputs one-to-one. And not only that, it can be *efficiently* run both forwards and backwards. The shrinking, and the irreversibility, comes from a simple layer on top: a deletion, and an xor of part of the original input, added to the end.
- **c12-b56:** Why do this? Why build irreversibility on top of reversibility? The reason is subtle. If you build irreversibility directly, then you cannot control when entropy is destroyed. If you apply an irreversible round function enough times, then about half the entropy collapses, bringing the protocol's security down along with it. And so even when destroying information is your final goal, it's best to cleanly separate out the piece that's going that - destroy information in one precise spot in the algorithm, on your own terms.

**A different game (the circle game, chapter 25), and a metaphor about the world (chapter 27):**

- **c25-b72:** "The game is a tower of different kinds of rules", Zei continued. "At the bottom, the game is irreversible: you always have to take at least one circle away in each move. At a level higher than that, there's the XOR sum, and that is reversible. Whatever change you make, I can always set it back. But at a level even higher than *that*, the fact that it's your turn when the XOR sum is in balance is the irreversible thing. Once you let the game slip into that state, if the other player knows the trick, there is no way to get back out."
- **c27-b91:** "The world that I am seeing is a fragile world. It did not use to be this fragile. In the past, communication was limited and transmission of authority was limited. Any empire united for long enough would eventually fall. The world was reversible. But today, with our modern robots and modern surveillance, if *anyone* manages to take over and consolidate control across the whole world, they could lock their power in. Irreversibly. Forever."
- **c27-b94:** "Eventually, the world will become reversible again. We will be able to travel between the stars, and our civilization will become too big to completely control or completely destroy. But until that happens, we are in a fragile place, and if within the next decade it all gets multiplied by zero forever, the Arctics will be the reason why it happens."

## What this means for the tutorial

The tutorial's fourth screen used to say "Time runs both ways" and "Every move can be undone". That reads as if a player could undo moves in a match, and no block shows that.

It now says, in model-drafted wording:

> **Running the rules backward.** The rules can be run in reverse, so the sandbox lets you step back to turn 0 and see where this pattern came from. In a match, time only moves forward.

- The first sentence rests on c4-b9 and c12-b163–c12-b177.
- The second is our reading of the matches above.
- The screen carries its own model-drafted flag in `src/lib/minpentai/tutorial-text.ts`. It shows "Draft wording" even after the file-wide flag is turned off.

`docs/minpentai-tutorial-design-prompt.md` still has the old line ("Time runs both ways. Every move can be undone."). It is the brief as it was given, so it is left as written.
