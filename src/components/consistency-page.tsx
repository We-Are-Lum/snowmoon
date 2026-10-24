'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { AI_LABEL } from '~/lib/ai-declared';
import { SYSTEM_FID } from '~/lib/config';
import type { ConsistencyData, ImageScore, PairScore, TrialRow } from '~/lib/consistency';
import { AiLabel } from './recipe-sheet';
import { SignInButton } from './sign-in';

/**
 * Same character, same look (owner, 2026-10-23): each character's sheet, their images sorted by score (lowest
 * first), outliers marked, and the overall worst 10. Owner-only (/api/you/consistency answers only for FID 6786).
 * Every sentence here is DRAFT wording by the coding agent (2026-10-23), kept in W.
 */
const W = {
  title: 'Same character, same look',
  ownerOnly: 'Owner-only. Nothing on this page is public.',
  signedOut: 'Sign in as the owner to see this page.',
  notOwner: 'This page is for the owner only.',
  loading: 'Loading…',
  failed: 'The scores didn’t load.',
  how: 'How the scores were measured',
  howText:
    'Each image was compared with its character’s cast sheet on the owner’s Mac, with open models and no paid service (scripts/consistency/measure.py). A detector finds the people and, in each figure’s own crop, the head and face; the figure most like the sheet is taken to be that character. Each aspect is a z-score over all the character appearances: 0 is average, −1 is clearly below. The detector and the who-is-who step make mistakes, mostly when a character is small, seated or seen from behind: check the outlined figure before trusting a low score.',
  aspects: [
    ['face', 'how alike the face region looks (image features). Not an identity match: drawn faces are small, and photo face recognisers don’t apply.'],
    ['hair', 'hair colour only, from the head with the face left out. It can’t see the haircut.'],
    ['clothes', 'garments and their colours, below the face. Hidden or seated bodies score lower for that alone.'],
    ['build', 'weak: a text probe (slim, heavy-set, tall…). Pose moves it. A hint only.'],
  ] as [string, string][],
  sideBySide: 'The trial, side by side',
  sideBySideNote:
    'The ten from the check by eye, redrawn with the same seed and size. No scores here: judge by eye. (c) is the main option, run twice: with the full sheets, then (v2) with only each sheet’s front view, because with the full sheet it drew the three views as three people. Nothing here is published.',
  trialLocal:
    'The trial’s pictures are only on the Mac (images-out/trial, never committed). Open images-out/trial/index.html there, or the “consistency trial” folder in your Drive.',
  wayNames: { original: 'Original (published)', a: '(a) klein 4B + portraits', b: '(b) klein base 4B, 28 steps', c: '(c) Qwen-Image-Edit-2511, full sheet', c2: '(c, v2) Qwen-Image-Edit-2511, front-view crop' } as Record<string, string>,
  notMade: 'Not made',
  eye: 'Checked by eye',
  notForPicking:
    'The automatic scores below were wrong 6 times in their worst 10, so they are not used to pick redos: redos come from the by-eye list (owner, 2026-10-23). They are kept as a record.',
  eyeNote: (by: string) => `Every measured image, looked at beside its characters’ sheets by the ${by}. Your own look decides.`,
  trialTen: 'The ten for the trial',
  worst: 'The 10 worst, as measured',
  worstNote: 'Each image’s score is its weakest character’s. Images left out of publishing are not counted. Under each, what the check by eye found.',
  verdict: 'By eye',
  outlier: 'Outlier',
  notFound: 'Not found in the picture',
  sheet: 'Cast sheet',
  sheetLocal: 'The cast sheet is shown only on the Mac (npm run dev): the sheets have never been published, so they are not in the repository.',
  images: (n: number) => `${n} image${n === 1 ? '' : 's'}, lowest score first`,
  notMeasured: 'Not measured',
  unpublished: 'Not published',
  box: 'The outlined figure is the one taken to be this character.',
  robe: 'In a privacy robe in this scene (by design): face, hair and clothes are not compared.',
  robeOpen: 'Robe open in this scene: clothes are not compared.',
  trial: 'The three ways',
  trialNote: 'Run on 2026-10-23 on fal (and this Mac for the portraits), under a $2 cap. Nothing is redrawn in full until you pick.',
  ways: [
    ['a', 'Same model (FLUX.2 [klein] 4B, Apache-2.0), with a head-and-shoulders portrait of each character as a second reference. The 9 portraits were drawn from the sheets on this Mac, free. With two characters the location plate no longer fits (4 references at most), so the place is in words.'],
    ['b', 'More steps. The distilled 4B is made for 4 steps (fal allows 4–8), so this is its undistilled sibling, FLUX.2 [klein] base 4B (Apache-2.0), at 28 steps, guidance 5. Now on the allowlist.'],
    ['c', 'Qwen-Image-Edit-2511 (Qwen, Apache-2.0, 20B), the main option: built for multi-image edits and keeping people consistent. Now on the allowlist. Too big for this Mac; on fal at $0.03 a megapixel.'],
  ] as [string, string][],
};

