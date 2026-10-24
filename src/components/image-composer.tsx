'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth, useWalletSession, webNameProof } from '~/lib/client-auth';
import { ADD_IMAGE_EVENT, deleteDraft, draftKey, loadDraft, saveDraft, type AddImageDetail } from '~/lib/images/client';
import { IMAGES } from '~/lib/config';
import { IMAGE_WORDING as W } from '~/lib/images/wording';
import { mentions } from '~/lib/images/design-rules';
import { ConsentScreen, PublishedTextField, PublishFlow, type PublishStep } from './publish-words';
import { SignInButton } from './sign-in';
import { WalletPanel, WalletSignInButton } from './wallet';
import { AiLabel } from './recipe-sheet';
import { AI_LABEL, readerImageView } from '~/lib/ai-declared';
import { exactDollars } from '~/lib/wallet/price-text';
import { paysFor, referenceCount } from '~/lib/images/price';

/**
 * "Add an image" (docs/proposals/add-an-image.md, section 2): a sheet over the reader. The
 * passage (1 to 8 blocks, widened or narrowed here), the person's own prompt, an optional style
 * shown in full, the one model, the rules, then Generate. The draft is kept on this device only;
 * "Preview and publish" goes through the usual consent and preview. Labelled "Trial".
 *
 * Laid out as Claude Design's "Image creation" board (docs/design/image-creation-study.md):
 * compose, then the private draft (dashed, "only you"), then the preview, each with one action
 * bar at the foot; on a phone the sheet fills the screen, at desktop width it is a right column
 * beside the reader. The rules of slice 1 are unchanged.
 */
type Status = {
  label: string;
  ready: boolean;
  signedIn: boolean;
  invited?: boolean;
  /** From a Neynar value kept in the last day; null when none is kept (Generate looks it up). */
  eligible?: boolean | null;
  refusal?: string;
  consented?: boolean;
  left?: number;
  publishesLeft?: number;
  perDay: number;
  /** A wallet account: its balance pays for each image (owner, 2026-10-13). */
  /** pricesUsd[n]: a Generate's price with n reference pictures (0: none), as reserve() charges it. */
  prepaid?: { balanceUsd: number; priceUsd: number; pricesUsd?: number[]; markup: number };
  /** Wallet sign-in is offered only once paying is open (IMAGES.prepaid.payTo set). */
  walletSignIn?: boolean;
  maxBlocks: number;
  rules: string;
  model: { name: string; licence: string; host: string };
  /** Every style an image can be made in (owner, 2026-10-14: always one): the starting style while offered, then the published ones. */
  styles: { id: string; name: string; text: string; by: string | null; drafted: boolean }[];
  editModel?: { name: string; licence: string; host: string };
  /** Step 4: the person's own picks (private), offered for this image only. */
  picks?: { styles: Chip[]; characters: Chip[]; places: Chip[] };
  /** Sheets as text: the characters this passage names and its scene's place, with the text Generate would add. */
  inPassage?: { passage: { chapter: number; start: number; end: number }; characters: SheetChip[]; place: SheetChip | null; maxCharacters: number };
};
type SheetChip = { slug: string; name: string; text: string };
const SH = W.designs.sheets;
type Chip = { versionId: string; kind: 'style' | 'character' | 'location'; entity: string; title: string; by: string; versionNo: number; text: string; views: number; drafted: boolean };
const D = W.designs.composer;
/** The designs in a draft's signed record (signed, not secret: it is the person's own draft). */
function ticketDesigns(ticket: string): Chip[] {
  try {
    const t = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(ticket.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)))) as {
      designs?: { versionId: string; kind: 'style' | 'character' | 'location'; entity: string; title: string; by: string; versionNo: number; text: string; assist: unknown }[];
    };
    return (t.designs ?? []).map((d) => ({ ...d, views: 0, drafted: Boolean(d.assist) }));
  } catch {
    return [];
  }
}
/** The sheets in a draft's signed record: who is in it, where, and the shorthand text added. */
function ticketSheets(ticket: string): { characters: string[]; place: string | null; added: { kind: string; slug: string; name: string; text: string }[] } | null {
  try {
    const t = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(ticket.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)))) as { sheets?: ReturnType<typeof ticketSheets> };
    return t.sheets ?? null;
  } catch {
    return null;
  }
}
const sameRange = (a: { chapter: number; start: number; end: number } | undefined, b: { chapter: number; start: number; end: number }) =>
  a !== undefined && a.chapter === b.chapter && a.start === b.start && a.end === b.end;
