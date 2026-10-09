import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { byline } from '~/lib/images/byline';
import { SAMPLE_SUBJECTS, VIEW_LINES } from '~/lib/images/design-rules';
import { bookCharacter, bookCharacters, designByVersion } from '~/lib/images/designs';
import { RULES } from '~/lib/images/rules';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { DesignForm } from '~/components/design-form';

/**
 * Make a style or a sheet (step 4; Claude Design 4b, 4c, 5b): a new style, a sheet for one of the
 * book's characters, a fork of a published design (?from=), or a new version of your own
 * (?version=). The form itself is in the browser; the server checks everything again on publish.
 */
export const metadata = { title: 'Styles & characters', robots: { index: false } };
type Props = { searchParams: Promise<{ kind?: string; character?: string; from?: string; version?: string }> };
const W = IMAGE_WORDING.designs;

export default async function NewDesign({ searchParams }: Props) {
  const q = await searchParams;
  const sql = db();
  const srcId = q.from ?? q.version;
  const src = srcId && sql ? await designByVersion(sql, srcId).catch(() => null) : null;
  if (srcId && !src) notFound();
  const kind = src ? src.kind : q.kind === 'character' ? 'character' : 'style';
  const character = kind === 'character' ? (src ? (bookCharacters().find((c) => c.name === src.entity) ?? null) : bookCharacter(q.character ?? '')) : null;
  if (kind === 'character' && !character) notFound();
  const mode = q.version && src ? 'version' : src ? 'fork' : 'create';
  const callName = character ? (character.name.split(' ').find((w) => !/^(Lord|General|Senator)$/.test(w)) ?? character.name) : '';
  const title = mode === 'fork' ? W.form.fork : mode === 'version' ? W.form.newVersion : kind === 'style' ? W.form.newStyle : W.form.newSheet(callName);
  return (
    <div className="page prose dz-page dz-form-page">
      <p className="label ip-crumb">
        <Link href={src ? `/images/designs/${src.shown.versionId}` : kind === 'style' ? '/images/designs' : `/images/designs/character/${character!.slug}`}>
          ← {src ? (src.shown.body.title || src.entity) : kind === 'style' ? W.index.title : character!.name}
        </Link>{' '}
        · {IMAGES.label}
      </p>
      <h1 className="dz-title">{title}</h1>
      <DesignForm
        mode={mode}
        kind={kind}
        character={character ? { slug: character.slug, name: character.name, callName, quotes: character.quotes, firstChapter: character.firstChapter } : null}
        source={
          src
            ? {
                versionId: src.shown.versionId,
                title: src.shown.body.title,
                entity: src.entity,
                by: byline(src.byName, src.byFid),
                versionNo: src.shown.versionNo,
                text: src.shown.body.text,
                drafted: Boolean(src.shown.body.assist),
              }
            : null
        }
        subjects={[...SAMPLE_SUBJECTS]}
        viewLines={VIEW_LINES}
        rules={RULES}
        limits={{ ...IMAGES.designs }}
        models={{ text: IMAGES.model, edit: IMAGES.editModel }}
        suffix={IMAGES.suffix}
      />
    </div>
  );
}

