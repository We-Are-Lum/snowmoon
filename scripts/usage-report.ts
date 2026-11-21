/**
 * Usage report (owner, 2026-11-17): aggregate counts from the live database, for each of the last 14 UTC days, the
 * 14 days together and all time. Read-only and adds no tracking: it reads only what the site already keeps, in one
 * read-only transaction as studio_writer (STUDIO_DATABASE_URL from .env.local; never `vercel env pull`).
 *
 *   npm run usage            (or: npm run usage -- --json)
 *
 * Only totals leave the database: every row is (day, category, number). A category is a fixed label, a model id, a
 * network, a pool or a challenge character, never a person (no FID, name, handle, address, DID, prompt, question or
 * backstory text). A person column appears only inside count(distinct …) or inside a subquery that is aggregated before
 * it leaves the database. checkDefs() below refuses any count whose category names anything else, and checkRows()
 * refuses any answer whose category isn't a short plain label.
 *
 * Days are UTC throughout (the cost tables keep only a UTC date). Today is a partial day. A count whose table or
 * column isn't on this database (an unmerged branch's migration) is left out and listed under "Not on this database".
 */
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { CHALLENGE, IMAGES, WORK_ID } from '../src/lib/config';
import { CLOSED_MODEL_IDS, SHEET_MODELS } from '../src/lib/images/sheet-models';

const DAYS = 14;
const JSON_OUT = process.argv.includes('--json');

type Unit = 'count' | 'usd';
interface Def {
  id: string;
  section: string;
  unit: Unit;
  /** The category: SQL made only of string literals and CATEGORY columns. */
  key: string;
  /** The aggregate (AGGREGATE). A distinct count's 14-day and all-time columns are distinct over that span, not sums. */
  n: string;
  /** The rows: a table (or subquery) with its where clause. */
  from: string;
  /** A timestamptz column (its UTC day) or a date column already in UTC. */
  at?: string;
  day?: string;
  /** Tables (schema.table) or columns (schema.table.column) the count needs. */
  needs?: string[];
  /** The line shown when there are no rows at all (required unless the category is one literal). */
  none?: string;
  /** The category is a model id: shown as "<models>: <id> (open|closed)", with a total line for each class. */
  models?: string;
}

/** The only columns a category may name. `name` is studio.entities.name (a book character's name). */
const CATEGORY = new Set(['kind', 'model', 'pool', 'network', 'character', 'outcome', 'name', 'fromkind']);
/** SQL words a category may use besides those columns. */
const KEY_WORDS = new Set(['case', 'when', 'then', 'else', 'end', 'coalesce', 'initcap', 'text', 'not', 'and', 'or', 'is', 'null', 'true', 'false', 'params', 'challenge']);
/** The JSON paths a category may read from a recipe's params: the challenge's character and what it was remixed from. */
const JSON_PATHS = [`r.params->'challenge'->>'character'`, `r.params->'challenge'->>'fromKind'`];
const AGGREGATE = /^(count\(\*\)|count\(distinct [a-z_.]+\)|sum\([a-z_.]+\))$/;

const ch = CHALLENGE.id;
if (!/^[a-z0-9-]{1,40}$/.test(ch) || !/^[a-z0-9-]{1,40}$/.test(WORK_ID)) throw new Error('bad challenge or work id');
const SLUG = (expr: string) => `case when ${expr} ~ '^[a-z0-9-]{1,40}$' then ${expr} else 'other' end`;
const CH_CHAR = SLUG(`r.params->'challenge'->>'character'`);
const CH_FROM = SLUG(`r.params->'challenge'->>'fromKind'`);

const PICTURES = `studio.elements e join studio.element_versions v on v.element_id = e.id and v.version_no = 1 join studio.recipes r on r.id = v.recipe_id
  where e.element_type = 'image' and e.work_id = '${WORK_ID}' and e.status = 'published'`;
const SHEET_REMIXES = `studio.element_versions v join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
  where e.element_type = 'design' and e.status = 'published' and e.work_id = '${WORK_ID}' and en.kind = 'character' and v.version_no = 1
    and exists (select 1 from studio.links l where l.from_version_id = v.id and l.kind = 'remixed_from')`;
const SENT = `studio.challenge_bounty_claims where sent_at is not null`;

const S = {
  assistant: 'Assistant',
  accounts: 'Accounts (sign-ins)',
  pictures: 'Pictures',
  challenge: `Challenge (${ch})`,
  posts: 'Shares and posts',
};

