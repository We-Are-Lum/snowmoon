/**
 * The admin activity page's counts (owner, 2026-11-05; docs/proposals/admin-activity.md): every total it shows, as
 * data, so `check:principles` P6aa and `npm run test:admin-activity` can read each one without a database. No secret,
 * no server code. src/lib/admin-activity.ts runs them, admins only.
 *
 * Each count returns rows of (day, key, n): a day, a category, a number. `key` may name only a category column (the
 * CATEGORY list below), never a person; a person column appears only inside count(distinct …) or inside `from`, whose
 * result is aggregated before it leaves the database. Days are Pacific for every table with a time (`ts`); the cost
 * tables keep only a UTC date (`utcDay`).
 */

export const TZ = 'America/Los_Angeles';

export type SectionId = 'signins' | 'making' | 'spend' | 'agentSpend' | 'prepaid' | 'published' | 'challenge' | 'safety';

export const SECTIONS: Record<SectionId, { title: string; days: 'Pacific' | 'UTC' | null; note?: string }> = {
  signins: {
    title: 'Sign-ins by network',
    days: 'Pacific',
    note: 'Not a count of sign-ins: the site keeps only the latest Farcaster sign-in, the first wallet sign-in, and the first and latest Lens and Bluesky sign-ins.',
  },
  making: { title: 'Making and asking', days: 'Pacific' },
  spend: { title: 'Spend by kind (USD)', days: 'UTC', note: 'The cost tables keep only a UTC date. "Reserved" is money in flight, not spent.' },
  agentSpend: { title: 'Agent frames and video tests (USD)', days: 'Pacific' },
  prepaid: { title: 'Prepaid payments and balances (USD, totals)', days: 'Pacific' },
  published: { title: 'Published work (counts)', days: 'Pacific' },
  challenge: {
    title: 'Remix challenge (counts)',
    days: 'Pacific',
    note: 'Sign-in check decisions are kept 90 days for a pass and a day for a fail: these are the decisions still kept, not their history.',
  },
  safety: { title: 'Safety (counts)', days: 'Pacific' },
};

export interface Def {
  id: string;
  section: SectionId;
  unit: 'count' | 'usd';
  /** The category: SQL built only from string literals and CATEGORY columns. */
  key: string;
  /** The aggregate (AGGREGATE below). */
  n: string;
  /** The rows: a table (or subquery) and its where clause. */
  from: string;
  /** A timestamp column: the row's Pacific day. */
  ts?: string;
  /** A date column kept in UTC (the cost tables). */
  utcDay?: string;
  /** Tables (schema.table) or columns (schema.table.column) the count needs; left out while one is missing. */
  needs?: string[];
}

/** The only columns a key may name: categories, never people. */
export const CATEGORY = new Set([
  'kind', 'verdict', 'funded', 'token', 'reason', 'step', 'role', 'decision', 'account', 'network', 'passed',
  'character', 'element_type', 'hidden_role', 'guard', 'threshold', 'status',
]);
/** SQL words and functions a key may use besides those columns. */
const KEY_WORDS = new Set(['case', 'when', 'then', 'else', 'end', 'coalesce', 'initcap', 'text', 'not', 'and', 'or', 'is', 'null', 'true', 'false', 'x']);

/** The aggregates a count may return. */
export const AGGREGATE = /^(count\(\*\)|count\(distinct [a-z_.]+\)|sum\([a-z_.]+\)|sum\(-?[a-z_.]+\)|count\(\*\) filter \(where [a-z_.]+ > 0\.001\))$/;

