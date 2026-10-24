import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * The question's embedding, made on our own server (owner, 2026-10-24: "The question's embedding must run on
 * our own server, with no new provider"). bge-small-en-v1.5 (BAAI, MIT; the ONNX int8 export by Xenova) runs
 * in this server function through Transformers.js and onnxruntime-node. No embedding service is called.
 *
 * The model files are served from media.snowmoon.party (our R2 bucket, already named on the Privacy page as
 * Cloudflare), never from Hugging Face, and each is fixed by its sha256: a file that doesn't match is not used.
 * They are fetched once per server instance into the instance's temporary disk. Uploaded by
 * scripts/publish-chat-embed.ts. For local runs and tests, CHAT_EMBED_DIR names a folder that holds them.
 *
 * The book's blocks are embedded once, on the coding agent's machine, with this same code
 * (scripts/embed-blocks.ts), and stored in studio.block_vectors (pgvector).
 */
export interface ModelFile {
  /** Path inside the model folder, as Transformers.js expects it. */
  name: string;
  sha256: string;
  bytes: number;
}

/** Under media.snowmoon.party/models/: the first 12 hex of the sha256 of the files' sorted `sha256  name` lines. */
const PREFIX = 'bge-small-en-v1.5-q8/2c93ef54aaf3';

export const EMBED = {
  name: 'bge-small-en-v1.5 (ONNX, int8)',
  source: 'Xenova/bge-small-en-v1.5@ea104dacec62c0de699686887e3f920caeb4f3e3 (from BAAI/bge-small-en-v1.5@5c38ec7c405ec4b44b94cc5a9bb96e735b38267a, license: mit)',
  /** What studio.block_vectors.model records: the model, its weights, and the 2-block window. */
  id: 'bge-small-en-v1.5-q8-w2',
  dimensions: 384,
  /** Each block is embedded with the two readable blocks before it (names and scene for a line of dialogue). */
  window: 2,
  /** bge's instruction for search queries; blocks are embedded without it. */
  queryPrefix: 'Represent this sentence for searching relevant passages: ',
  mediaBase: 'https://media.snowmoon.party/models',
  prefix: PREFIX,
  files: [
    { name: 'config.json', sha256: 'fa73f90bf92c8cace1fbcb709626306f2bdbc9ea3e5b5f94b440df9b6aa56350', bytes: 683 },
    { name: 'onnx/model_quantized.onnx', sha256: '6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4', bytes: 34014426 },
    { name: 'special_tokens_map.json', sha256: 'b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3', bytes: 125 },
    { name: 'tokenizer.json', sha256: 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66', bytes: 711396 },
    { name: 'tokenizer_config.json', sha256: '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3', bytes: 366 },
  ] as ModelFile[],
} as const;

/** The folder name Transformers.js looks up under its local model path. */
const MODEL_ID = 'bge-small-en-v1.5';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Make sure every listed file is in `dir/MODEL_ID/` with its sha256; fetch missing ones from our media. */
async function ensureFiles(dir: string, fetchMissing: boolean): Promise<void> {
  for (const f of EMBED.files) {
    const local = path.join(dir, MODEL_ID, f.name);
    if (existsSync(local)) {
      if (sha256(await readFile(local)) === f.sha256) continue;
      if (!fetchMissing) throw new Error(`${local}: sha256 is not ${f.sha256}`);
    }
    if (!fetchMissing) throw new Error(`${local} is missing`);
    const url = `${EMBED.mediaBase}/${EMBED.prefix}/${f.name}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`embedding model: ${url} answered ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (sha256(body) !== f.sha256 || body.length !== f.bytes) throw new Error(`embedding model: ${url} does not match its listed sha256`);
    await mkdir(path.dirname(local), { recursive: true });
    await writeFile(`${local}.part`, body);
    await rename(`${local}.part`, local);
  }
}

type Extractor = (texts: string[], opts: { pooling: 'cls'; normalize: boolean }) => Promise<{ tolist(): number[][] }>;
let loading: Promise<Extractor> | null = null;

/** The model, loaded once per server instance. */
function model(): Promise<Extractor> {
  loading ??= (async () => {
    const local = process.env.CHAT_EMBED_DIR;
    const dir = local ?? path.join(os.tmpdir(), 'snowmoon-models', EMBED.prefix);
    await ensureFiles(dir, !local);
    const { env, pipeline } = await import('@huggingface/transformers');
    // Only the files above: never Hugging Face, never a remote fetch by the library itself.
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = dir;
    env.useFSCache = false;
    return (await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' })) as unknown as Extractor;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Unit vectors (CLS pooling, normalized), one per text. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const extract = await model();
  return (await extract(texts, { pooling: 'cls', normalize: true })).tolist();
}

/** A reader's question, as bge expects a search query. */
export async function embedQuestion(question: string): Promise<number[]> {
  return (await embedTexts([EMBED.queryPrefix + question]))[0];
}

/** The text a block is embedded with: its own words and the two readable blocks before it. */
export function windowText(plain: string[], k: number): string {
  return plain.slice(Math.max(0, k - EMBED.window), k + 1).filter(Boolean).join(' ');
}