export const DEFS: Def[] = [
  // Assistant.
  { id: 'questions', section: S.assistant, unit: 'count', key: `'Questions asked'`, n: 'count(*)', from: `studio.chat_calls where kind = 'ask'`, at: 'at' },
  { id: 'askers', section: S.assistant, unit: 'count', key: `'Distinct askers'`, n: 'count(distinct fid)', from: `studio.chat_calls where kind = 'ask'`, at: 'at' },
  { id: 'chat_spend', section: S.assistant, unit: 'usd', key: `'Spend, all kinds (USD)'`, n: 'sum(cost_usd)', from: 'studio.chat_costs where true', day: 'day' },
  { id: 'chat_spend_kind', section: S.assistant, unit: 'usd', key: `'Spend: ' || kind || ' (USD)'`, n: 'sum(cost_usd)', from: 'studio.chat_costs where true', day: 'day', none: 'Spend by kind (USD)' },

  // Accounts. No sign-in log exists: these are the rows each sign-in leaves.
  { id: 'farcaster', section: S.accounts, unit: 'count', key: `'Farcaster: people whose latest recorded sign-in was that day (not new)'`, n: 'count(*)', from: '(select person, max(seen_at) as at from studio.account_names group by person) x where true', at: 'x.at' },
  { id: 'social_new', section: S.accounts, unit: 'count', key: `initcap(kind) || ': new accounts (first sign-in)'`, n: 'count(*)', from: 'studio.social_accounts where true', at: 'created_at', needs: ['studio.social_accounts'], none: 'Lens and Bluesky: new accounts (first sign-in)' },
  { id: 'wallet_new', section: S.accounts, unit: 'count', key: `'Wallet: new accounts (first sign-in)'`, n: 'count(*)', from: 'studio.wallet_accounts where true', at: 'created_at' },

  // Pictures: made (the cost tables: one call per picture the model returned and the safety checker passed).
  { id: 'made', section: S.pictures, unit: 'count', key: 'model', n: 'sum(calls)', from: `studio.image_costs where kind = 'image' and verdict = 'ok'`, day: 'day', models: 'Pictures made', none: 'Pictures made (none recorded)' },
  { id: 'made_frames', section: S.pictures, unit: 'count', key: 'model', n: 'sum(calls)', from: `studio.remix_costs where kind = 'image' and verdict = 'ok'`, day: 'day', models: 'Remix frames made', none: 'Remix frames made (none recorded)' },
  { id: 'generates_pool', section: S.pictures, unit: 'count', key: `'Generates counted in the daily limit, pool: ' || pool`, n: 'count(*)', from: 'studio.image_asks where true', at: 'at', needs: ['studio.image_asks.pool'], none: 'Generates counted in the daily limit, by pool' },
  { id: 'given_back', section: S.pictures, unit: 'count', key: `'Generates given back to the daily limit'`, n: 'count(*)', from: 'studio.image_asks_back where true', at: 'at', needs: ['studio.image_asks_back'] },
  { id: 'makers', section: S.pictures, unit: 'count', key: `'Distinct people pressing Generate'`, n: 'count(distinct fid)', from: 'studio.image_asks where true', at: 'at' },
  // Published (still published now: hidden ones are left out).
  { id: 'pub_pictures', section: S.pictures, unit: 'count', key: `coalesce(r.model, 'no model recorded')`, n: 'count(*)', from: `${PICTURES} and not (r.params ? 'challenge')`, at: 'e.created_at', models: 'Published pictures (not challenge)', none: 'Published pictures (not challenge) (none recorded)' },
  { id: 'pub_challenge', section: S.pictures, unit: 'count', key: `coalesce(r.model, 'no model recorded')`, n: 'count(*)', from: `${PICTURES} and r.params ? 'challenge'`, at: 'e.created_at', models: 'Published challenge pictures', none: 'Published challenge pictures (none recorded)' },
  { id: 'pub_frames', section: S.pictures, unit: 'count', key: `'Published Remix frames (scenes, not hidden)'`, n: 'count(*)', from: 'studio.remix_frames where not hidden', at: 'created_at' },
  { id: 'remix_pictures', section: S.pictures, unit: 'count', key: `'Remixes published, challenge pictures: ' || ${CH_CHAR} || ' (from a ' || ${CH_FROM} || ')'`, n: 'count(*)', from: `${PICTURES} and r.params ? 'challenge'`, at: 'e.created_at', none: 'Remixes published, challenge pictures, by character' },
  { id: 'remix_sheets', section: S.pictures, unit: 'count', key: `'Remixes published, character sheets: ' || en.name`, n: 'count(*)', from: SHEET_REMIXES, at: 'v.created_at', none: 'Remixes published, character sheets, by character' },

  // Challenge.
  { id: 'submitted', section: S.challenge, unit: 'count', key: `'Entries submitted: ' || character`, n: 'count(*)', from: `studio.challenge_marks where challenge = '${ch}'`, at: 'marked_at', needs: ['studio.challenge_marks'], none: 'Entries submitted, by character' },
  { id: 'withdrawn', section: S.challenge, unit: 'count', key: `'Entries withdrawn: ' || character`, n: 'count(*)', from: `studio.challenge_marks where challenge = '${ch}' and withdrawn_at is not null`, at: 'withdrawn_at', needs: ['studio.challenge_marks.withdrawn_at'], none: 'Entries withdrawn, by character' },
  { id: 'standing', section: S.challenge, unit: 'count', key: `'Entries standing (not withdrawn, eligible at publish): ' || m.character`, n: 'count(*)', from: `studio.challenge_marks m join studio.challenge_eligibility ce on ce.version_id = m.version_id where m.challenge = '${ch}' and m.withdrawn_at is null and ce.eligible`, at: 'm.marked_at', needs: ['studio.challenge_marks.withdrawn_at', 'studio.challenge_eligibility'], none: 'Entries standing (not withdrawn, eligible at publish), by character' },
  { id: 'submitters', section: S.challenge, unit: 'count', key: `'Distinct people submitting'`, n: 'count(distinct fid)', from: `studio.challenge_marks where challenge = '${ch}'`, at: 'marked_at', needs: ['studio.challenge_marks'] },
  { id: 'backstory_publish', section: S.challenge, unit: 'count', key: `'Challenge pictures published with a backstory: ' || ${CH_CHAR}`, n: 'count(*)', from: `${PICTURES} and r.params ? 'challenge' and v.body ? 'backstory'`, at: 'e.created_at', none: 'Challenge pictures published with a backstory, by character' },
  { id: 'backstory_added', section: S.challenge, unit: 'count', key: `'Backstories added after publish'`, n: 'count(*)', from: 'studio.challenge_backstories where true', at: 'added_at', needs: ['studio.challenge_backstories'] },
  { id: 'claims_prepared', section: S.challenge, unit: 'count', key: `'Backstory claims prepared (pinned)'`, n: 'count(*)', from: 'studio.challenge_bounty_claims where true', at: 'pinned_at', needs: ['studio.challenge_bounty_claims'] },
  { id: 'claims_sent', section: S.challenge, unit: 'count', key: `'Backstory claims sent'`, n: 'count(*)', from: SENT, at: 'sent_at', needs: ['studio.challenge_bounty_claims'] },
  { id: 'claims_senders', section: S.challenge, unit: 'count', key: `'Distinct people sending claims'`, n: 'count(distinct fid)', from: SENT, at: 'sent_at', needs: ['studio.challenge_bounty_claims'] },
  { id: 'claims_outcome', section: S.challenge, unit: 'count', key: `'Backstory claims ' || outcome`, n: 'count(*)', from: 'studio.challenge_bounty_claims where outcome is not null', at: 'confirmed_at', needs: ['studio.challenge_bounty_claims'], none: 'Backstory claims confirmed or reverted' },

  // Shares and posts: only the posts people link to a challenge picture ("Add where you posted it", Submit).
  { id: 'posts', section: S.posts, unit: 'count', key: `'Posts linked to a picture: ' || network`, n: 'count(*)', from: 'studio.version_posts where true', at: 'added_at', needs: ['studio.version_posts'], none: 'Posts linked to a picture, by network' },
];

