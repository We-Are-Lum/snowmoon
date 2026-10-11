/**
 * The craft guide (docs/craft/visual-storytelling.md), filtered to how far someone has read
 * (owner, 2026-10-11: "tag each example with its chapter, and have code drop any example beyond
 * the person's chapter limit from what the coach sees, the same as the world guide").
 *
 * Every book example is one list item under "**In the book.**", tagged with the latest chapter it
 * depends on: "- [ch 7] … (c7-b124)". craftUpTo(md, limit) removes the items past the limit; a
 * principle left with none gets "- No example from the book up to your chapter." craftProblems(md)
 * lists what is wrong: an untagged example, a tag that is not the latest chapter its block ids
 * cite, an example with no block id, or a block id anywhere outside a tagged example (which the
 * filter could not catch).
 */
const EXAMPLE = /^- \[ch (\d+)\] (.*)$/;
const NONE = '- No example from the book up to your chapter.';
const chapterOf = (id: string) => Number(id.slice(1).split('-')[0]);

export function craftUpTo(md: string, limit: number): string {
  const out: string[] = [];
  let inExamples = false;
  let kept = 0;
  for (const line of md.split('\n')) {
    if (line.startsWith('**In the book.**')) {
      inExamples = true;
      kept = 0;
      out.push(line);
      continue;
    }
    if (inExamples) {
      const m = line.match(EXAMPLE);
      if (m) {
        if (Number(m[1]) <= limit) {
          out.push(line);
          kept++;
        }
        continue;
      }
      if (kept === 0) out.push(NONE);
      inExamples = false;
    }
    out.push(line);
  }
  return out.join('\n');
}

export function craftProblems(md: string): string[] {
  const found: string[] = [];
  let inExamples = false;
  md.split('\n').forEach((line, i) => {
    const where = `line ${i + 1}`;
    if (line.startsWith('**In the book.**')) {
      inExamples = true;
      if (line.trim() !== '**In the book.**') found.push(`${where}: put each example on its own tagged line under "**In the book.**"`);
      return;
    }
    const m = line.match(EXAMPLE);
    if (inExamples && m) {
      const ids = m[2].match(/c\d+-b\d+/g) ?? [];
      if (!ids.length) found.push(`${where}: example cites no block id`);
      else if (Math.max(...ids.map(chapterOf)) !== Number(m[1])) found.push(`${where}: tagged ch ${m[1]}, but its latest block is chapter ${Math.max(...ids.map(chapterOf))}`);
      return;
    }
    if (inExamples && line.startsWith('- ')) found.push(`${where}: example without a [ch N] tag`);
    if (inExamples && !line.startsWith('- ')) inExamples = false;
    if (!inExamples && /c\d+-b\d+/.test(line)) found.push(`${where}: block id outside a tagged example, which the chapter filter cannot drop`);
  });
  return found;
}
