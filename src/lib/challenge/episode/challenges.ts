import { CHALLENGE, EPISODE } from '../../config';
import { phase } from '../rules';
import { episodePhase } from './rules';
import { CHALLENGES_WORDING as C, EPISODE_WORDING as W } from './wording';

/**
 * The list of challenges on /challenge (owner, 2026-11-24, answer 6: "After 29 Nov, /challenge becomes a list of
 * challenges, open ones first, then past ones"). Open (or announced, before it opens) first, then past ones, each group
 * by closing date, the latest first: by the dates in config only, never by anything about entries (P5). A challenge whose switch
 * is off isn't listed.
 */
export type ChallengeItem = { id: string; title: string; line: string; when: string; href: string; state: 'open' | 'before' | 'closed'; closes: string };

export function challengeItems(now: Date = new Date(), pub = { remix: CHALLENGE.public as boolean, episode: EPISODE.public as boolean }): { open: ChallengeItem[]; past: ChallengeItem[] } {
  const all: ChallengeItem[] = [];
  if (pub.remix) all.push({ id: CHALLENGE.id, title: C.remixTitle, line: C.remixLine, when: C.remixWhen(), href: '/challenge/remix', state: phase(now), closes: CHALLENGE.dates.closes });
  if (pub.episode) all.push({ id: EPISODE.id, title: W.title, line: C.episodeLine, when: C.episodeWhen(), href: '/challenge/episode-1', state: episodePhase(now), closes: EPISODE.dates.closes });
  // By its closing date, the latest first: time order, from config.
  const newestFirst = (a: ChallengeItem, b: ChallengeItem) => Date.parse(b.closes) - Date.parse(a.closes);
  return { open: all.filter((c) => c.state !== 'closed').sort(newestFirst), past: all.filter((c) => c.state === 'closed').sort(newestFirst) };
}

/** Whether /challenge shows the list: once the remix challenge has closed (before that it stays the remix home). */
export const showChallengeList = (now: Date = new Date()) => phase(now) === 'closed';