/** What is wrong with a count's category or aggregate, if anything. */
export function checkDefs(defs: Def[]): string[] {
  const p: string[] = [];
  for (const d of defs) {
    let k = d.key.replace(/case when (.+?) ~ '\^\[a-z0-9-\]\{1,40\}\$' then \1 else 'other' end/g, '$1');
    for (const j of JSON_PATHS) k = k.split(j).join(' ');
    const words = k.replace(/'[^']*'/g, ' ').match(/[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?/gi) ?? [];
    for (const w of words) {
      const col = w.toLowerCase().split('.').pop()!;
      if (!CATEGORY.has(col) && !KEY_WORDS.has(col)) p.push(`${d.id}: its category names ${w}`);
    }
    if (/params/.test(k)) p.push(`${d.id}: its category reads params outside the allowed paths`);
    if (!AGGREGATE.test(d.n)) p.push(`${d.id}: ${d.n} is not an allowed aggregate`);
    if (Boolean(d.at) === Boolean(d.day)) p.push(`${d.id}: needs exactly one of at/day`);
    if (!/^'[^']*'$/.test(d.key) && !d.none) p.push(`${d.id}: needs a "none" line`);
  }
  return p;
}

const dayExpr = (d: Def) => (d.at ? `((${d.at}) at time zone 'utc')::date` : `(${d.day})::date`);

