/**
 * Compare runs of the 50-question check (the Claude trial, 2026-10-23). Free: reads run files only.
 *
 *   npx tsx scripts/eval-chat-compare.ts table RUN.json…           the measured columns, and the graded ones once grades exist
 *   npx tsx scripts/eval-chat-compare.ts pack DIR RUN.json…         a blind grading pack: each question's answers under
 *                                                                   shuffled labels (DIR/pack.json), the key apart (DIR/key.json)
 *
 * Measured from the run files: retrieval hits (an answering block among the passages sent), answers shown,
 * "the passages don't say" (support check), guard blocks (first answer flagged; declined after the retry),
 * and cost per question. Graded by hand, blind (the grader sees labels, not models): claims supported by a
 * cited block, and wrong answers. Graders write DIR/grades-<name>.json:
 *   { "grader": "...", "items": [{ "id": "f01", "label": "K", "claims": 3, "supported": 3,
 *     "unsupported_but_true": 0, "unsupported": 0, "correct": "yes|partly|cant|no|wrong", "note": "" }] }
 * The same rubric as grades.json; "wrong" means it states something false about the book.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface Row { id: string; question: string; gold: string[]; answer_fact?: string; passages_sent?: string[]; passages?: string[]; state: string; regenerated?: boolean; answer_as_shown?: string; quoted?: string[]; cost_usd?: number }
interface Run { file: string; name: string; spend: number; rows: Row[] }
interface Grade { id: string; label: string; claims: number; supported: number; unsupported_but_true: number; unsupported: number; correct: string }

const [cmd, ...args] = process.argv.slice(2);

function load(file: string): Run {
  const j = JSON.parse(readFileSync(file, 'utf8')) as { answer_model?: string; spend_usd?: number; results: Row[] };
  return { file, name: `${j.answer_model ?? 'openai/gpt-oss-120b'} (${path.basename(file)})`, spend: j.spend_usd ?? 0, rows: j.results };
}

/** A fixed shuffle per question, so a pack can be rebuilt identically. */
function shuffle<T>(xs: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

if (cmd === 'pack') {
  const [dir, ...files] = args;
  const runs = files.map(load);
  const letters = 'KMPRTVWXYZ';
  const pack: unknown[] = [];
  const key: Record<string, Record<string, string>> = {};
  for (const r0 of runs[0].rows) {
    const order = shuffle(runs.map((_, i) => i), r0.id);
    key[r0.id] = {};
    pack.push({
      id: r0.id, question: r0.question, gold: r0.gold, answer_fact: r0.answer_fact,
      answers: order.map((ri, k) => {
        key[r0.id][letters[k]] = runs[ri].file;
        const row = runs[ri].rows.find((x) => x.id === r0.id);
        const shown = row?.state === 'answer' ? row.answer_as_shown : row ? `(not shown: ${row.state === 'unsupported' ? "the passages don't say" : row.state})` : '(not asked)';
        return { label: letters[k], answer: shown, cited: row?.quoted ?? [] };
      }),
    });
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(pack, null, 1) + '\n');
  writeFileSync(path.join(dir, 'key.json'), JSON.stringify(key, null, 1) + '\n');
  console.log(`${pack.length} questions × ${runs.length} answers → ${dir}/pack.json (key apart in key.json)`);
} else if (cmd === 'table') {
  const files = args.filter((a) => a.endsWith('.json'));
  const runs = files.map(load);
  const gradeDir = process.env.GRADES;
  const key: Record<string, Record<string, string>> = gradeDir && existsSync(path.join(gradeDir, 'key.json')) ? JSON.parse(readFileSync(path.join(gradeDir, 'key.json'), 'utf8')) : {};
  const graders = gradeDir ? readdirSync(gradeDir).filter((f) => /^grades-.+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(gradeDir, f), 'utf8')) as { grader: string; items: Grade[] }) : [];
  const lines = ['| Run | Answering block sent | Shown | "Passages don\'t say" | Guard: first flagged | Guard: declined | Cost / question |', '|---|---|---|---|---|---|---|'];
  for (const r of runs) {
    const n = r.rows.length;
    const hit = r.rows.filter((x) => x.gold.some((g) => (x.passages_sent ?? x.passages ?? []).includes(g))).length;
    const c = (s: string) => r.rows.filter((x) => x.state === s).length;
    const flagged = r.rows.filter((x) => x.regenerated || x.state === 'declined').length;
    const perQ = r.rows.some((x) => typeof x.cost_usd === 'number') ? r.rows.reduce((t, x) => t + (x.cost_usd ?? 0), 0) / n : r.spend / n;
    lines.push(`| ${r.name} | ${hit} / ${n} | ${c('answer')} | ${c('unsupported')} | ${flagged} | ${c('declined')} | $${perQ.toFixed(5)} |`);
  }
  console.log(lines.join('\n'));
  for (const g of graders) {
    const out = ['', `Grader ${g.grader}:`, '| Run | Claims | Supported | True, not in cited block | Not supported | Wrong answers | Partly | Can\'t |', '|---|---|---|---|---|---|---|---|'];
    for (const r of runs) {
      const mine = g.items.filter((it) => key[it.id]?.[it.label] === r.file);
      const s = (f: (x: Grade) => number) => mine.reduce((t, x) => t + f(x), 0);
      const claims = s((x) => x.claims);
      const pct = (v: number) => (claims ? ` (${Math.round((100 * v) / claims)}%)` : '');
      out.push(`| ${r.name} | ${claims} | ${s((x) => x.supported)}${pct(s((x) => x.supported))} | ${s((x) => x.unsupported_but_true)} | ${s((x) => x.unsupported)}${pct(s((x) => x.unsupported))} | ${mine.filter((x) => x.correct === 'wrong').length} | ${mine.filter((x) => x.correct === 'partly').length} | ${mine.filter((x) => x.correct === 'cant').length} |`);
    }
    console.log(out.join('\n'));
  }
} else {
  console.log('usage: eval-chat-compare.ts table RUN.json… | pack DIR RUN.json…');
  process.exit(1);
}