const fmt = (v: number | null | undefined) => (v === undefined || v === null ? '–' : (v > 0 ? '+' : '') + v.toFixed(1));
const order = (v: number | null | undefined) => (v === undefined || v === null ? Infinity : v);

export function ConsistencyPage() {
  const auth = useAuth();
  const [data, setData] = useState<ConsistencyData | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const fid = auth.kind === 'signed-in' ? auth.fid : null;
  useEffect(() => {
    if (fid !== SYSTEM_FID) return;
    let alive = true;
    setState('loading');
    void (async () => {
      const res = await authFetch('/api/you/consistency').catch(() => null);
      if (!alive) return;
      if (!res?.ok) return setState('failed');
      setData((await res.json()) as ConsistencyData);
      setState('idle');
    })();
    return () => {
      alive = false;
    };
  }, [fid]);

  return (
    <div className="page consistency">
      <p className="label">{W.ownerOnly}</p>
      <h1>{W.title}</h1>
      {auth.kind === 'loading' ? <p>{W.loading}</p> : null}
      {auth.kind === 'signed-out' ? (
        <>
          <p>{W.signedOut}</p>
          <SignInButton />
        </>
      ) : null}
      {fid !== null && fid !== SYSTEM_FID ? <p>{W.notOwner}</p> : null}
      {state === 'loading' ? <p>{W.loading}</p> : null}
      {state === 'failed' ? <p>{W.failed}</p> : null}
      {data ? <Report data={data} /> : null}
    </div>
  );
}

