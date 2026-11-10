import 'server-only';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { checkWords } from '../images/paid';
import { BACKSTORY_WORDING, storedBackstory, type StoredBackstory } from './backstory';

/**
 * Backstories (owner, 2026-11-09): new challenge pictures only. A backstory goes in the new version's body at publish
 * (src/app/api/images/publish/route.ts), so it needs no table and no migration; a picture already published has none
 * (element_versions is append-only, and the owner chose not to add a table in launch week). Hiding follows the picture.
 */
type Sql = postgres.Sql;

/** The prompt check on a backstory: blocked names, then the same guard with the larger budget (1,200 tokens). */
export const checkBackstory = (sql: Sql, request: Request, text: string) =>
  checkWords(sql, request, text, { maxTokens: IMAGES.designs.guardMaxTokens, refused: BACKSTORY_WORDING.refused });

/** A version's backstory, from its body; null when it has none. */
export const backstoryOf = (body: unknown): StoredBackstory | null => storedBackstory((body as { backstory?: unknown } | null | undefined)?.backstory);
