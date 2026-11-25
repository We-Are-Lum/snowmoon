/**
 * Lord Ephelion's profile and three shared scenes, as drafts (owner, 2026-11-25). Nothing here is published: the
 * pictures and the ledger go to a local folder, and the owner publishes.
 *
 * - Face and build from @garance's poster (/challenge/p/70762e34-5d10-4c73-96cd-dba19ef956c6, published 18 Nov).
 * - The black suit is the idea of @garance (25 Nov call), described in this edition's own words.
 * - Profile, 10 pictures: master front (black suit), three-quarter, profile, three expressions, sweater front and
 *   three-quarter, ice-blue coat front and three-quarter. Every one after the master uses the master front as its
 *   reference, so the face stays the same.
 * - Scenes, 9 pictures: study (sweater), TV commercial set (black suit), speech to a crowd (ice-blue coat), each at
 *   wide, medium and close. All three scenes are this edition's inventions.
 * - Model: GPT Image 2.5 Sunburst (a closed model by OpenAI), only through the Vercel AI Gateway
 *   (scripts/lib/batch-model.ts: provider pinned to openai, no prompt training, endpoint list read before each call).
 * - Cap: $2 for the whole run, counted from the ledger. Each call reserves the worst case ($0.08) before it is sent.
 * - No real person's likeness: the prompts describe the look only, and name no one.
 *
 * Usage (reads the gateway key from the main checkout's .env.local in place; never printed):
 *   npx tsx --env-file=/Users/nathan/snowmoon/.env.local scripts/ephelion-profile.ts --out=<folder> [--ids=a,b] [--go]
 * Without --go it prints the plan and the prompts and sends nothing.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLOSED_IMAGE_MODELS, closedImage } from './lib/batch-model';

const MODEL = 'gpt-image-2.5-sunburst' as const;
const CAP_USD = 2;
const WORST_USD = CLOSED_IMAGE_MODELS[MODEL].worstUsd;
const POSTER = { url: 'https://pictures.snowmoon.party/images/readers/13c311ffca167d12a348cf4bc4ee7516.jpg', page: 'https://snowmoon.party/challenge/p/70762e34-5d10-4c73-96cd-dba19ef956c6', by: '@garance' };

const STYLE = 'Same illustrated animated-series style as the reference: clean line art, soft cel shading, muted natural colours.';
const HIM = 'the same man as in the reference picture: a tall, composed man in his fifties with a lean build and broad shoulders, short dark hair greying at the temples and swept back, a lined clean-shaven face with a strong jaw, thin wire-rimmed glasses and dark eyes';
const KEEP = 'Keep his face, hair, glasses, age and build exactly as in the reference.';
const SHEET = 'Character reference picture on a plain flat off-white background with no scenery, no props, no words, letters or logos anywhere, even lighting.';
const SUIT = 'a tailored black suit: a single-breasted black jacket, a crisp white shirt, a plain dark tie, black trousers and polished black shoes';
const SWEATER = 'a comfortable but well-made soft grey wool crewneck sweater over a white collared shirt, dark charcoal trousers and brown leather shoes';
const COAT = 'a long ice-blue coat with a high standing collar, silver-grey trim along the front edges and cuffs and a small silver four-petal pin on the collar, over a pale grey buttoned waistcoat and white shirt, dark trousers and black shoes';
const NO_WORDS = 'No words, letters, numbers or logos anywhere in the picture.';

type Ref = 'poster' | string; // 'poster', or the id of an earlier picture in this run
interface Shot { id: string; group: 'profile' | 'scene'; ref: Ref; aspect: '2:3' | '3:2'; prompt: string }

export const SHOTS: Shot[] = [
  // Profile: the master front comes from the poster; everything after it from the master front.
  { id: 'master-front', group: 'profile', ref: 'poster', aspect: '2:3', prompt: `Draw ${HIM}. ${KEEP} ${SHEET} Full-body front view, standing straight and facing the viewer, arms relaxed at his sides, a calm, neutral expression. He wears ${SUIT}. ${STYLE}` },
  { id: 'suit-three-quarter', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}, in the same black suit. ${KEEP} ${SHEET} Full-body three-quarter view, turned about 45 degrees to his left, standing straight, arms relaxed, a calm, neutral expression. ${STYLE}` },
  { id: 'suit-profile', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}, in the same black suit. ${KEEP} ${SHEET} Full-body side view in profile, facing left, standing straight, arms relaxed, a calm, neutral expression. ${STYLE}` },
  { id: 'expression-warm-smile', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}, in the same black suit. ${KEEP} ${SHEET} Head-and-shoulders portrait facing the viewer, a warm, reassuring smile that reaches his eyes. ${STYLE}` },
  { id: 'expression-mid-speech', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}, in the same black suit. ${KEEP} ${SHEET} Waist-up portrait facing the viewer, mid-speech: mouth open as he speaks, one hand raised at chest height, palm open, an earnest, persuasive look. ${STYLE}` },
  { id: 'expression-stern', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}, in the same black suit. ${KEEP} ${SHEET} Head-and-shoulders portrait facing the viewer, a stern, unsmiling expression, brows lowered slightly, eyes steady. ${STYLE}` },
  { id: 'sweater-front', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}. ${KEEP} ${SHEET} Full-body front view, standing relaxed and facing the viewer, a calm, friendly expression. He wears ${SWEATER}. ${STYLE}` },
  { id: 'sweater-three-quarter', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}. ${KEEP} ${SHEET} Full-body three-quarter view, turned about 45 degrees to his left, standing relaxed, a calm, friendly expression. He wears ${SWEATER}. ${STYLE}` },
  { id: 'coat-front', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}. ${KEEP} ${SHEET} Full-body front view, standing straight and facing the viewer, a composed, dignified expression. He wears ${COAT}. ${STYLE}` },
  { id: 'coat-three-quarter', group: 'profile', ref: 'master-front', aspect: '2:3', prompt: `Draw ${HIM}. ${KEEP} ${SHEET} Full-body three-quarter view, turned about 45 degrees to his left, standing straight, a composed, dignified expression. He wears ${COAT}. ${STYLE}` },

  // Scenes (this edition's inventions): each from its outfit's front.
  { id: 'study-wide', group: 'scene', ref: 'sweater-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same grey sweater. ${KEEP} Wide shot of his private study in the evening: tall bookshelves, a large wooden desk, a deep leather armchair, a window onto a snowy night, warm lamp light. He sits in the armchair sipping tea from a porcelain cup, relaxed and thoughtful. ${NO_WORDS} ${STYLE}` },
  { id: 'study-medium', group: 'scene', ref: 'sweater-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same grey sweater. ${KEEP} Medium shot, waist up, in his book-lined study in warm lamp light: he holds a porcelain teacup and saucer and lifts the cup to sip, eyes half-closed, at ease. ${NO_WORDS} ${STYLE}` },
  { id: 'study-close', group: 'scene', ref: 'sweater-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same grey sweater. ${KEEP} Close-up of his face and hands as he sips tea from a porcelain cup, steam rising past his glasses, warm lamp light, softly blurred bookshelves behind. ${NO_WORDS} ${STYLE}` },
  { id: 'commercial-wide', group: 'scene', ref: 'master-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same black suit. ${KEEP} Wide shot of a television commercial being filmed in a studio: he stands on a clean, softly lit set with a pale backdrop, facing a large studio camera; around the edges of the frame are light stands, softboxes and a boom microphone, and a small crew watches from the shadows. ${NO_WORDS} ${STYLE}` },
  { id: 'commercial-medium', group: 'scene', ref: 'master-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same black suit. ${KEEP} Medium shot, waist up, as seen through the studio camera on a television commercial set: soft key light, a pale clean backdrop, he looks straight into the lens with a confident, welcoming smile, one hand open toward the viewer. ${NO_WORDS} ${STYLE}` },
  { id: 'commercial-close', group: 'scene', ref: 'master-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same black suit. ${KEEP} Close-up of his face on a television commercial set, looking straight into the camera lens with calm assurance, polished studio lighting with a soft rim light, a pale blurred backdrop. ${NO_WORDS} ${STYLE}` },
  { id: 'speech-wide', group: 'scene', ref: 'coat-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same ice-blue coat. ${KEEP} Wide shot from behind a large crowd: he stands on a raised stone platform in a city square under a pale winter sky, one hand raised as he speaks; the crowd fills the foreground, seen from behind, ordinary people in winter clothes. No flags or banners with symbols. ${NO_WORDS} ${STYLE}` },
  { id: 'speech-medium', group: 'scene', ref: 'coat-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same ice-blue coat. ${KEEP} Medium shot from a low angle, waist up, as he speaks from a raised platform, one hand raised mid-speech, an earnest, commanding expression; behind him a pale winter sky, and the backs of heads of the crowd softly blurred along the bottom of the frame. ${NO_WORDS} ${STYLE}` },
  { id: 'speech-close', group: 'scene', ref: 'coat-front', aspect: '3:2', prompt: `Draw ${HIM}, in the same ice-blue coat. ${KEEP} Close-up of his face as he speaks to a crowd, mouth open mid-word, eyes intent, cold daylight, the high collar of his coat framing his jaw, a soft blur of the crowd behind. ${NO_WORDS} ${STYLE}` },
];

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

interface LedgerRow { id: string; at: string; costUsd: number; requestId: string | null; sha256: string; file: string; ref: { from: string; sha256: string }; prompt: string; model: string; settings: Record<string, unknown> }

function readLedger(path: string): LedgerRow[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as LedgerRow);
}

async function refBytes(ref: Ref, out: string, ledger: LedgerRow[]): Promise<{ bytes: Buffer; contentType: string; from: string }> {
  if (ref === 'poster') {
    const res = await fetch(POSTER.url);
    if (!res.ok) throw new Error(`poster ${res.status}`);
    return { bytes: Buffer.from(await res.arrayBuffer()), contentType: 'image/jpeg', from: POSTER.page };
  }
  // The latest kept picture of that id (a redo replaces it by being the newer row).
  const row = [...ledger].reverse().find((r) => r.id === ref);
  if (!row) throw new Error(`${ref} hasn't been made yet; make it first`);
  return { bytes: readFileSync(join(out, row.file)), contentType: 'image/png', from: row.file };
}

async function main() {
  const out = arg('out');
  if (!out) throw new Error('--out=<folder> is required');
  const ids = arg('ids')?.split(',').filter(Boolean);
  const go = process.argv.includes('--go');
  const shots = ids ? SHOTS.filter((s) => ids.includes(s.id)) : SHOTS;
  if (ids && shots.length !== ids.length) throw new Error(`unknown id in --ids (known: ${SHOTS.map((s) => s.id).join(', ')})`);
  mkdirSync(out, { recursive: true });
  const ledgerPath = join(out, 'ledger.jsonl');
  const spent = () => readLedger(ledgerPath).reduce((t, r) => t + r.costUsd, 0);
  console.log(`${shots.length} picture(s); spent so far $${spent().toFixed(3)} of the $${CAP_USD} cap; worst case $${(shots.length * WORST_USD).toFixed(2)}`);
  if (!go) {
    for (const s of shots) console.log(`\n[${s.id}] ref ${s.ref}, ${s.aspect}\n${s.prompt}`);
    console.log('\nDry run: nothing sent. Add --go to make them.');
    return;
  }
  for (const s of shots) {
    if (spent() + WORST_USD > CAP_USD) { console.log(`stop: ${s.id} would pass the $${CAP_USD} cap`); break; }
    const ref = await refBytes(s.ref, out, readLedger(ledgerPath));
    const made = await closedImage(MODEL, s.prompt, ref, { aspect: s.aspect });
    const sha = createHash('sha256').update(made.bytes).digest('hex');
    const n = readLedger(ledgerPath).filter((r) => r.id === s.id).length + 1;
    const file = `${s.id}${n > 1 ? `-${n}` : ''}.png`;
    writeFileSync(join(out, file), made.bytes);
    const row: LedgerRow = { id: s.id, at: new Date().toISOString(), costUsd: made.costUsd, requestId: made.requestId, sha256: sha, file,
      ref: { from: ref.from, sha256: createHash('sha256').update(ref.bytes).digest('hex') }, prompt: s.prompt,
      model: 'GPT Image 2.5 Sunburst, a closed model by OpenAI', settings: made.settings };
    appendFileSync(ledgerPath, JSON.stringify(row) + '\n');
    console.log(`${file}  $${made.costUsd.toFixed(4)}  (total $${spent().toFixed(3)})`);
  }
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
