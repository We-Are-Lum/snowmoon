/**
 * A version in a link (spike): /minpentai?version=<base64url of its sorted JSON>. The page would
 * read it back through check() before playing; a link that fails the check plays nothing. Typical
 * versions come to 400 to 900 characters. Once a version is registered, its ruleset ID makes a
 * short link instead (/minpentai/v/<id>, read from wherever manifests are kept).
 */
import { stableJson } from './manifest';
import { check, type Version } from './schema';

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export function versionLink(v: Version, origin = 'https://snowmoon.party'): string {
  return `${origin}/minpentai?version=${b64url(stableJson(v))}`;
}

/** The version a link carries, or the reasons it is refused. */
export function readVersionLink(url: string): { version: Version } | { refused: string[] } {
  try {
    const raw = new URL(url).searchParams.get('version');
    if (!raw) return { refused: ['no version in the link'] };
    if (raw.length > 4000) return { refused: ['the version is too long'] };
    const v = JSON.parse(unb64url(raw)) as Version;
    const errs = check(v);
    return errs.length ? { refused: errs } : { version: v };
  } catch {
    return { refused: ['the link is damaged'] };
  }
}
