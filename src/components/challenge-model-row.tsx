'use client';

import { useRef, useState } from 'react';
import { CLOSED_PROVIDERS, type ClosedProvider } from '~/lib/config';
import { MODEL_WORDING as W, resetLocal } from '~/lib/challenge/model-wording';
import type { ModelRowEntry } from '~/lib/challenge/models';
import { answerNotice, browserStore, mayPick, noticeFor } from '~/lib/images/model-notice';
import { ModelNotice } from './model-picker';

/**
 * The challenge Model row's state (branch challenge-models): what the remix screen's Model row plugs into. The list is
 * the server's (GET /api/challenge/make's `models`: only what this visitor is offered, the open default first). A
 * closed model is picked only once its maker's notice is answered and, the first time on this device, the 18+ box
 * ticked (src/lib/images/model-notice.ts: kept on the device). The POST then carries `model` and, for a closed model,
 * `notice: { version, adult: true }`, without which the server refuses it. The screen decides how the row looks
 * (branch challenge-simple); `notice` is the maker's notice to show while one is pending.
 */
export function useChallengeModel<T extends ModelRowEntry>(models: readonly T[] | undefined, modelsNote: string | null = null) {
  const list = models?.length ? models : null;
  const [id, setId] = useState<string | null>(null);
  const chosen = list?.find((m) => m.id === id) ?? list?.[0] ?? null;
  const seen = useRef(new Set<string>());
  const [pending, setPending] = useState<{ pick: T; askAdult: boolean } | null>(null);
  const [adultTicked, setAdultTicked] = useState(false);

  const pick = (m: T) => {
    if (m.open) return setId(m.id);
    const n = noticeFor(m.maker, browserStore(), seen.current);
    if (!n.show) return setId(m.id);
    setPending({ pick: m, askAdult: n.askAdult });
  };
  const answer = (button: 'ok' | 'never') => {
    if (!pending) return;
    if (!answerNotice(pending.pick.maker, button, adultTicked, browserStore(), seen.current)) return;
    setId(pending.pick.id);
    setPending(null);
  };
  const ready = !chosen || chosen.open || mayPick(chosen.maker, browserStore(), seen.current);
  /** What the make request adds to its body. */
  const body = (): { model?: string; notice?: { version: number; adult: true } } => {
    if (!chosen) return {};
    if (chosen.open) return { model: chosen.id };
    const version = CLOSED_PROVIDERS[chosen.maker as ClosedProvider]?.noticeVersion;
    return { model: chosen.id, notice: { version, adult: true } };
  };
  const notice = pending ? <ModelNotice maker={pending.pick.maker} askAdult={pending.askAdult} adultTicked={adultTicked} onTick={setAdultTicked} onAnswer={answer} /> : null;
  /** One line under a model's name: its terms, the price, and for a closed one its maker's label and that it uses 3. */
  const meta = (m: ModelRowEntry) => (m.open ? null : (W.closedLine[m.maker] ?? null));
  /** Today's free pictures left (from the server), when fewer than a closed picture needs: the line saying so. */
  const tooFew = (left: number | null | undefined) => (chosen && !chosen.open && typeof left === 'number' && left < chosen.countsAs ? W.tooFew(left, resetLocal()) : null);
  /** For a wallet account: the line shown in place of the closed models ("Closed models need a Farcaster, Lens or Bluesky sign-in."). */
  const note = modelsNote;
  return { list, chosen, pick, ready, body, notice, meta, note, tooFew, W };
}