/** What is wrong with a count's key or aggregate, if anything (P6aa). */
export function defProblems(d: Def): string[] {
  const p: string[] = [];
  const words = d.key.replace(/'[^']*'/g, ' ').match(/[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?/gi) ?? [];
  for (const w of words) {
    const col = w.toLowerCase().split('.').pop()!;
    if (!CATEGORY.has(col) && !KEY_WORDS.has(col)) p.push(`${d.id}: its key names ${w}, which is not a category column`);
  }
  if (!AGGREGATE.test(d.n)) p.push(`${d.id}: its number (${d.n}) is not an allowed aggregate`);
  if (d.ts && d.utcDay) p.push(`${d.id}: both a Pacific and a UTC day`);
  if (!/^[a-z0-9_]+$/.test(d.id)) p.push(`${d.id}: bad id`);
  return p;
}

const pairs = (kind: 'wallet' | 'social') => {
  const t = kind === 'wallet' ? 'studio.wallet_links' : 'studio.social_links';
  const name = kind === 'wallet' ? 'Wallet ↔ Farcaster links' : 'Lens/Bluesky links';
  return [
    { id: `${kind}_links_made`, section: 'signins', unit: 'count', key: `'${name} made'`, n: 'count(*)', from: `${t} where true`, ts: 'linked_at', needs: [t] },
    { id: `${kind}_links_ended`, section: 'signins', unit: 'count', key: `'${name} ended'`, n: 'count(*)', from: `${t} where unlinked_at is not null`, ts: 'unlinked_at', needs: [t] },
  ] as Def[];
};

/** Costs by kind from a cost table that keeps a UTC date (no person in any of them: 0007, 0008, 0013). */
const costs = (id: string, table: string, label: string, verdicts: boolean): Def[] => [
  {
    id: `${id}_spend`, section: 'spend', unit: 'usd',
    key: verdicts
      ? `'${label}: ' || kind || case when verdict <> '' then ' (' || verdict || ')' else '' end || ' · ' || funded`
      : `'${label}: ' || kind`,
    n: 'sum(cost_usd)', from: `studio.${table} where kind <> 'reserved'`, utcDay: 'day', needs: [`studio.${table}`],
  },
  ...(verdicts
    ? [{ id: `${id}_reserved`, section: 'spend', unit: 'usd', key: `'${label}: reserved (in flight)'`, n: 'sum(cost_usd)', from: `studio.${table} where kind = 'reserved'`, utcDay: 'day', needs: [`studio.${table}`] } as Def]
    : []),
];

const REMIX_V1 = `exists (select 1 from studio.element_versions v1 join studio.links l on l.from_version_id = v1.id and l.kind = 'remixed_from' where v1.element_id = e.id and v1.version_no = 1)`;
const DESIGNS = `studio.element_versions v join studio.elements e on e.id = v.element_id where e.element_type = 'design' and e.status = 'published'`;