/** Rows of (day, key, n, total) for the window, a day's row and the 14-day total for each key. $1 is the first day. */
const windowSql = (d: Def) => {
  const day = dayExpr(d);
  const key = `(${d.key})::text`;
  return `select ${day}::text as day, ${key} as key, coalesce((${d.n})::float8, 0) as n, grouping(${day}) = 1 as total
    from ${d.from} and ${day} >= $1::date
    group by grouping sets ((${day}, ${key}), (${key}))`;
};
const allTimeSql = (d: Def) => `select (${d.key})::text as key, coalesce((${d.n})::float8, 0) as n from ${d.from} group by 1`;

export interface Line { section: string; key: string; unit: Unit; distinct: boolean; byDay: Record<string, number>; window: number; allTime: number }

const OPEN_IDS = new Set<string>([IMAGES.model.id, IMAGES.editModel.id, ...SHEET_MODELS.filter((m) => m.open).flatMap((m) => [m.front.id, m.views.id])]);
const CLOSED_IDS = new Set<string>(CLOSED_MODEL_IDS);
const modelClass = (id: string) => (CLOSED_IDS.has(id) ? 'closed' : OPEN_IDS.has(id) ? 'open' : 'not classified');

/** A category may only be a short plain label: never anything that looks like a FID, an address, a DID or free text. */
export function checkRows(id: string, keys: string[]) {
  for (const k of keys) {
    if (k.length > 90 || !/^[A-Za-z0-9 .:,()'/_+-]+$/.test(k) || /0x[0-9a-f]{6}|did:|\d{5,}/i.test(k)) {
      throw new Error(`${id}: a category isn't a plain label (refused, nothing printed)`);
    }
  }
}

/**
 * Chapter pictures (owner, 2026-11-18): the admin redos in studio.chapter_picture_versions (0042), draft or kept, with
 * their JPEG bytes in the row; rows are never deleted, so this is the draft storage. All time, totals only: no job,
 * admin, prompt or picture leaves the database. Null when the tables aren't on this database (an older one).
 * Since 2026-11-20 also the pictures admins added while reading (studio.chapter_picture_additions, 0043), by where the
 * latest decision in studio.chapter_picture_decisions leaves each: shown (it has a version), taken off (no version, but
 * one was shown before), or never kept (no decision ever had a version). `added` is null when 0043 isn't there.
 */
export interface AddedPictures { total: number; shown: number; takenOff: number; neverKept: number }
export interface ChapterPictures { rows: number; kept: number; draftOnly: number; diskBytes: number; jpegBytes: number; added: AddedPictures | null }

const CHAPTER_PICTURES_SQL = `select
    (select count(*) from studio.chapter_picture_versions)::float8 as rows,
    (select count(*) from studio.chapter_picture_versions v
      where exists (select 1 from studio.chapter_picture_decisions d where d.version_id = v.id))::float8 as kept,
    pg_total_relation_size('studio.chapter_picture_versions')::float8 as disk_bytes,
    (select coalesce(sum(octet_length(jpeg)), 0) from studio.chapter_picture_versions)::float8 as jpeg_bytes`;

/** Each added picture once, by its latest decision (the order the chapter reads it in: decided_at, then id). */
const ADDED_PICTURES_SQL = `with latest as (
    select distinct on (d.job_id) d.job_id, d.version_id from studio.chapter_picture_decisions d
    order by d.job_id, d.decided_at desc, d.id desc
  ), ever as (
    select distinct d.job_id from studio.chapter_picture_decisions d where d.version_id is not null
  )
  select count(*)::float8 as total,
    count(*) filter (where l.version_id is not null)::float8 as shown,
    count(*) filter (where l.version_id is null and e.job_id is not null)::float8 as taken_off,
    count(*) filter (where e.job_id is null)::float8 as never_kept
  from studio.chapter_picture_additions a
  left join latest l on l.job_id = a.job_id
  left join ever e on e.job_id = a.job_id`;

async function chapterPictures(tx: postgres.TransactionSql): Promise<ChapterPictures | null> {
  const [t] = await tx<{ here: boolean; adding: boolean }[]>`
    select to_regclass('studio.chapter_picture_versions') is not null and to_regclass('studio.chapter_picture_decisions') is not null as here,
           to_regclass('studio.chapter_picture_additions') is not null as adding`;
  if (!t.here) return null;
  const [r] = await tx.unsafe<{ rows: number; kept: number; disk_bytes: number; jpeg_bytes: number }[]>(CHAPTER_PICTURES_SQL);
  const rows = Number(r.rows);
  const kept = Number(r.kept);
  let added: AddedPictures | null = null;
  if (t.adding) {
    const [a] = await tx.unsafe<{ total: number; shown: number; taken_off: number; never_kept: number }[]>(ADDED_PICTURES_SQL);
    added = { total: Number(a.total), shown: Number(a.shown), takenOff: Number(a.taken_off), neverKept: Number(a.never_kept) };
  }
  return { rows, kept, draftOnly: rows - kept, diskBytes: Number(r.disk_bytes), jpegBytes: Number(r.jpeg_bytes), added };
}

export const MB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** The chapter-pictures section, as printed. */
export function chapterPicturesText(c: ChapterPictures | null): string[] {
  if (!c) return ['== Chapter pictures (admin redos, all time)', '  chapter pictures: table not there yet'];
  const rows: [string, string][] = [
    ['Versions made (rows, never deleted)', String(c.rows)],
    ['Kept (shown on a chapter at least once)', String(c.kept)],
    ['Draft only (never kept)', String(c.draftOnly)],
    ['Size on disk (table, indexes and TOAST)', MB(c.diskBytes)],
    ['JPEG bytes (sum of octet_length)', MB(c.jpegBytes)],
  ];
  const a = c.added;
  if (a)
    rows.push(
      ['Added while reading (pictures, all)', String(a.total)],
      ['  shown now (latest decision has a version)', String(a.shown)],
      ['  taken off (shown before, not now)', String(a.takenOff)],
      ['  never kept (drafts only)', String(a.neverKept)],
    );
  const W = Math.max(...rows.map(([k]) => k.length)) + 2;
  const out = ['== Chapter pictures (admin redos, all time)', ...rows.map(([k, v]) => `  ${k.padEnd(W)}${v.padStart(10)}`)];
  return a ? out : [...out, '  added pictures: not there yet'];
}

export interface Report { meta: { today: string; first: string; role: string; ro: string }; days: string[]; lines: Line[]; missing: string[]; chapterPictures: ChapterPictures | null }

/** The whole report, in one read-only transaction. */
export async function report(sql: postgres.Sql): Promise<Report> {
  const problems = checkDefs(DEFS);
  if (problems.length) throw new Error(`refused: ${problems.join('; ')}`);
  const out = await sql.begin('read only', async (tx) => {
    await tx`set local statement_timeout = '15s'`;
    const [meta] = await tx<{ today: string; first: string; role: string; ro: string }[]>`
      select (now() at time zone 'utc')::date::text as today, ((now() at time zone 'utc')::date - ${DAYS - 1}::int)::text as first,
             current_user as role, current_setting('transaction_read_only') as ro`;
    if (meta.ro !== 'on') throw new Error('the transaction is not read-only; stopped');
    const names = [...new Set(DEFS.flatMap((d) => d.needs ?? []))];
    const here = new Set(
      (await tx<{ n: string }[]>`
        select n from unnest(${tx.array(names)}::text[]) as n
        where case when array_length(string_to_array(n, '.'), 1) = 3
          then exists (select 1 from information_schema.columns c where c.table_schema = split_part(n, '.', 1) and c.table_name = split_part(n, '.', 2) and c.column_name = split_part(n, '.', 3))
          else to_regclass(n) is not null end`).map((r) => r.n),
    );
    const missing: string[] = [];
    const lines: Line[] = [];
    for (const d of DEFS) {
      const lacks = (d.needs ?? []).filter((n) => !here.has(n));
      if (lacks.length) {
        missing.push(`${d.section} · ${d.id}: needs ${lacks.join(', ')}`);
        continue;
      }
      const w = await tx.unsafe<{ day: string | null; key: string; n: number; total: boolean }[]>(windowSql(d), [meta.first]);
      const a = await tx.unsafe<{ key: string; n: number }[]>(allTimeSql(d));
      checkRows(d.id, [...w.map((r) => r.key), ...a.map((r) => r.key)]);
      const distinct = d.n.startsWith('count(distinct');
      const byKey = new Map<string, Line>();
      const get = (k: string) => {
        const label = d.models ? `${d.models}: ${k} (${modelClass(k)})` : k;
        if (!byKey.has(label)) byKey.set(label, { section: d.section, key: label, unit: d.unit, distinct, byDay: {}, window: 0, allTime: 0 });
        return byKey.get(label)!;
      };
      for (const r of w) {
        const l = get(r.key);
        if (r.total) l.window += Number(r.n);
        else if (r.day) l.byDay[r.day] = (l.byDay[r.day] ?? 0) + Number(r.n);
      }
      for (const r of a) get(r.key).allTime += Number(r.n);
      const ls = [...byKey.values()].sort((x, y) => x.key.localeCompare(y.key));
      if (d.models && !distinct) {
        for (const cls of ['open', 'closed', 'not classified']) {
          const of = ls.filter((l) => l.key.endsWith(`(${cls})`));
          if (!of.length) continue;
          const sum: Line = { section: d.section, key: `${d.models}, all ${cls} models`, unit: d.unit, distinct: false, byDay: {}, window: 0, allTime: 0 };
          for (const l of of) {
            for (const [day, n] of Object.entries(l.byDay)) sum.byDay[day] = (sum.byDay[day] ?? 0) + n;
            sum.window += l.window;
            sum.allTime += l.allTime;
          }
          ls.push(sum);
        }
      }
      if (!ls.length) ls.push({ section: d.section, key: d.none ?? d.key.slice(1, -1), unit: d.unit, distinct, byDay: {}, window: 0, allTime: 0 });
      lines.push(...ls);
    }
    return { meta, lines, missing, chapterPictures: await chapterPictures(tx) };
  });
  const days = Array.from({ length: DAYS }, (_, i) => new Date(Date.parse(`${out.meta.first}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
  return { ...out, days };
}

async function main() {
  const url = process.env.STUDIO_DATABASE_URL;
  if (!url) {
    console.error('STUDIO_DATABASE_URL is not set (it is read from .env.local). Nothing was read.');
    process.exit(2);
  }
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 5, onnotice: () => {} });
  try {
    const r = await report(sql);
    if (JSON_OUT) console.log(JSON.stringify({ generatedAt: new Date().toISOString(), challenge: ch, ...r }, null, 2));
    else print(r.meta, r.days, r.lines, r.missing, r.chapterPictures);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function print(meta: { today: string; role: string }, days: string[], lines: Line[], missing: string[], cp: ChapterPictures | null) {
  const fmt = (n: number, unit: Unit) => (unit === 'usd' ? (n === 0 ? '-' : n.toFixed(2)) : n === 0 ? '-' : String(Math.round(n)));
  const W = Math.min(78, Math.max(...lines.map((l) => l.key.length + (l.distinct ? 2 : 0)), 20));
  const C = 7;
  console.log(`Usage report, UTC days ${days[0]} to ${meta.today} (today is partial). Read-only, as ${meta.role}. Aggregates only.`);
  console.log(`"14d" is the ${DAYS} days together; "all" is all time. * = distinct people over that span (not a sum of days).\n`);
  const head = ''.padEnd(W) + days.map((d) => d.slice(5).padStart(C)).join('') + '14d'.padStart(C + 1) + 'all'.padStart(C + 1);
  for (const section of [...new Set(lines.map((l) => l.section))]) {
    console.log(`== ${section}`);
    console.log(head);
    for (const l of lines.filter((x) => x.section === section)) {
      const label = (l.distinct ? `${l.key} *` : l.key).padEnd(W).slice(0, W);
      console.log(label + days.map((d) => fmt(l.byDay[d] ?? 0, l.unit).padStart(C)).join('') + fmt(l.window, l.unit).padStart(C + 1) + fmt(l.allTime, l.unit).padStart(C + 1));
    }
    console.log('');
  }
  console.log(chapterPicturesText(cp).join('\n') + '\n');
  console.log('== Not on this database (left out)');
  console.log(missing.length ? missing.map((m) => `  ${m}`).join('\n') : '  none');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`usage report failed: ${(e as { code?: string }).code ?? ''} ${(e as Error).message}`);
    process.exit(1);
  });
}