function Report({ data }: { data: ConsistencyData }) {
  const byId = new Map(data.images.map((i) => [i.id, i]));
  const name = new Map(data.characters.map((c) => [c.slug, c.name]));
  const review = data.review;
  const notes = new Map<string, string>([
    ...Object.entries(review?.measured_worst10 ?? {}),
    ...Object.entries(review?.by_design ?? {}).map(([k, v]): [string, string] => [k, `by design: ${v}`]),
    ...(review?.problems ?? []).map((p): [string, string] => [p.id, p.note]),
  ]);
  return (
    <>
      <section>
        <h2>{W.how}</h2>
        <p>{W.howText}</p>
        <ul>
          {W.aspects.map(([k, t]) => (
            <li key={k}>
              <b>{k}</b>: {t}
            </li>
          ))}
        </ul>
        <p className="consistency-small">
          People found in {data.detection.with_a_person} of {data.detection.images} images; a face in {data.detection.with_a_face}. Weights:{' '}
          {Object.entries(data.weights)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ')}
          . Models: {data.models.map((m) => `${m.repo} (${m.license})`).join(', ')}.
        </p>
      </section>
      <section>
        <h2>{W.trial}</h2>
        <p>{W.trialNote}</p>
        <ul>
          {W.ways.map(([k, t]) => (
            <li key={k}>
              <b>{k}</b>: {t}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>{W.sideBySide}</h2>
        <p>{W.sideBySideNote}</p>
        {data.trial ? data.trial.map((r) => <TrialRowView key={r.id} row={r} note={notes.get(r.id)} />) : <p>{W.trialLocal}</p>}
      </section>
      {review ? (
        <section>
          <h2>{W.eye}</h2>
          <p>{W.eyeNote(review.by)}</p>
          <p>{review.finding}</p>
          <h3>{W.trialTen}</h3>
          <p className="consistency-small">{review.trial10_why}</p>
          <ol className="consistency-grid">
            {review.trial10.map((id) => {
              const im = byId.get(id);
              return im ? (
                <li key={id}>
                  <Card im={im} focus={null} name={name} note={notes.get(id)} />
                </li>
              ) : null;
            })}
          </ol>
          <ul>
            {review.problems
              .filter((p) => !review.trial10.includes(p.id))
              .map((p) => (
                <li key={p.id}>
                  <b>{p.id}</b>: {p.note}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      <p className="consistency-flag">{W.notForPicking}</p>
      <section>
        <h2>{W.worst}</h2>
        <p className="consistency-small">{W.worstNote}</p>
        <ol className="consistency-grid">
          {data.worst10.map((id) => {
            const im = byId.get(id);
            return im ? (
              <li key={id}>
                <Card im={im} focus={null} name={name} note={notes.get(id)} />
              </li>
            ) : null;
          })}
        </ol>
      </section>
      {data.characters.map((c) => {
        const mine = data.images
          .map((im) => ({ im, p: im.chars?.find((p) => p.character === c.slug) }))
          .filter((x): x is { im: ImageScore; p: PairScore } => x.p !== undefined)
          .sort((a, b) => order(a.p.combined) - order(b.p.combined));
        const unmeasured = data.images.filter((im) => !im.measured && im.characters.includes(c.slug));
        const outliers = mine.filter((x) => x.p.outlier).length;
        return (
          <section key={c.slug} id={c.slug}>
            <h2>
              {c.name} <span className="consistency-small">· {W.images(mine.length)} · {outliers} outlier{outliers === 1 ? '' : 's'}</span>
            </h2>
            {c.sheet ? (
              <figure className="consistency-sheet">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.sheet} alt={`AI-generated image: ${c.name}'s cast sheet`} width={640} height={360} />
                <figcaption>
                  {W.sheet} · <AiLabel kind="image" text={AI_LABEL.image} file="content/snowmoon/recipes/images/cast.json" item={`${c.slug}-sheet`} />
                </figcaption>
              </figure>
            ) : (
              <p className="consistency-small">{W.sheetLocal}</p>
            )}
            <p className="consistency-small">{W.box}</p>
            <ol className="consistency-grid">
              {mine.map(({ im }) => (
                <li key={im.id}>
                  <Card im={im} focus={c.slug} name={name} note={notes.get(im.id)} />
                </li>
              ))}
              {unmeasured.map((im) => (
                <li key={im.id}>
                  <p>
                    <b>{im.id}</b> · {W.notMeasured}: {im.why}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </>
  );
}

function Card({ im, focus, name, note }: { im: ImageScore; focus: string | null; name: Map<string, string>; note?: string }) {
  const shown = (im.chars ?? []).filter((p) => focus === null || p.character === focus);
  const w = im.width ?? 1024;
  const h = im.height ?? 576;
  const flagged = shown.some((p) => p.outlier);
  return (
    <figure className={flagged ? 'consistency-card is-outlier' : 'consistency-card'}>
      <div className="consistency-frame">
        {im.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={im.url} alt={`AI-generated image: ${im.id}`} width={w} height={h} loading="lazy" />
        ) : (
          <p className="consistency-small">{W.unpublished}</p>
        )}
        {shown
          .filter((p) => p.box)
          .map((p) => (
            <span
              key={p.character}
              className="consistency-box"
              style={{
                left: `${(p.box![0] / w) * 100}%`,
                top: `${(p.box![1] / h) * 100}%`,
                width: `${((p.box![2] - p.box![0]) / w) * 100}%`,
                height: `${((p.box![3] - p.box![1]) / h) * 100}%`,
              }}
            />
          ))}
      </div>
      <figcaption>
        <Link href={`/chapter/${im.chapter}#c${im.chapter}-b${im.idx}`}>{im.id}</Link>
        {im.excluded ? <span> · {W.unpublished}</span> : null} ·{' '}
        <AiLabel kind="image" text={AI_LABEL.image} file={`content/snowmoon/recipes/images/chapter-${im.chapter}.json`} item={im.id} />
        {note ? (
          <div>
            <b>{W.verdict}</b>: {note}
          </div>
        ) : null}
        {shown.map((p) => (
          <div key={p.character}>
            <b>{name.get(p.character) ?? p.character}</b> {fmt(p.combined)}
            {p.found ? (
              <span className="consistency-small">
                {' '}
                (face {fmt(p.z?.face)}, hair {fmt(p.z?.hair)}, clothes {fmt(p.z?.clothes)}, build {fmt(p.z?.build)})
              </span>
            ) : null}
            {p.robe === 'closed' ? <div className="consistency-small">{W.robe}</div> : null}
            {p.robe === 'open' ? <div className="consistency-small">{W.robeOpen}</div> : null}
            {p.outlier ? (
              <div className="consistency-flag">
                {W.outlier}: {p.found ? p.outlier.join('; ') : W.notFound}
              </div>
            ) : null}
          </div>
        ))}
      </figcaption>
    </figure>
  );
}

function TrialRowView({ row, note }: { row: TrialRow; note?: string }) {
  return (
    <div className="consistency-trial">
      <h3>
        <Link href={`/chapter/${row.chapter}`}>{row.id}</Link>
      </h3>
      {note ? <p className="consistency-small">{note}</p> : null}
      <div className="consistency-trial-row">
        <figure>
          {row.original ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.original} alt={`AI-generated image: ${row.id}, the published original`} width={1024} height={576} loading="lazy" />
          ) : null}
          <figcaption>
            {W.wayNames.original} · <AiLabel kind="image" text={AI_LABEL.image} file={`content/snowmoon/recipes/images/chapter-${row.chapter}.json`} item={row.id} />
          </figcaption>
        </figure>
        {(['a', 'b', 'c', 'c2'] as const).map((w) => (
          <figure key={w}>
            {row.ways[w] ? <TrialImage file={row.ways[w]!} alt={`AI-generated image: ${row.id}, trial ${w}`} /> : <p>{W.notMade}</p>}
            <figcaption>{W.wayNames[w]} · AI image, not published</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** A trial picture, fetched with the owner's sign-in (an <img> can't send it) and shown from a blob. */
function TrialImage({ file, alt }: { file: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    void (async () => {
      const res = await authFetch(`/api/you/consistency/trial?file=${encodeURIComponent(file)}`).catch(() => null);
      if (!alive || !res?.ok) return;
      url = URL.createObjectURL(await res.blob());
      setSrc(url);
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} width={1024} height={576} /> : <p className="consistency-small">…</p>;
}
