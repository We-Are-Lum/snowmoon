import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GLOSSARY_WRITTEN, WORK } from './config';

/**
 * The glossary's model-written explanations (owner, 2026-10-23), for the owner only until the owner says otherwise
 * (GLOSSARY_WRITTEN). Data: content/snowmoon/glossary-explanations.json, written by scripts/glossary-explain.ts
 * and checked by npm run test:glossary-explanations (rules in scripts/lib/glossary-explain.ts). Each sentence has
 * a gate, the chapter of its latest citation; a reader sees it only once they have reached that chapter, and the
 * server never sends a sentence past the chapter it is asked for.
 *
 * The bake-off (private/glossary-bakeoff/, git-ignored) is read here too, by label only; never its key file (which
 * label is which model).
 */
export interface WrittenSentence {
  text: string;
  cites: string[];
  gate: number;
}
interface FileShape {
  assist: { model: string; maker: string; open_weights: boolean; date: string; prompt_file: string };
  entries: { slug: string; term: string; sentences: (WrittenSentence & { quotes: unknown[] })[] }[];
}
export interface WrittenView {
  /** "Written by <model> from the book. Check the cited lines." */
  label: string;
  model: string;
  maker: string;
  openWeights: boolean;
  date: string;
  promptFile: string;
  sentences: WrittenSentence[];
  /** Sentences that rest on a chapter past `through`. */
  hidden: number;
}

/**
 * The committed file once the owner has read and published it; before that, the draft in private/ (git-ignored:
 * present only on the machine that ran the job, so only a server run there can show it).
 */
const FILE = path.join(process.cwd(), 'content', WORK.id, 'glossary-explanations.json');
const DRAFT = path.join(process.cwd(), 'private', 'glossary-explanations', 'glossary-explanations.json');
const BAKEOFF = path.join(process.cwd(), 'private', 'glossary-bakeoff', 'explanations.json');
const SUPPORT = path.join(process.cwd(), 'private', 'glossary-bakeoff', 'support.json');

export const mayRead = (fid: number | null) => fid !== null && (GLOSSARY_WRITTEN.public || GLOSSARY_WRITTEN.fids.includes(fid));
/** The bake-off stays with the listed FIDs even if the explanations go public. */
export const mayReadBakeoff = (fid: number | null) => fid !== null && GLOSSARY_WRITTEN.fids.includes(fid);

/** "anthropic/claude-opus-5.5" -> "Claude Opus 5.5": the gateway's catalogue name when we know it, else the id. */
const NAMES: Record<string, string> = {
  'anthropic/claude-opus-5.5': 'Claude Opus 5.5',
  'deepseek/deepseek-v4-pro-0813': 'DeepSeek V4 Pro 0813',
  'moonshotai/kimi-k3.1-pro': 'Kimi K3.1 Pro',
};
/**
 * The owner's label (2026-10-23), with the model named as principle 2 asks of a closed model: its maker, and
 * whether its weights are open (the date is shown beside it).
 */
export const writtenLabel = (model: string, maker: string, openWeights: boolean) =>
  `Written by ${NAMES[model] ?? model} (${maker}, ${openWeights ? 'open-weight' : 'closed'} model) from the book. Check the cited lines.`;

let cache: FileShape | null | undefined;
function file(): FileShape | null {
  if (cache === undefined) {
    const at = existsSync(FILE) ? FILE : existsSync(DRAFT) ? DRAFT : null;
    cache = at ? (JSON.parse(readFileSync(at, 'utf8')) as FileShape) : null;
  }
  return cache;
}

export function writtenFor(slug: string, through: number): WrittenView | null {
  const f = file();
  const e = f?.entries.find((x) => x.slug === slug);
  if (!f || !e || !e.sentences.length) return null;
  const upTo = Math.max(1, Math.min(WORK.chapters, Math.floor(through) || 1));
  const shown = e.sentences.filter((s) => s.gate <= upTo).map((s) => ({ text: s.text, cites: s.cites, gate: s.gate }));
  return {
    label: writtenLabel(f.assist.model, f.assist.maker, f.assist.open_weights),
    model: f.assist.model,
    maker: f.assist.maker,
    openWeights: f.assist.open_weights,
    date: f.assist.date,
    promptFile: f.assist.prompt_file,
    sentences: shown,
    hidden: e.sentences.length - shown.length,
  };
}

export interface BakeoffView {
  date: string;
  promptFile: string;
  slugs: string[];
  /** A, B, C: each entry's sentences, and the program's problems (citations, quotes, gates). */
  labels: Record<string, { entries: { slug: string; term: string; sentences: WrittenSentence[] }[]; problems: string[] }>;
  /** The support check, when it has run: the checker, and per label the counts and each sentence's verdict. */
  support: {
    checker: { model: string; maker: string; date: string; prompt_file: string };
    counts: Record<string, { sentences: number; unsupported: number; by_program: number }>;
    results: Record<string, Record<string, { n: number; supported: boolean; why: string; by: string }[]>>;
  } | null;
}

/** The blind bake-off, labels only (never reads the key). Null until it has run. */
export function bakeoff(): BakeoffView | null {
  if (!existsSync(BAKEOFF)) return null;
  const b = JSON.parse(readFileSync(BAKEOFF, 'utf8'));
  const s = existsSync(SUPPORT) ? JSON.parse(readFileSync(SUPPORT, 'utf8')) : null;
  return {
    date: b.date,
    promptFile: b.prompt_file,
    slugs: b.slugs,
    labels: b.labels,
    support: s ? { checker: s.checker, counts: s.counts, results: s.results } : null,
  };
}