export function defs(challengeId: string): Def[] {
  if (!/^[a-z0-9-]{1,40}$/.test(challengeId)) throw new Error('bad challenge id');
  const ch = `challenge = '${challengeId}'`;
  return [
    // 1. Sign-ins: what is kept (no sign-in log exists).
    { id: 'farcaster_latest', section: 'signins', unit: 'count', key: `'Farcaster: people whose latest sign-in was that day (total: ever seen)'`, n: 'count(*)', from: '(select person, max(seen_at) as at from studio.account_names group by person) x where true', ts: 'x.at' },
    { id: 'wallet_new', section: 'signins', unit: 'count', key: `'Wallet: new accounts (first sign-in)'`, n: 'count(*)', from: 'studio.wallet_accounts where true', ts: 'created_at' },
    { id: 'social_new', section: 'signins', unit: 'count', key: `initcap(kind) || ': new accounts (first sign-in)'`, n: 'count(*)', from: 'studio.social_accounts where true', ts: 'created_at', needs: ['studio.social_accounts'] },
    { id: 'social_latest', section: 'signins', unit: 'count', key: `initcap(kind) || ': accounts whose latest sign-in was that day'`, n: 'count(*)', from: 'studio.social_accounts where true', ts: 'last_sign_in_at', needs: ['studio.social_accounts'] },
    ...pairs('wallet'),
    ...pairs('social'),

    // 2. Making and asking.
    { id: 'image_asks', section: 'making', unit: 'count', key: `'Pictures asked for'`, n: 'count(*)', from: 'studio.image_asks where true', ts: 'at' },
    { id: 'remix_asks', section: 'making', unit: 'count', key: `'Remix frames asked for'`, n: 'count(*)', from: 'studio.remix_asks where true', ts: 'at' },
    { id: 'pictures_people', section: 'making', unit: 'count', key: `'People who made pictures or frames'`, n: 'count(distinct x.p)', from: '(select fid as p, at from studio.image_asks union all select person, at from studio.remix_asks) x where true', ts: 'x.at' },
    { id: 'remix_frames', section: 'making', unit: 'count', key: `'Remix frames made'`, n: 'count(*)', from: 'studio.remix_frames where true', ts: 'created_at' },
    { id: 'sheet_remix_asks', section: 'making', unit: 'count', key: `'Sheet remix views asked for'`, n: 'sum(units)', from: 'studio.sheet_remix_asks where true', ts: 'at', needs: ['studio.sheet_remix_asks'] },
    { id: 'sheet_remix_people', section: 'making', unit: 'count', key: `'People asking for sheet remixes'`, n: 'count(distinct fid)', from: 'studio.sheet_remix_asks where true', ts: 'at', needs: ['studio.sheet_remix_asks'] },
    { id: 'chat_calls', section: 'making', unit: 'count', key: `'Assistant questions'`, n: 'count(*)', from: `studio.chat_calls where kind = 'ask'`, ts: 'at' },
    { id: 'chat_people', section: 'making', unit: 'count', key: `'People asking the assistant'`, n: 'count(distinct fid)', from: `studio.chat_calls where kind = 'ask'`, ts: 'at' },
    { id: 'agent_approvals', section: 'making', unit: 'count', key: `'Agent frames and video tests approved'`, n: 'count(*)', from: 'studio.piece_versions where approved_at is not null', ts: 'approved_at' },

    // 3. Spend by kind (UTC days).
    ...costs('chat', 'chat_costs', 'Assistant', false),
    { id: 'chat_flagged', section: 'spend', unit: 'count', key: `'Assistant: answers flagged by the safety check (calls)'`, n: 'sum(calls)', from: `studio.chat_costs where guard = 'flagged'`, utcDay: 'day' },
    ...costs('image', 'image_costs', 'Images', true),
    ...costs('remix', 'remix_costs', 'Remix frames', true),
    ...costs('coach', 'coach_costs', 'Coach', false),
    { id: 'agent_spend', section: 'agentSpend', unit: 'usd', key: `'Approved by their people'`, n: 'sum(spent_usd)', from: 'studio.piece_versions where approved_at is not null and spent_usd is not null', ts: 'approved_at' },

    // 4. Prepaid (totals only; no account, address or hash leaves the database).
    { id: 'wallet_paid', section: 'prepaid', unit: 'usd', key: `'Wallet payments (' || token || ')'`, n: 'sum(usd)', from: 'studio.wallet_payments where true', ts: 'credited_at' },
    { id: 'wallet_payments', section: 'prepaid', unit: 'count', key: `'Wallet payments (count)'`, n: 'count(*)', from: 'studio.wallet_payments where true', ts: 'credited_at' },
    { id: 'wallet_spent', section: 'prepaid', unit: 'usd', key: `'Spent from wallet balances'`, n: 'sum(usd)', from: 'studio.wallet_debits where true', ts: 'at' },
    { id: 'wallet_back', section: 'prepaid', unit: 'usd', key: `'Added back to wallet balances (' || reason || ')'`, n: 'sum(usd)', from: 'studio.wallet_credits where true', ts: 'at' },
    { id: 'wallet_owed', section: 'prepaid', unit: 'usd', key: `'Wallet balances held, all accounts'`, n: 'sum(x.b)', from: `(select account_id, sum(u) as b from (select account_id, usd as u from studio.wallet_payments union all select account_id, -usd from studio.wallet_debits union all select account_id, usd from studio.wallet_credits) y group by account_id) x where true` },
    { id: 'wallet_holding', section: 'prepaid', unit: 'count', key: `'Wallet accounts holding a balance'`, n: 'count(*) filter (where x.b > 0.001)', from: `(select account_id, sum(u) as b from (select account_id, usd as u from studio.wallet_payments union all select account_id, -usd from studio.wallet_debits union all select account_id, usd from studio.wallet_credits) y group by account_id) x where true` },
    { id: 'person_paid', section: 'prepaid', unit: 'usd', key: `'Per-person payments (' || token || ')'`, n: 'sum(usd)', from: 'studio.person_payments where true', ts: 'credited_at', needs: ['studio.person_payments'] },
    { id: 'person_spent', section: 'prepaid', unit: 'usd', key: `'Spent from per-person balances'`, n: 'sum(usd)', from: 'studio.person_debits where true', ts: 'at', needs: ['studio.person_debits'] },
    { id: 'person_back', section: 'prepaid', unit: 'usd', key: `'Added back to per-person balances (' || reason || ')'`, n: 'sum(usd)', from: 'studio.person_credits where true', ts: 'at', needs: ['studio.person_credits'] },
    { id: 'person_owed', section: 'prepaid', unit: 'usd', key: `'Per-person balances held, all people'`, n: 'sum(x.b)', from: `(select person, sum(u) as b from (select person, usd as u from studio.person_payments union all select person, -usd from studio.person_debits union all select person, usd from studio.person_credits) y group by person) x where true`, needs: ['studio.person_payments', 'studio.person_debits', 'studio.person_credits'] },

    // 5. Published work.
    { id: 'design_versions', section: 'published', unit: 'count', key: `'Sheet and style versions (not remixes)'`, n: 'count(*)', from: `${DESIGNS} and not ${REMIX_V1}`, ts: 'v.created_at' },
    { id: 'remix_versions', section: 'published', unit: 'count', key: `'Remix versions'`, n: 'count(*)', from: `${DESIGNS} and ${REMIX_V1}`, ts: 'v.created_at' },
    { id: 'images_published', section: 'published', unit: 'count', key: `'Images'`, n: 'count(*)', from: `studio.elements where element_type = 'image' and status = 'published'`, ts: 'created_at' },
    { id: 'scene_versions', section: 'published', unit: 'count', key: `'Scene versions'`, n: 'count(*)', from: 'studio.adaptation_versions where not hidden', ts: 'created_at' },
    { id: 'frames_shown', section: 'published', unit: 'count', key: `'Remix frames (not hidden)'`, n: 'count(*)', from: 'studio.remix_frames where not hidden', ts: 'created_at' },

    // 6. The remix challenge (never a score: none is kept; never who).
    { id: 'eligibility', section: 'challenge', unit: 'count', key: `'Eligibility at publish, ' || account || ': ' || decision`, n: 'count(*)', from: `studio.challenge_eligibility where ${ch}`, ts: 'checked_at', needs: ['studio.challenge_eligibility.account'] },
    { id: 'eligibility_old', section: 'challenge', unit: 'count', key: `'Eligibility at publish: ' || decision`, n: 'count(*)', from: `studio.challenge_eligibility where ${ch}`, ts: 'checked_at', needs: ['studio.challenge_eligibility', '!studio.challenge_eligibility.account'] },
    { id: 'check_decisions', section: 'challenge', unit: 'count', key: `'Sign-in checks kept, ' || network || ': ' || case when passed then 'passed' else 'not passed' end`, n: 'count(*)', from: 'studio.check_decisions where true', ts: 'decided_at', needs: ['studio.check_decisions'] },
    { id: 'check_rules', section: 'challenge', unit: 'count', key: `'Sign-in checks kept, by rule: ' || network || ' · ' || threshold`, n: 'count(*)', from: 'studio.check_decisions where true', ts: 'decided_at', needs: ['studio.check_decisions'] },
    { id: 'marks', section: 'challenge', unit: 'count', key: `'Marked or submitted: ' || character`, n: 'count(*)', from: `studio.challenge_marks where ${ch}`, ts: 'marked_at', needs: ['studio.challenge_marks'] },
    { id: 'withdrawals', section: 'challenge', unit: 'count', key: `'Withdrawn: ' || character`, n: 'count(*)', from: `studio.challenge_marks where ${ch} and withdrawn_at is not null`, ts: 'withdrawn_at', needs: ['studio.challenge_marks.withdrawn_at'] },
    { id: 'posts', section: 'challenge', unit: 'count', key: `'Posts added: ' || network`, n: 'count(*)', from: 'studio.version_posts where true', ts: 'added_at', needs: ['studio.version_posts'] },

    // 7. Safety (never who reported, their notes, or which moderator).
    { id: 'reports', section: 'safety', unit: 'count', key: `'Reports: ' || coalesce(reason, 'no reason')`, n: 'count(*)', from: `studio.removal_log where step = 'reported'`, ts: 'at' },
    { id: 'actions', section: 'safety', unit: 'count', key: `'Actions: ' || step || ' · ' || role`, n: 'count(*)', from: `studio.removal_log where step <> 'reported'`, ts: 'at' },
    { id: 'hidden_elements', section: 'safety', unit: 'count', key: `'Hidden now: ' || element_type`, n: 'count(*)', from: `studio.elements where status = 'hidden'` },
    { id: 'seeded_hidden', section: 'safety', unit: 'count', key: `'Starting images hidden by admins'`, n: 'count(*)', from: 'studio.seeded_hidden where true', ts: 'hidden_at', needs: ['studio.seeded_hidden'] },
    { id: 'scenes_hidden', section: 'safety', unit: 'count', key: `'Scene versions hidden, by ' || coalesce(hidden_role, 'unknown')`, n: 'count(*)', from: 'studio.adaptation_versions where hidden', ts: 'hidden_at', needs: ['studio.adaptation_versions.hidden_at'] },
    { id: 'frames_hidden', section: 'safety', unit: 'count', key: `'Remix frames hidden, by ' || hidden_role`, n: 'count(*)', from: 'studio.remix_frames where hidden', ts: 'hidden_at' },
    { id: 'storyboards_hidden', section: 'safety', unit: 'count', key: `'Storyboards hidden, by ' || hidden_role`, n: 'count(*)', from: 'studio.storyboards where hidden', ts: 'hidden_at' },
  ];
}

/** One count as SQL: rows of (day, key, n, total); $1 is the number of days. */
export function countSql(d: Def): string {
  const day = d.ts
    ? `case when ${d.ts} >= ((((now() at time zone '${TZ}')::date - ($1::int - 1))::timestamp) at time zone '${TZ}') then ((${d.ts}) at time zone '${TZ}')::date::text end`
    : d.utcDay
      ? `case when ${d.utcDay} >= (now() at time zone 'utc')::date - ($1::int - 1) then ${d.utcDay}::text end`
      : `case when $1::int > 0 then null::text end`;
  // The key is cast in the grouping too: a bare literal there would be read as a column number.
  const key = `(${d.key})::text`;
  return `select ${day} as day, ${key} as key, coalesce((${d.n})::float8, 0) as n, grouping(${day}) = 1 as total
    from ${d.from}
    group by grouping sets ((${day}, ${key}), (${key}))`;
}

/** Words the page draws only for admins: the live check makes sure a signed-out answer holds none of them. */
export const PRIVATE_WORDS = Object.values(SECTIONS).map((s) => s.title);