const placeTitle = (name: string) => name.replace(/^./, (c) => c.toUpperCase());

/**
 * "In this passage" (owner, 2026-10-10): each character the passage names and its scene's place,
 * chosen to start, removable for this image. Their shorthand (this edition's invented look) is
 * shown in full, since it is added to the prompt and published with it.
 */
export function InPassage({
  found,
  chosen,
  pickedFor,
  onChange,
}: {
  found: NonNullable<Status['inPassage']>;
  chosen: { characters: string[]; place: string | null };
  pickedFor: Set<string>;
  onChange: (next: { characters: string[]; place: string | null }) => void;
}) {
  const full = chosen.characters.length >= found.maxCharacters;
  const added = [
    ...found.characters.filter((c) => chosen.characters.includes(c.slug) && !pickedFor.has(c.name)),
    ...(found.place && chosen.place ? [found.place] : []),
  ];
  return (
    <fieldset className="ic-style ic-chars ic-in-passage">
      <legend>{SH.inPassage}</legend>
      {found.characters.map((c) => {
        const on = chosen.characters.includes(c.slug);
        return (
          <label key={c.slug} data-sheet={`character:${c.slug}`}>
            <input
              type="checkbox"
              checked={on}
              disabled={!on && full}
              onChange={(e) => onChange({ ...chosen, characters: e.target.checked ? [...chosen.characters, c.slug] : chosen.characters.filter((x) => x !== c.slug) })}
            />{' '}
            <span className="ic-chip-key">{SH.character}</span> {c.name}
          </label>
        );
      })}
      {found.place ? (
        <label data-sheet={`place:${found.place.slug}`}>
          <input type="checkbox" checked={chosen.place === found.place.slug} onChange={(e) => onChange({ ...chosen, place: e.target.checked ? found.place!.slug : null })} />{' '}
          <span className="ic-chip-key">{SH.place}</span> {placeTitle(found.place.name)}
        </label>
      ) : (
        <p className="ic-note ic-no-place">{SH.noPlace}</p>
      )}
      {found.characters.length > found.maxCharacters && <p className="ic-note">{SH.upTo(found.maxCharacters)}</p>}
      {[...pickedFor].filter((n) => found.characters.some((c) => c.name === n && chosen.characters.includes(c.slug))).map((n) => (
        <p key={n} className="ic-note">{SH.pickReplaces(n)}</p>
      ))}
      {added.length > 0 && (
        <div className="ic-style-text ic-sheet-text">
          <p className="ic-sheet-head">{SH.added}</p>
          {added.map((a) => (
            <p key={a.slug}>{a.text}</p>
          ))}
        </div>
      )}
    </fieldset>
  );
}

const chipName = (c: Chip) => `${c.kind === 'style' ? c.title || c.entity : c.entity} · ${c.by} v${c.versionNo}`;
type Wording = { version: string; line: string; title: string; text: string[]; sha256: string };

/** The chapter's block ids in reading order, from the page (only blocks a passage can start or end on). */
function blockIds(): number[] {
  return Array.from(document.querySelectorAll<HTMLElement>('article.chapter > .block[id]'))
    .filter((el) => !el.classList.contains('break'))
    .map((el) => Number(el.id.match(/-b(\d+)$/)?.[1]))
    .filter((n) => Number.isInteger(n));
}

export function ImageComposer() {
  const [at, setAt] = useState<AddImageDetail | null>(null);
  useEffect(() => {
    const on = (e: Event) => setAt((e as CustomEvent<AddImageDetail>).detail);
    window.addEventListener(ADD_IMAGE_EVENT, on);
    return () => window.removeEventListener(ADD_IMAGE_EVENT, on);
  }, []);
  if (!at) return null;
  return <Sheet initial={at} onClose={() => setAt(null)} />;
}

