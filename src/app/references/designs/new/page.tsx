import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IMAGES } from '~/lib/config';
import { db } from '~/lib/db';
import { designByline } from '~/lib/images/byline';
import { SAMPLE_SUBJECTS, viewLinesFor } from '~/lib/images/design-rules';
import { placeTitle, sheetPlace, sheetPlaces } from '~/lib/images/sheets';
import { bookCharacter, bookCharacters, designByVersion, listDesigns } from '~/lib/images/designs';
import { RULES } from '~/lib/images/rules';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { DesignForm } from '~/components/design-form';
import { challengeSheetsOpen, isChallengeCharacter } from '~/lib/challenge/open-sheets';

/**
 * Make a style or a sheet (step 4; Claude Design 4b, 4c, 5b): a new style, a sheet for one of the
 * book's characters, a fork of a published design (?from=), or a new version of your own
 * (?version=). The form itself is in the browser; the server checks everything again on publish.
 */
export const metadata = { title: 'Styles & characters', robots: { index: false } };
type Props = { searchParams: Promise<{ kind?: string; character?: string; place?: string; from?: string; version?: string }> };
const W = IMAGE_WORDING.designs;
const sheetPlaceByName = (name: string) => sheetPlaces().find((p) => placeTitle(p.name) === name);

export default async function NewDesign({ searchParams }: Props) {
  const q = await searchParams;
  const sql = db();
  const srcId = q.from ?? q.version;
  const src = srcId && sql ? await designByVersion(sql, srcId).catch(() => null) : null;
  if (srcId && !src) notFound();
  const kind = src ? src.kind : q.kind === 'character' ? 'character' : q.kind === 'location' ? 'location' : 'style';
  const character = kind === 'character' ? (src ? (bookCharacters().find((c) => c.name === src.entity) ?? null) : bookCharacter(q.character ?? '')) : null;
  if (kind === 'character' && !character) notFound();
  // A place sheet (2026-10-14): one of the book's places, found by its slug or, for a fork or version, its name.
  const place = kind === 'location' ? (src ? (sheetPlaceByName(src.entity) ?? null) : sheetPlace(q.place ?? '')) : null;
  if (kind === 'location' && !place) notFound();
  const mode = q.version && src ? 'version' : src ? 'fork' : 'create';
  // A sheet's views are made in one of the published styles (owner, 2026-10-14).
  const styles = kind !== 'style' && sql ? await listDesigns(sql, 'style').catch(() => []) : [];
  const callName = character ? (character.name.split(' ').find((w) => !/^(Lord|General|Senator)$/.test(w)) ?? character.name) : '';
  const title = mode === 'fork' ? W.form.fork : mode === 'version' ? W.form.newVersion : kind === 'style' ? W.form.newStyle : W.form.newSheet(place ? placeTitle(place.name) : callName);
  return (
    <div className="page prose dz-page dz-form-page">
      <p className="label ip-crumb">
        <Link href={src ? `/references/designs/${src.shown.versionId}` : kind === 'style' ? '/references/designs' : place ? `/references/designs/place/${place.slug}` : `/references/designs/character/${character!.slug}`}>
          ← {src ? (src.shown.body.title || src.entity) : kind === 'style' ? W.index.tabStyles : place ? placeTitle(place.name) : character!.name}
        </Link>{' '}
        · {IMAGES.label}
      </p>
      <h1 className="dz-title">{title}</h1>
      <DesignForm
        mode={mode}
        kind={kind}
        character={character ? { slug: character.slug, name: character.name, callName, quotes: character.quotes, firstChapter: character.firstChapter } : null}
        place={place ? { slug: place.slug, name: placeTitle(place.name), quotes: place.facts } : null}
        source={
          src
            ? {
                versionId: src.shown.versionId,
                title: src.shown.body.title,
                entity: src.entity,
                by: designByline(src.byName, src.byFid, src.byRole),
                versionNo: src.shown.versionNo,
                text: src.shown.body.text,
                drafted: Boolean(src.shown.body.assist),
              }
            : null
        }
        subjects={[...SAMPLE_SUBJECTS]}
        styles={styles.map((s) => ({ versionId: s.versionId, title: s.title || s.entity, by: designByline(s.byName, s.byFid, s.byRole), text: s.text, thumb: s.thumb }))}
        viewLines={viewLinesFor(kind === 'location' ? 'location' : 'character')}
        rules={RULES}
        limits={{ ...IMAGES.designs }}
        models={{ text: IMAGES.model, edit: IMAGES.editModel }}
        suffix={IMAGES.suffix}
        challengeOpen={Boolean(src && mode !== 'create' && src.kind === 'character' && challengeSheetsOpen() && isChallengeCharacter(src.entity))}
      />
    </div>
  );
}