function Sheet({ initial, onClose }: { initial: AddImageDetail; onClose: () => void }) {
  const auth = useAuth();
  const wallet = useWalletSession();
  const signedIn = auth.kind === 'signed-in' || wallet !== null;
  const [range, setRange] = useState(initial);
  const [status, setStatus] = useState<Status | null>(null);
  /** On the website, signed out, with wallet sign-in open: the wallet button comes first and is the solid one. */
  const walletFirst = auth.kind === 'signed-out' && !auth.inApp && !!status?.walletSignIn;
  const [prompt, setPrompt] = useState('');
  // Always a style (owner, 2026-10-14; 2026-10-10: without one the model draws realistic pictures): the newest
  // style pick, else the first offered. undefined = not chosen yet; a restored draft keeps its own.
  const [picked, setStyle] = useState<string | null | undefined>(undefined);
  const style = picked === undefined || picked === null ? (status?.styles[0]?.id ?? null) : picked;
  const [characters, setCharacters] = useState<string[]>([]);
  // A picked setting sheet for this image (2026-10-14): replaces this edition's shorthand for the place.
  const [placeSheet, setPlaceSheet] = useState<string | null>(null);
  const [reference, setReference] = useState(false);
  const [chipsFor, setChipsFor] = useState<string | null>(null);
  // "In this passage": the characters and place chosen for this image (all found, up to the limit, to start).
  const [sheetPick, setSheetPick] = useState<{ for: string; characters: string[]; place: string | null } | null>(null);
  // What the draft was made with: the preview shows exactly that, even if the chips change after.
  const [madeWith, setMadeWith] = useState<{ style: string | null; characters: string[]; reference: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ ticket: string; image: string } | null>(null);
  const [published, setPublished] = useState<string | null>(null);
  const [consent, setConsent] = useState<Wording | null>(null);
  const [view, setView] = useState<'compose' | 'draft'>('compose');
  const [step, setStep] = useState<PublishStep>('edit');
  const [whole, setWhole] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const ids = useRef<number[]>([]);

  const refresh = useCallback(async () => {
    const res = await authFetch(`/api/images/status?chapter=${range.chapter}&start=${range.start}&end=${range.end}`).catch(() => null);
    if (res?.ok) setStatus((await res.json()) as Status);
  }, [range.chapter, range.start, range.end]);
  useEffect(() => {
    void refresh();
  }, [refresh, auth.kind, wallet?.address]);

  // Focus in, Escape closes, focus back where it was.
  useEffect(() => {
    ids.current = blockIds();
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>('button, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [onClose]);

  // A draft kept on this device for this passage comes back with the sheet.
  useEffect(() => {
    void loadDraft(draftKey(range)).then((d) => {
      if (!d) return setDraft(null);
      setDraft({ ticket: d.ticket, image: d.image });
      setView('draft');
      setPrompt(d.prompt);
      setStyle(d.style);
      setCharacters(d.characters ?? []);
      setPlaceSheet(d.place ?? null);
      setReference(d.reference ?? false);
      setMadeWith({ style: d.style, characters: d.characters ?? [], reference: d.reference ?? false });
      setChipsFor(draftKey(range));
      if (d.sheets) setSheetPick({ for: `${d.chapter}-${d.start}-${d.end}`, ...d.sheets });
    });
  }, [range]);

  const passage = ids.current.filter((i) => i >= range.start && i <= range.end);
  const passageText = passage.map((i) => document.getElementById(`c${range.chapter}-b${i}`)?.textContent ?? '').join(' ');
  // Picks fill in the chips once per passage: the picked style, and the picked characters the passage names.
  useEffect(() => {
    const key = draftKey(range);
    if (!status?.picks || chipsFor === key) return;
    setChipsFor(key);
    // Every picked style is offered; the newest pick starts chosen, for this image only (decision 3).
    // With no picked style, the project's starting style stays chosen (main's default, 2026-10-10).
    const pickedStyle = status.picks.styles.find((c) => status.styles.some((s) => s.id === c.versionId));
    if (pickedStyle) setStyle(pickedStyle.versionId);
    // A picked setting sheet for the passage's place starts chosen.
    const place = status.inPassage && sameRange(status.inPassage.passage, range) ? status.inPassage.place : null;
    setPlaceSheet(place ? (status.picks.places.find((c) => c.entity.toLowerCase() === place.name.toLowerCase())?.versionId ?? null) : null);
    // A picked sheet is offered for a character the passage names (the same rule as "In this passage").
    const named = status.inPassage && sameRange(status.inPassage.passage, range) ? status.inPassage.characters.map((c) => c.name) : null;
    setCharacters(status.picks.characters.filter((c) => (named ? named.includes(c.entity) : mentions(passageText, c.entity))).map((c) => c.versionId));
  }, [status, range, chipsFor, passageText]);
  // The chips of "In this passage" start chosen, once per passage, from the status for this very passage.
  const rangeKey = `${range.chapter}-${range.start}-${range.end}`;
  const found = status?.inPassage && sameRange(status.inPassage.passage, range) ? status.inPassage : null;
  useEffect(() => {
    if (!found || sheetPick?.for === rangeKey) return;
    setSheetPick({ for: rangeKey, characters: found.characters.slice(0, found.maxCharacters).map((c) => c.slug), place: found.place?.slug ?? null });
  }, [found, rangeKey, sheetPick?.for]);
  const chosenSheets = sheetPick && sheetPick.for === rangeKey && found
    ? { characters: sheetPick.characters.filter((s) => found.characters.some((c) => c.slug === s)), place: sheetPick.place === found.place?.slug ? sheetPick.place : null }
    : { characters: [], place: null };
  const widen = (side: 'start' | 'end', d: 1 | -1) => {
    const all = ids.current;
    const i = all.indexOf(range[side]);
    const j = i + d;
    if (j < 0 || j >= all.length) return;
    const next = { ...range, [side]: all[j] };
    if (next.end < next.start) return;
    if (all.filter((x) => x >= next.start && x <= next.end).length > (status?.maxBlocks ?? 8)) return;
    setRange(next);
  };
  const label = (i: number) => document.getElementById(`c${range.chapter}-b${i}`)?.getAttribute('data-label');
  const from = label(range.start), to = label(range.end);
  const where = from ? (from === to || !to ? `¶ ${from}` : `¶ ${from}–${to}`) : `Chapter ${range.chapter}`;

  const startConsent = async () => {
    const res = await authFetch('/api/consent');
    if (res.ok) setConsent(((await res.json()) as { wording: Wording }).wording);
  };
  const agree = async () => {
    const res = await authFetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha256: consent?.sha256 }) });
    if (res.ok) {
      setConsent(null);
      void refresh();
    } else setNote('Could not record your agreement');
  };

  const generate = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await authFetch('/api/images/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chapter: range.chapter, start: range.start, end: range.end, prompt, style, characters, place: placeSheet, reference: reference && withViews, sheets: chosenSheets }),
      });
      const out = (await res.json().catch(() => ({}))) as { ticket?: string; image?: string; error?: string; left?: number };
      if (res.ok && out.ticket && out.image) {
        setDraft({ ticket: out.ticket, image: out.image });
        setMadeWith({ style, characters, reference: reference && withViews });
        setView('draft');
        await saveDraft({ key: draftKey(range), ...range, prompt, style, characters, place: placeSheet, reference: reference && withViews, sheets: chosenSheets, ticket: out.ticket, image: out.image, savedAt: new Date().toISOString() });
      } else setNote(out.error ?? 'Could not make the image');
    } catch {
      setNote('No connection. Try again.');
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const publish = async () => {
    if (!draft) return;
    const res = await authFetch('/api/images/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: draft.ticket, image: draft.image, nameProof: webNameProof() }) });
    const out = (await res.json().catch(() => ({}))) as { page?: string; error?: string };
    if (!res.ok || !out.page) throw new Error(out.error ?? 'Could not publish');
    await deleteDraft(draftKey(range));
    setPublished(out.page);
    setView('compose');
  };

  const chosen = status?.styles.find((s) => s.id === style) ?? null;
  const picks = status?.picks ?? { styles: [], characters: [], places: [] };
  const charChips = picks.characters.filter((c) => characters.includes(c.versionId));
  const placeChip = picks.places.find((c) => c.versionId === placeSheet) ?? null;
  const sheetChips = [...charChips, ...(placeChip ? [placeChip] : [])];
  const withViews = sheetChips.some((c) => c.views > 0);
  const useEdit = reference && withViews && Boolean(status?.editModel);
  const shownModel = useEdit && status?.editModel ? status.editModel : status?.model;
  const made = madeWith ?? { style, characters, reference: useEdit };
  // The styles and sheets the draft was made with, read from its own signed record (what publishing will use).
  const madeChips = draft ? ticketDesigns(draft.ticket) : [];
  const madeSheets = draft ? ticketSheets(draft.ticket) : null;
  // A picked sheet for a character replaces this edition's shorthand for them.
  const pickedFor = new Set(charChips.map((c) => c.entity));
  const madeStyle = status?.styles.find((s) => s.id === made.style) ?? null;
  // A wallet account's price for this Generate, as it will be charged (Terms 6a): a picked sheet's pictures sent as
  // references raise it (owner, 2026-10-23), counted as the server counts them (src/lib/images/price.ts).
  const references = useEdit ? referenceCount(sheetChips.map((c) => c.views)) : 0;
  const shownPrice = status?.prepaid ? (status.prepaid.pricesUsd?.[references] ?? status.prepaid.priceUsd) : null;
  const left = status?.prepaid && shownPrice !== null ? paysFor(status.prepaid.balanceUsd, shownPrice) : (status?.left ?? 0);
  const ready = signedIn && status?.eligible !== false && status?.ready && status.consented;
  const showDraft = view === 'draft' && draft !== null && !published;
  const previewing = step === 'preview' || step === 'publishing';
  const by = auth.kind === 'signed-in' ? (auth.username ? `@${auth.username}` : `FID ${auth.fid}`) : wallet ? wallet.short : 'you';
  // A wallet account sees the price it is charged on the button itself (Terms 6a: "at the price shown when you start it").
  const count = (n: number) => (status?.prepaid && shownPrice !== null ? `${W.prepaid.priceOnButton(exactDollars(shownPrice))} · ${W.prepaid.balance(status.prepaid.balanceUsd.toFixed(2), n)}` : `${n} of ${status?.perDay ?? 0} left today`);
  return (
    <div className="sheet-overlay ic-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className="recipe-sheet image-composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="ic-head">
          <p id="composer-title" className="ic-title">
            Add an image <span className="ic-tag">· {status?.label ?? 'Trial'}</span>
          </p>
          <button type="button" className="sheet-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {showDraft && <p className="ic-private">{W.draft.strip}</p>}

        <div className={`ic-body${showDraft && previewing ? ' is-hidden' : ''}`}>
          {!showDraft && (
            <>
              <section className="ic-passage" aria-label="The passage">
                <p className="ic-label">
                  Chapter {range.chapter} · {where} · {passage.length} {passage.length === 1 ? 'block' : 'blocks'}
                </p>
                <div id="ic-text" className={`ic-text${whole ? ' is-whole' : ''}`}>
                  {passage.map((i) => (
                    <p key={i}>{document.getElementById(`c${range.chapter}-b${i}`)?.textContent?.trim()}</p>
                  ))}
                </div>
                <div className="ic-range">
                  <button type="button" className="ic-more" aria-expanded={whole} aria-controls="ic-text" onClick={() => setWhole(!whole)}>
                    {whole ? W.composer.showLess : W.composer.showWhole}
                  </button>
                  <span className="ic-range-steps">
                    <button type="button" onClick={() => widen('start', -1)}>+ before</button>
                    <button type="button" onClick={() => widen('start', 1)} disabled={range.start === range.end}>− first</button>
                    <button type="button" onClick={() => widen('end', -1)} disabled={range.start === range.end}>− last</button>
                    <button type="button" onClick={() => widen('end', 1)}>+ after</button>
                  </span>
                </div>
              </section>
              <p className="ic-note">The book&apos;s text is shown to help you write. It is never sent to a model.</p>
              {found && !published && (
                <InPassage
                  found={found}
                  chosen={chosenSheets}
                  pickedFor={pickedFor}
                  onChange={(next) => setSheetPick({ for: rangeKey, ...next })}
                />
              )}

              {published ? (
                <p className="ic-done">
                  Published. <Link href={published}>See it</Link>
                </p>
              ) : !signedIn ? (
                <div className="ic-gate">
                  <p>Sign in to make an image.</p>
                  {/* On the website the wallet comes first and is the solid button, Farcaster second and outlined
                      (owner, 2026-10-16 and 2026-10-21). In the Farcaster app there is no wallet button: Farcaster stays as it was. */}
                  {walletFirst && <WalletSignInButton className="ic-primary" />}
                  <SignInButton className={walletFirst ? 'ic-secondary' : undefined} />
                  {auth.kind === 'signed-out' && !auth.inApp && <p className="ic-note">{W.signIn.farcasterNote(IMAGES.generationsPerDay)}</p>}
                </div>
              ) : !status ? (
                <p className="ic-note">…</p>
              ) : status.eligible === false ? (
                <p className="ic-gate" role="status">{status.refusal ?? 'Image making is not open to this account.'}</p>
              ) : !status.ready ? (
                <p className="ic-gate">Making images isn&apos;t set up on this deployment yet.</p>
              ) : status.prepaid && !status.consented ? (
                <>
                  <WalletPanel onChange={() => void refresh()} />
                  <div className="ic-gate">
                    {/* Drafted by the coding agent (2026-10-18): once paid, this is the next step. */}
                    <p className={status.prepaid.balanceUsd > 0 ? 'ic-next' : undefined}>{status.prepaid.balanceUsd > 0 ? 'Next: agree to how your words are published.' : 'Before your first image: how your prompt is published.'}</p>
                    <button type="button" className="ic-primary" onClick={startConsent}>
                      Read and agree
                    </button>
                  </div>
                </>
              ) : !status.consented ? (
                <div className="ic-gate">
                  <p>Before your first image: how your prompt is published.</p>
                  <button type="button" className="ic-primary" onClick={startConsent}>
                    Read and agree
                  </button>
                </div>
              ) : (
                <>
                  {status.prepaid && <WalletPanel onChange={() => void refresh()} />}
                  <div className="ic-prompt">
                    <PublishedTextField id="ic-prompt" label={W.composer.promptLabel} value={prompt} onChange={setPrompt} rows={4} maxLength={600} />
                    <span className="ic-count" aria-hidden="true">
                      {prompt.length} / 600
                    </span>
                  </div>
                  <p className="ic-note">Your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make the image. It becomes public only if you publish.</p>
                  {!status.invited && !status.prepaid && <p className="ic-note">At Generate, your Farcaster ID (and nothing else) is sent to Neynar to check your account&apos;s score, once a day.</p>}

                  {/* Always a style (owner, 2026-10-14): no "None". */}
                  <fieldset className="ic-style">
                    <legend>Style</legend>
                    {status.styles.map((s) => (
                      <label key={s.id}>
                        <input type="radio" name="ic-style" checked={style === s.id} onChange={() => setStyle(s.id)} /> {s.name}{' '}
                        {s.by ? `· ${s.by}` : "(the project's starting style)"}
                        {picks.styles.some((c) => c.versionId === s.id) && <span className="ic-chip-key"> · {D.yourPick}</span>}
                      </label>
                    ))}
                    {chosen && <p className="ic-style-text">{chosen.drafted ? D.addedDrafted : D.added} {chosen.text}</p>}
                  </fieldset>

                  {picks.characters.length > 0 && (
                    <fieldset className="ic-style ic-chars">
                      <legend>{D.label}</legend>
                      {picks.characters.map((c) => (
                        <label key={c.versionId}>
                          <input
                            type="checkbox"
                            checked={characters.includes(c.versionId)}
                            onChange={(e) => setCharacters(e.target.checked ? [...characters, c.versionId].slice(0, 3) : characters.filter((x) => x !== c.versionId))}
                          />{' '}
                          <span className="ic-chip-key">Character</span> {chipName(c)}
                        </label>
                      ))}
                      {charChips.map((c) => (
                        <p key={c.versionId} className="ic-style-text">
                          {D.added} {c.text}
                        </p>
                      ))}
                    </fieldset>
                  )}
                  {picks.places.length > 0 && (
                    <fieldset className="ic-style ic-chars">
                      <legend>{D.placeLabel}</legend>
                      <label>
                        <input type="radio" name="ic-place" checked={placeSheet === null} onChange={() => setPlaceSheet(null)} /> {D.placeNone}
                      </label>
                      {picks.places.map((c) => (
                        <label key={c.versionId}>
                          <input type="radio" name="ic-place" checked={placeSheet === c.versionId} onChange={() => setPlaceSheet(c.versionId)} />{' '}
                          <span className="ic-chip-key">Setting</span> {chipName(c)}
                        </label>
                      ))}
                      {placeChip && (
                        <p className="ic-style-text">
                          {D.added} {placeChip.text}
                        </p>
                      )}
                    </fieldset>
                  )}
                  {withViews && status.editModel && (
                    <label className="ic-reference">
                      <input type="checkbox" checked={reference} onChange={(e) => setReference(e.target.checked)} />{' '}
                      {D.reference(sheetChips.filter((c) => c.views > 0).map((c) => c.entity).join(', '))}
                      {status.prepaid?.pricesUsd && ` · ${D.referencePrice(exactDollars(status.prepaid.pricesUsd[referenceCount(sheetChips.map((c) => c.views))]))}`}
                    </label>
                  )}
                  {/* Picks are open to everyone signed in, wallet accounts too (owner, 2026-10-19 and 2026-10-23). */}
                  <p className="ic-note">
                    <Link href="/images/picks">{picks.styles.length || picks.characters.length || picks.places.length ? D.changePicks : D.noPicks}</Link>
                  </p>

                  <div className="ic-rules">
                    <p className="ic-label">{W.composer.rulesLabel}</p>
                    <p>{status.rules}</p>
                  </div>
                </>
              )}
            </>
          )}

          {showDraft && draft && (
            <section className="ic-draft" aria-label="Draft">
              <div className="ic-draft-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.image} alt={`AI-generated draft: ${prompt.split(/(?<=[.!?])\s/)[0]}`} width={1024} height={576} />
                {busy && <span className="ic-veil">Making it…</span>}
              </div>
              <p className="ic-caption">
                <AiLabel kind="image" text={AI_LABEL.imageBy(by)} view={readerImageView({ versionId: null, by, prompt, chapter: range.chapter, where })} />
              </p>
              <p className="ic-explain">{W.draft.kept(IMAGES.ticketHours)}</p>
              <button type="button" className="ic-link" onClick={() => setView('compose')}>
                {W.draft.editPrompt}
              </button>
            </section>
          )}
          {note && (
            <p className="ic-error" role="status">
              {note}
            </p>
          )}
          <p className="as-draft ic-draftline">{W.draftLine}</p>
        </div>

        {ready && !published && !showDraft && (
          <div className="ic-bar">
            {draft && (
              <button type="button" className="ic-secondary" onClick={() => setView('draft')}>
                {W.draft.back}
              </button>
            )}
            <button type="button" className="ic-primary ic-generate" onClick={generate} disabled={busy || !prompt.trim() || left <= 0 || !style}>
              {busy ? 'Making it…' : draft ? 'Generate again' : 'Generate'} · {count(left)}
            </button>
            <p className="ic-model">
              {shownModel?.name} · open weights, {shownModel?.licence} · runs on {shownModel?.host}
            </p>
          </div>
        )}
        {showDraft && draft && status?.consented && (
          <div className={`ic-bar ic-bar-two${previewing ? ' is-preview' : ''}`}>
            {!previewing && (
              <button type="button" className="ic-secondary" onClick={generate} disabled={busy || !prompt.trim() || left <= 0 || !style}>
                {busy ? 'Making it…' : 'Generate again'} · {status?.prepaid ? count(left) : W.draft.left(left)}
              </button>
            )}
            <PublishFlow
              onStep={setStep}
              disabled={busy}
              preview={
                <figure className="ic-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.image} alt="" width={1024} height={576} />
                  <figcaption className="block-caption">
                    Chapter {range.chapter} · {where} · <AiLabel kind="image" text={AI_LABEL.imageBy(by)} view={readerImageView({ versionId: null, by, prompt, chapter: range.chapter, where })} />
                  </figcaption>
                  <p className="ic-label">{W.preview.promptLabel}</p>
                  <p className="ic-prompt-preview">{prompt}</p>
                  {madeStyle && (
                    <>
                      <p className="ic-label">Style added (text drafted by the coding agent, a closed model)</p>
                      <p className="ic-prompt-preview ic-style-added">{madeStyle.text}</p>
                    </>
                  )}
                  {madeChips.map((c) => (
                    <div key={c.versionId}>
                      <p className="ic-label">
                        {W.designs.preview.added(chipName(c))}
                        {c.drafted ? ' (model-drafted)' : ''}
                      </p>
                      <p className="ic-prompt-preview ic-style-added">{c.text}</p>
                    </div>
                  ))}
                  {madeSheets?.added.map((a) => (
                    <div key={`${a.kind}-${a.slug}`}>
                      <p className="ic-label">
                        {W.designs.preview.added(placeTitle(a.name))} ({SH.shorthandTitle.toLowerCase()}, model-drafted)
                      </p>
                      <p className="ic-prompt-preview ic-style-added">{a.text}</p>
                    </div>
                  ))}
                  {made.reference && <p className="ic-label">{D.referenceModel} {status?.editModel?.name}</p>}
                </figure>
              }
              onPublish={publish}
            />
          </div>
        )}
        {consent && <ConsentScreen wording={consent} name={null} wallet={auth.kind !== 'signed-in' ? (wallet?.short ?? null) : null} onAgree={agree} onCancel={() => setConsent(null)} error={null} />}
      </div>
    </div>
  );
}
