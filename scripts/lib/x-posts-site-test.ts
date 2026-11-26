/**
 * The X posts site test (part of npm run test:x-posts): the real handler (src/lib/x-posts/interactions.ts) with signed
 * Discord requests, the real store as studio_writer on PGlite, and a local stub answering as Discord's REST API and X's
 * API do. No network, no keys: the keys here are made for the test and thrown away.
 */
import http from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';

type Check = (label: string, ok: boolean, detail?: string) => void;

export async function siteTest(pg: PGlite, sql: postgres.Sql, check: Check, proof: (label: string, caught: boolean) => void, read: (f: string) => string, walk: (dir: string) => string[]) {
  const { X_POSTS } = await import('../../src/lib/config');
  const I = await import('../../src/lib/x-posts/interactions');
  const S = await import('../../src/lib/x-posts/store');
  const C = await import('../../src/lib/x-posts/count');
  const SIG = await import('../../src/lib/x-posts/signatures');
  const W = await import('../../src/lib/x-posts/wording');
  const A = await import('../../src/lib/x-posts/admin');
  const { p4aProblems } = await import('./p4a');
  const sw = X_POSTS as unknown as { cards: boolean; post: boolean };
  // PGlite is one session, and the site's connection set it to studio_writer: the test's own setup and clean-up that
  // need more than the site's rights run as postgres, then hand the session back.
  const asOwner = (q: string) => pg.exec(`reset role; ${q}; set role studio_writer;`);

  // --- A stub for Discord and X -----------------------------------------------------------------------------------
  type Seen = { method: string; path: string; body: unknown; auth: string; id?: string };
  const seen: Seen[] = [];
  let nextMessage = 1400000000000000000n;
  let nextPost = 1994000000000000000n;
  let xCreate: () => { status: number; body: unknown } = () => ({ status: 201, body: { data: { id: String(nextPost++), text: '' } } });
  let xDelete: () => { status: number; body: unknown } = () => ({ status: 200, body: { data: { deleted: true } } });
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const path = req.url ?? '';
      seen.push({ method: req.method ?? '', path, body: raw ? JSON.parse(raw) : null, auth: String(req.headers.authorization ?? '') });
      let out: { status: number; body: unknown } = { status: 404, body: {} };
      if (path.startsWith('/discord/channels/') && req.method === 'POST') {
        const id = String(nextMessage++);
        seen[seen.length - 1].id = id;
        out = { status: 200, body: { id } };
      }
      else if (path.startsWith('/discord/') && (req.method === 'PATCH' || req.method === 'PUT')) out = { status: 200, body: {} };
      else if (path === '/x/2/tweets' && req.method === 'POST') out = xCreate();
      else if (path.startsWith('/x/2/tweets/') && req.method === 'DELETE') out = xDelete();
      res.writeHead(out.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const xSeen = () => seen.filter((s) => s.path.startsWith('/x/'));

  // --- The app's settings, for the test -----------------------------------------------------------------------------
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const other = generateKeyPairSync('ed25519');
  const rawHex = (k: typeof publicKey) => (k.export({ format: 'der', type: 'spki' }) as Buffer).subarray(12).toString('hex');
  const ID = { nate: '100000000000000011', garance: '100000000000000012', luis: '100000000000000013', ana: '100000000000000021', ben: '100000000000000022', cara: '100000000000000023', dan: '100000000000000024', eve: '100000000000000029' };
  const env = {
    publicKey: rawHex(publicKey), applicationId: '110000000000000001', botToken: 'test-bot-token', guildId: '120000000000000001', channelId: '130000000000000001', roleId: '140000000000000001',
    leads: [ID.nate, ID.garance, ID.luis], x: { consumerKey: 'ck', consumerSecret: 'cs', token: 't', tokenSecret: 'ts' }, account: 'snowmoon_party',
    discordApi: `http://127.0.0.1:${port}/discord`, xApi: `http://127.0.0.1:${port}/x`,
  };
  const member = (who: keyof typeof ID, team = true) => ({ user: { id: ID[who], username: who, global_name: who[0].toUpperCase() + who.slice(1) }, roles: team ? [env.roleId] : ['150000000000000001'] });
  const headers = (body: string, key = privateKey, ts = String(Math.floor(Date.now() / 1000))) => new Headers({ 'x-signature-ed25519': sign(null, Buffer.from(ts + body), key).toString('hex'), 'x-signature-timestamp': ts });
  type Ans = { status: number; body: { type?: number; data?: { content?: string; flags?: number; components?: { components: { custom_id: string; value?: string }[] }[]; custom_id?: string } } };
  const call = async (i: Record<string, unknown>, opts: { key?: typeof privateKey; ts?: string; raw?: string } = {}): Promise<Ans> => {
    const body = opts.raw ?? JSON.stringify(i);
    const a = await I.handleInteraction(body, headers(opts.raw ? JSON.stringify(i) : body, opts.key, opts.ts), { sql, env });
    if (a.later) await a.later();
    return a as Ans;
  };
  const base = (who: keyof typeof ID, team = true) => ({ guild_id: env.guildId, member: member(who, team), token: 'interaction-token' });
  const command = (who: keyof typeof ID, text: string, link?: string, confirm?: boolean, team = true) =>
    call({ type: 2, ...base(who, team), data: { name: 'xpost', options: [{ name: 'text', value: text }, ...(link ? [{ name: 'link', value: link }] : []), ...(confirm ? [{ name: 'confirm', value: true }] : [])] } });
  const click = (who: keyof typeof ID, action: string, id: number) => call({ type: 3, ...base(who), data: { custom_id: `xp:${action}:${id}` } });
  const saveEdit = (who: keyof typeof ID, id: number, post: string, link = '') =>
    call({ type: 5, ...base(who), data: { custom_id: `xp:edit-save:${id}`, components: [{ components: [{ custom_id: 'post', value: post }] }, { components: [{ custom_id: 'link', value: link }] }] } });
  const said = (a: Ans) => a.body.data?.content ?? '';
  const ephemeral = (a: Ans) => a.status === 200 && ((a.body.type === 4 && a.body.data?.flags === 64) || a.body.type === 7);
  const lastId = async () => Number((await pg.query<{ id: number }>(`select max(id) as id from studio.x_proposals`)).rows[0].id);
  const row = async (id: number) => JSON.stringify((await pg.query(`select * from studio.x_proposals where id = ${id}`)).rows[0]);
  const approvalsN = async (id: number) => Number((await pg.query<{ n: number }>(`select count(*) as n from studio.x_approvals where proposal_id = ${id}`)).rows[0].n);
  const events = async (id: number) => (await pg.query<{ event: string }>(`select event from studio.x_post_log where proposal_id = ${id} order by id`)).rows.map((r) => r.event);
  const status = async (id: number) => (await pg.query<{ status: string }>(`select status from studio.x_proposals where id = ${id}`)).rows[0]?.status;
  const allCounts = async () => JSON.stringify((await pg.query(`select (select count(*) from studio.x_proposals) p, (select count(*) from studio.x_approvals) a, (select count(*) from studio.x_post_log) l`)).rows[0]);
  const lastCard = (messageId?: string) => [...seen].reverse().find((s) => s.path.startsWith('/discord/channels/') && (!messageId || s.path.endsWith(messageId) || s.id === messageId))?.body as { embeds: { title: string; description: string; fields: { value: string }[] }[]; components: { components: { custom_id: string; label: string }[] }[]; allowed_mentions: { parse: string[] } } | undefined;
  const cardText = (b: ReturnType<typeof lastCard>) => (b ? [b.embeds[0].title, b.embeds[0].description, ...b.embeds[0].fields.map((f) => f.value)].join('\n') : '');
  const buttons = (b: ReturnType<typeof lastCard>) => (b?.components ?? []).flatMap((r) => r.components.map((c) => c.custom_id.split(':')[1]));
  const messageOf = async (id: number) => (await pg.query<{ m: string }>(`select discord_message_id as m from studio.x_proposals where id = ${id}`)).rows[0].m;

  // --- Counting and signing -----------------------------------------------------------------------------------------
  check("X's count: 280 plain letters are 280", C.xLength('a'.repeat(280)) === 280);
  check("X's count: a link is 23, however long", C.xLength(`see https://snowmoon.party/${'x'.repeat(80)}`) === 4 + 23);
  check("X's count: a bare domain is a link (23) and is priced as one", C.xLength('snowmoon.party') === 23 && S.priceOf('Read it on snowmoon.party', null) === X_POSTS.priceUsd.postWithLink);
  check("X's count: an emoji is 2, a family emoji too; CJK characters are 2", C.xLength('🌙') === 2 && C.xLength('👨‍👩‍👧') === 2 && C.xLength('月') === 2);
  check('the price: $0.015 without a link, $0.20 with one', S.priceOf('Chapter 4 is narrated now.', null) === 0.015 && S.priceOf('Chapter 4', 'https://snowmoon.party/read/4') === 0.2);
  check('mentions: @name is found; an email address is not', C.mentionsIn('thanks @garance!').join() === 'garance' && C.mentionsIn('write to snowmoon@wearelum.xyz').length === 0);
  check("OAuth 1.0a: X's published example signs to its published signature", SIG.oauthSignature('POST', 'https://api.twitter.com/1.1/statuses/update.json', { status: 'Hello Ladies + Gentlemen, a signed OAuth request!', include_entities: 'true', oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog', oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: '1318622958', oauth_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', oauth_version: '1.0' }, 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE') === 'hCtSmYh+iHYCEqBWrE7C7hYmtUk=');

  // --- Who may call -------------------------------------------------------------------------------------------------
  const ping = { type: 1 };
  check('a signed PING is answered (type 1)', JSON.stringify((await call(ping)).body) === '{"type":1}');
  check('unsigned: 401', (await I.handleInteraction(JSON.stringify(ping), new Headers(), { sql, env })).status === 401);
  check('signed with another key: 401', (await call(ping, { key: other.privateKey })).status === 401);
  check('a changed body: 401', (await call({ type: 1, x: 1 }, { raw: JSON.stringify({ type: 1, x: 2 }) })).status === 401);
  check('signed more than 5 minutes ago: 401', (await call(ping, { ts: String(Math.floor(Date.now() / 1000) - 600) })).status === 401);
  const before0 = await allCounts();
  check('a command signed with another key writes nothing', (await call({ type: 2, ...base('nate'), data: { name: 'xpost', options: [{ name: 'text', value: 'x' }] } }, { key: other.privateKey })).status === 401 && (await allCounts()) === before0);
  sw.cards = false;
  check('with the cards off: 404, even signed', (await call(ping)).status === 404);
  sw.cards = true;
  check('another server: refused, nothing written', said(await call({ type: 2, guild_id: '120000000000000009', member: member('nate'), data: { name: 'xpost', options: [{ name: 'text', value: 'x' }] } })) === W.REPLY.wrongServer && (await allCounts()) === before0);
  check('no team role: refused, nothing written', said(await command('eve', 'Hello', undefined, false, false)) === W.REPLY.notTeam && (await allCounts()) === before0);

  // --- Proposing ----------------------------------------------------------------------------------------------------
  check('too long for X: refused with the count', said(await command('ana', 'a'.repeat(281))) === W.REPLY.tooLong(281, 280));
  check('a link that is not https: refused', said(await command('ana', 'Read it', 'http://snowmoon.party')) === W.REPLY.badLink);
  check('an @mention without confirm: refused, saying who it tags', said(await command('ana', 'Thanks @someone_else')) === W.REPLY.mention('someone_else'));
  check('nothing written by refused proposals', (await allCounts()) === before0);
  const a1 = await command('ana', 'Chapter 4 is narrated now. @everyone listen', 'https://snowmoon.party/read/4', true);
  const p1 = await lastId();
  check('a proposal: the reply only the proposer sees', ephemeral(a1) && said(a1) === W.REPLY.proposed);
  check("a proposal: one card, the proposer's approval counted, the log row", (await status(p1)) === 'open' && (await approvalsN(p1)) === 1 && (await events(p1)).join() === 'proposed');
  const m1 = await messageOf(p1);
  const c1 = lastCard();
  check('the card is posted in #x-posts and its message kept', /^\d{19}$/.test(m1) && seen.some((s) => s.method === 'POST' && s.path === `/discord/channels/${env.channelId}/messages`));
  check('no card ever pings anyone (allowed_mentions: none)', seen.filter((s) => s.path.startsWith('/discord/channels/')).every((s) => JSON.stringify((s.body as { allowed_mentions?: unknown }).allowed_mentions) === '{"parse":[]}'));
  check('the card: title, the post, proposer, 1 of 3, needs a lead, the count and price, the buttons', c1?.embeds[0].title === W.CARD.teamTitle && cardText(c1).includes('> Chapter 4 is narrated now.') && cardText(c1).includes('Proposed by Ana') && cardText(c1).includes('1 of 3') && cardText(c1).includes(W.CARD.needsLead) && cardText(c1).includes('$0.20') && buttons(c1).join() === 'approve,edit,withdraw');
  check('the bot token goes only to Discord, never to X', seen.filter((s) => s.path.startsWith('/discord/')).every((s) => s.auth === `Bot ${env.botToken}`));

  // --- Approving (posting off) --------------------------------------------------------------------------------------
  check('a second approval: 2 of 3', said(await click('ben', 'approve', p1)) === W.REPLY.approved(2, 3));
  check('a third, but no lead: 3 of 3 and still open, no "would post"', said(await click('cara', 'approve', p1)) === W.REPLY.approved(3, 3) && (await status(p1)) === 'open' && !(await events(p1)).includes('would_post'));
  check('clicking again takes the approval back', said(await click('cara', 'approve', p1)) === W.REPLY.unapproved && (await approvalsN(p1)) === 2);
  const xBefore = xSeen().length;
  check('a lead makes it ready: posting off, so it is logged "would post" and nothing goes to X', said(await click('nate', 'approve', p1)) === W.REPLY.approved(3, 3) && (await events(p1)).includes('would_post') && xSeen().length === xBefore && (await status(p1)) === 'open');
  check('the card says "Would post now (posting is off)"', cardText(lastCard(m1)).includes(W.CARD.wouldPost));
  check('Try again with posting off says so', said(await click('nate', 'retry', p1)) === W.REPLY.postOff);

  // --- Editing ------------------------------------------------------------------------------------------------------
  check("Edit by someone else on a team card: refused", said(await click('ben', 'edit', p1)) === W.REPLY.notProposer);
  const box = await click('ana', 'edit', p1);
  check('Edit by the proposer opens the box with the text and link', box.body.type === 9 && box.body.data?.components?.[0].components[0].value === 'Chapter 4 is narrated now. @everyone listen' && box.body.data?.components?.[1].components[0].value === 'https://snowmoon.party/read/4');
  check("saving someone else's edit: refused, nothing changed", said(await saveEdit('ben', p1, 'Mine now')) === W.REPLY.notProposer && (await approvalsN(p1)) === 3);
  check('saving the edit: approvals start again from the proposer, logged', said(await saveEdit('ana', p1, 'Chapter 4 is narrated now.', 'https://snowmoon.party/read/4')) === W.REPLY.savedEdit && (await approvalsN(p1)) === 1 && (await events(p1)).at(-1) === 'edited');
  check('the card says it was edited and approvals start again', cardText(lastCard(m1)).includes(W.CARD.edited('Ana')) && cardText(lastCard(m1)).includes('1 of 3'));

  // --- Withdrawing --------------------------------------------------------------------------------------------------
  check('Withdraw by someone else: refused', said(await click('ben', 'withdraw', p1)) === W.REPLY.notProposer);
  const conf = await click('ana', 'withdraw', p1);
  check('Withdraw asks first, only the proposer sees it', ephemeral(conf) && said(conf) === W.CONFIRM.withdraw && conf.body.data?.components?.[0].components[0].custom_id === `xp:withdraw-yes:${p1}`);
  const done = await click('ana', 'withdraw-yes', p1);
  check('confirmed: withdrawn, the card has no buttons', done.body.type === 7 && (await status(p1)) === 'withdrawn' && buttons(lastCard(m1)).length === 0 && cardText(lastCard(m1)).includes('Withdrawn by Ana'));
  const w1 = await row(p1);
  check('a late Approve on a withdrawn card: said plainly, nothing changed', said(await click('nate', 'approve', p1)) === W.REPLY.already.withdrawn && (await row(p1)) === w1);

  // --- Posting on (release 2's path, with the stub) ------------------------------------------------------------------
  sw.post = true;
  const ready = async (who: keyof typeof ID, text: string, link?: string) => {
    await command(who, text, link);
    const id = await lastId();
    for (const p of (['ben', 'cara', 'nate'] as const).filter((x) => x !== who).slice(0, 2)) await click(p, 'approve', id);
    if ((await status(id)) === 'open' && !(await events(id)).includes('posted')) await click('garance', 'approve', id);
    return id;
  };
  const p2 = await ready('ana', 'Chapter 5 is narrated now.', 'https://snowmoon.party/read/5');
  const m2 = await messageOf(p2);
  const create = xSeen().find((s) => s.method === 'POST');
  check('posting on: the third approval with a lead posts it, once', (await status(p2)) === 'posted' && xSeen().filter((s) => s.method === 'POST').length === 1);
  check('X received the text and the link, signed with OAuth 1.0a', JSON.stringify(create?.body) === JSON.stringify({ text: 'Chapter 5 is narrated now. https://snowmoon.party/read/5' }) && /^OAuth oauth_consumer_key="ck", .*oauth_signature="/.test(create?.auth ?? '') && !create?.auth.includes(env.botToken));
  check('logged as posted, with what it cost ($0.20, a link)', (await pg.query<{ c: string }>(`select cost_usd::text as c from studio.x_post_log where proposal_id = ${p2} and event = 'posted'`)).rows[0]?.c === '0.2000');
  check('the card shows the post on X and Delete from X, Delete and redraft', cardText(lastCard(m2)).includes('https://x.com/snowmoon_party/status/') && buttons(lastCard(m2)).join() === 'delete,redraft');

  // Note 1 (owner, 2026-11-25): nothing updates a posted card's row; a late click is told plainly, never an error.
  const frozen = await row(p2);
  const frozenCounts = await allCounts();
  for (const [what, a] of [
    ['Approve', () => click('cara', 'approve', p2)],
    ['Approve again (take back)', () => click('nate', 'approve', p2)],
    ['Edit', () => click('ana', 'edit', p2)],
    ['the edit box saved', () => saveEdit('ana', p2, 'Rewritten')],
    ['Withdraw', () => click('ana', 'withdraw', p2)],
    ['Withdraw confirmed', () => click('ana', 'withdraw-yes', p2)],
    ['Try again', () => click('nate', 'retry', p2)],
  ] as const) {
    let ans: Ans | null = null;
    let threw = '';
    try {
      ans = await a();
    } catch (e) {
      threw = String(e);
    }
    check(`a posted card: ${what} is told "${W.REPLY.already.posted.slice(0, 30)}…", nothing changes`, !threw && !!ans && ephemeral(ans) && said(ans) === W.REPLY.already.posted && (await row(p2)) === frozen && (await allCounts()) === frozenCounts, threw);
  }
  await I.refreshCard(sql, env, p2);
  check('drawing a posted card again writes nothing', (await row(p2)) === frozen && (await allCounts()) === frozenCounts);
  check('the database itself still refuses any change to a posted card', await pg.query(`update studio.x_proposals set updated_at = now() where id = ${p2}`).then(() => false, () => true));

  // Deleting.
  const approvers = (await pg.query<{ u: string }>(`select discord_user_id as u from studio.x_approvals where proposal_id = ${p2}`)).rows.map((r) => r.u);
  const stranger = 'dan' as const;
  check('dan, on the team, neither approved it nor leads', !approvers.includes(ID.dan) && !env.leads.includes(ID.dan));
  check(`Delete by ${stranger}, who didn't approve it: refused, nothing sent to X`, said(await click(stranger, 'delete', p2)) === W.REPLY.notDeleter && !xSeen().some((s) => s.method === 'DELETE'));
  const approver = (Object.keys(ID) as (keyof typeof ID)[]).find((k) => approvers.includes(ID[k]) && !env.leads.includes(ID[k]))!;
  check('Delete asks first', said(await click(approver, 'delete', p2)) === W.CONFIRM.delete);
  const del = await click(approver, 'delete-yes', p2);
  check('confirmed by someone who approved it: deleted on X and on the card, logged with its cost', del.body.type === 7 && xSeen().some((s) => s.method === 'DELETE' && s.path.endsWith(`/2/tweets/${JSON.parse(frozen).x_post_id}`)) && (await status(p2)) === 'deleted' && (await events(p2)).at(-1) === 'deleted' && cardText(lastCard(m2)).includes('Deleted from X by'));
  check('the clicker is told it is deleted (their own reply edited)', seen.some((s) => s.method === 'PATCH' && s.path === `/discord/webhooks/${env.applicationId}/interaction-token/messages/@original` && (s.body as { content: string }).content === W.REPLY.deletedDone));
  const gone = await row(p2);
  const goneCounts = await allCounts();
  for (const [what, a, want] of [
    ['Approve', () => click('cara', 'approve', p2), W.REPLY.already.deleted],
    ['Edit', () => click('ana', 'edit', p2), W.REPLY.already.deleted],
    ['the edit box saved', () => saveEdit('ana', p2, 'Rewritten'), W.REPLY.already.deleted],
    ['Delete again', () => click('nate', 'delete', p2), W.REPLY.already.deleted],
    ['Delete and redraft', () => click('nate', 'redraft', p2), W.REPLY.already.deleted],
    ['Delete and redraft confirmed', () => click('nate', 'redraft-yes', p2), W.REPLY.already.deleted],
  ] as const) {
    const ans = await a().catch(() => null);
    check(`a deleted card: ${what} is told plainly, nothing changes`, !!ans && ephemeral(ans) && said(ans) === want && (await row(p2)) === gone && (await allCounts()) === goneCounts);
  }

  // Delete and redraft.
  const p3 = await ready('ben', 'Zei voiced by garance on Farcaster.', 'https://snowmoon.party/ephelion');
  const m3 = await messageOf(p3);
  check('another post goes out', (await status(p3)) === 'posted');
  check('Delete and redraft asks first', said(await click('nate', 'redraft', p3)) === W.CONFIRM.redraft);
  const rd = await click('nate', 'redraft-yes', p3);
  const p4 = await lastId();
  const p4row = (await pg.query<{ source: string; proposer_discord_id: string; body: string; link: string; status: string; redraft_of: number }>(`select * from studio.x_proposals where id = ${p4}`)).rows[0];
  check('redraft: the old card is deleted on X and marked deleted', rd.body.type === 7 && (await status(p3)) === 'deleted');
  check('redraft: a new open team card, same text and link, the clicker its proposer, 1 approval (theirs)', p4 !== p3 && p4row.source === 'team' && p4row.proposer_discord_id === ID.nate && p4row.body === 'Zei voiced by garance on Farcaster.' && p4row.link === 'https://snowmoon.party/ephelion' && p4row.status === 'open' && Number(p4row.redraft_of) === p3 && (await approvalsN(p4)) === 1);
  check('redraft: logged on both cards, each naming the other', (await events(p3)).slice(-2).join() === 'deleted,redrafted_to' && (await events(p4)).join() === 'redrafted_from' && (await pg.query(`select 1 from studio.x_post_log where proposal_id = ${p3} and event = 'redrafted_to' and other_proposal_id = ${p4}`)).rows.length === 1);
  const m4 = await messageOf(p4);
  check('redraft: the new card is in the channel, saying what it redrafts; the old card links to it', !!m4 && cardText(lastCard(m4)).includes(`Redraft of https://discord.com/channels/${env.guildId}/${env.channelId}/${m3}`) && cardText(lastCard(m3)).includes(`and redrafted: https://discord.com/channels/${env.guildId}/${env.channelId}/${m4}`));
  check('redraft: the new card needs fresh approvals (Nate, a lead, redrafted it, so it doesn\'t ask for one)', cardText(lastCard(m4)).includes('1 of 3') && !cardText(lastCard(m4)).includes(W.CARD.needsLead) && buttons(lastCard(m4)).join() === 'approve,edit,withdraw');
  check('redraft: two more approvals from anyone on the team post it, as any card', (await click('ana', 'approve', p4), await click('ben', 'approve', p4), (await status(p4)) === 'posted'));

  // A site suggestion redrafted becomes a team card (a work has at most one suggestion), keeping its work.
  const entry = '76666666-6666-4666-8666-666666666666';
  await pg.query(`insert into studio.x_proposals (source, body, link, subject_kind, subject_id, status, x_post_id, posted_at, discord_message_id) values ('site', 'A new remix challenge entry.', 'https://snowmoon.party/remix/${entry}', 'challenge_entry', '${entry}', 'posted', '1993000000000000777', now(), '1300000000000000077')`);
  const p5 = await lastId();
  await pg.query(`insert into studio.x_approvals (proposal_id, discord_user_id, discord_name) values (${p5}, '${ID.ana}', 'Ana'), (${p5}, '${ID.ben}', 'Ben'), (${p5}, '${ID.garance}', 'Garance')`);
  await click('ana', 'redraft-yes', p5);
  const p6 = await lastId();
  const p6row = (await pg.query<{ source: string; proposer_discord_id: string; subject_kind: string; subject_id: string }>(`select * from studio.x_proposals where id = ${p6}`)).rows[0];
  check('a site suggestion redrafted: a team card with the clicker as proposer, keeping its work', p6 !== p5 && p6row.source === 'team' && p6row.proposer_discord_id === ID.ana && p6row.subject_kind === 'challenge_entry' && p6row.subject_id === entry && (await status(p5)) === 'deleted');

  // Note 2 (owner, 2026-11-25): only a card that was posted (and so is deleted now) can be redrafted; checked in the
  // same transaction that marks it deleted. The database alone accepts it, which is why the code checks.
  await command('ana', 'Never posted.');
  const open = await lastId();
  const dbAlone = await pg.exec(`begin; insert into studio.x_proposals (source, proposer_discord_id, proposer_name, body, redraft_of) values ('team', '${ID.nate}', 'Nate', 'x', ${open}); rollback;`).then(() => true, async () => (await pg.exec('rollback;').catch(() => {}), false));
  proof('the database alone accepts a redraft of a card that was never posted (so the code must refuse it)', dbAlone);
  await command('ana', 'Withdrawn, never posted.');
  const wd = await lastId();
  await click('ana', 'withdraw-yes', wd);
  await command('ana', 'Refused by X.');
  await pg.query(`update studio.x_proposals set status = 'failed' where id = ${await lastId()}`);
  const failed = await lastId();
  const nate = { id: ID.nate, name: 'Nate' };
  for (const [what, id] of [['an open card', open], ['a withdrawn card', wd], ['a card X refused', failed], ['a card already deleted and redrafted', p3]] as const) {
    const before = await allCounts();
    const snap = await row(id);
    const r = await S.markDeleted(sql, id, nate, { redraft: true });
    check(`redraft of ${what}: refused, nothing written`, !('deleted' in r) && (await allCounts()) === before && (await row(id)) === snap);
  }
  const xDeletes = xSeen().filter((s) => s.method === 'DELETE').length;
  check('Delete and redraft on an open card: told it must be on X first, nothing sent to X', said(await click('nate', 'redraft', open)) === W.REPLY.notRedraftable && said(await click('nate', 'redraft-yes', open)) === W.REPLY.notRedraftable && xSeen().filter((s) => s.method === 'DELETE').length === xDeletes);
  check('a second redraft of the same card: refused', said(await click('nate', 'redraft-yes', p3)) === W.REPLY.already.deleted);

  // X says no, or doesn't answer.
  xCreate = () => ({ status: 403, body: { detail: 'You are not allowed to create a Tweet with duplicate content.' } });
  const p7 = await ready('ana', 'A duplicate.');
  check('X refuses: the card is "failed", nothing posted, with X\'s reason', (await status(p7)) === 'failed' && cardText(lastCard(await messageOf(p7))).includes('duplicate content') && (await events(p7)).at(-1) === 'post_failed');
  xCreate = () => ({ status: 201, body: { data: { id: String(nextPost++), text: '' } } });
  check('Try again by someone who approved it: posted', said(await click('nate', 'retry', p7)) === W.REPLY.tryingAgain && (await status(p7)) === 'posted');
  xCreate = () => ({ status: 503, body: { title: 'Service Unavailable' } });
  const p8 = await ready('ana', 'No answer.');
  check("X doesn't answer: 'unknown', counted as charged, the card says check the account", (await status(p8)) === 'unknown' && (await events(p8)).at(-1) === 'post_unknown' && cardText(lastCard(await messageOf(p8))).includes(W.CARD.unknown('snowmoon_party')));
  xCreate = () => ({ status: 201, body: { data: { id: String(nextPost++), text: '' } } });
  xDelete = () => ({ status: 403, body: { detail: 'Forbidden' } });
  const p9 = await ready('ana', 'Will not delete.');
  await click('nate', 'delete-yes', p9);
  check("X won't delete: the card stays posted, logged, and the clicker is told why", (await status(p9)) === 'posted' && (await events(p9)).at(-1) === 'delete_failed' && seen.some((s) => s.method === 'PATCH' && (s.body as { content?: string })?.content === W.REPLY.deleteFailed('Forbidden')));
  await click('nate', 'redraft-yes', p9);
  check("X won't delete: nothing is redrafted", (await status(p9)) === 'posted' && !(await pg.query(`select 1 from studio.x_proposals where redraft_of = ${p9}`)).rows.length);
  xDelete = () => ({ status: 200, body: { data: { deleted: true } } });

  // The budget and the day's limit.
  const spent = await S.spentThisMonth(sql);
  // Spending up to $0.10 short of the limit, in rows of at most $9 (a row holds at most $10).
  for (let left = X_POSTS.monthlyUsd - spent - 0.1; left > 0.00001; left -= 9) await pg.query(`insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, x_post_id, cost_usd) values (${p7}, 'posted', '${ID.nate}', 'Nate', '1993000000000000888', ${Math.min(9, left).toFixed(4)})`);
  const p10 = await ready('ana', 'Over budget, with a link.', 'https://snowmoon.party');
  check('over this month\'s $20: held, not posted, the card says so, and only a lead can Try again', (await status(p10)) === 'open' && (await events(p10)).at(-1) === 'held' && cardText(lastCard(await messageOf(p10))).includes(W.CARD.held(20)) && buttons(lastCard(await messageOf(p10))).includes('retry') && said(await click('ana', 'retry', p10)) === W.REPLY.notRetrier);
  await asOwner(`delete from studio.x_post_log where x_post_id = '1993000000000000888'`);
  const today = await S.postsToday(sql);
  for (let k = today; k < X_POSTS.perDay; k++) await pg.query(`insert into studio.x_post_log (proposal_id, event, actor_discord_id, actor_name, x_post_id, cost_usd) values (${p7}, 'posted', '${ID.nate}', 'Nate', '19930000000000009${String(k).padStart(2, '0')}', 0)`);
  check('the 11th post today: held for the day', said(await click('nate', 'retry', p10)) === W.REPLY.tryingAgain && (await status(p10)) === 'open' && cardText(lastCard(await messageOf(p10))).includes(W.CARD.heldDay(10)));
  sw.post = false;

  // --- The admin page and the command -------------------------------------------------------------------------------
  check('/admin/x-posts: signed out and a non-admin get 404', (await A.xPostsView(sql, null)).status === 404 && (await A.xPostsView(sql, 6852)).status === 404);
  const v = await A.xPostsView(sql, 193912);
  check('/admin/x-posts: an admin sees the log, the month and today; only the owner can register', v.status === 200 && 'rows' in v.body && v.body.rows.length > 0 && v.body.canRegister === false && ((await A.xPostsView(sql, 6786)).body as { canRegister: boolean }).canRegister === true);
  check('Register commands: signed out 401, an admin who is not the owner 404', (await A.registerFor(null, env)).status === 401 && (await A.registerFor(193912, env)).status === 404);
  const reg = await A.registerFor(6786, env);
  const put = seen.find((s) => s.method === 'PUT');
  check('Register commands by the owner: /xpost in the Snowmoon server, with its three options', reg.status === 200 && put?.path === `/discord/applications/${env.applicationId}/guilds/${env.guildId}/commands` && JSON.stringify((put?.body as { name: string; options: { name: string }[] }[])[0].options.map((o) => o.name)) === '["text","link","confirm"]');

  // --- P4a and who reads the tables ---------------------------------------------------------------------------------
  const route = { file: 'src/app/api/discord/interactions/route.ts', src: read('src/app/api/discord/interactions/route.ts') };
  check('P4a: the Discord route passes as a checked exemption', p4aProblems([route], read).length === 0, p4aProblems([route], read).join('; '));
  const planted = (f: string, s: string) => (rel: string) => (rel === f ? s : read(rel));
  const h = read('src/lib/x-posts/interactions.ts');
  proof('P4a fails a handler that parses the request before checking the signature', p4aProblems([route], planted('src/lib/x-posts/interactions.ts', h.replace("  if (!X_POSTS.cards) return json({ error: 'Not found' }, 404);\n", "  if (!X_POSTS.cards) return json({ error: 'Not found' }, 404);\n  JSON.parse(raw);\n"))).length > 0);
  proof('P4a fails a handler without the signature check', p4aProblems([route], planted('src/lib/x-posts/interactions.ts', h.replace("return json({ error: 'invalid request signature' }, 401);", 'void 0;'))).length > 0);
  proof('P4a fails a handler without the team role check', p4aProblems([route], planted('src/lib/x-posts/interactions.ts', h.replace('.includes(env.roleId)) return only(REPLY.notTeam)', '.includes(env.roleId)) void 0'))).length > 0);
  proof('P4a fails a Discord route that imports more', p4aProblems([{ ...route, src: route.src.replace("import { db } from '~/lib/db';", "import { db } from '~/lib/db';\nimport { getFid } from '~/lib/auth';") }], read).length > 0);
  const readers = walk('src').filter((f) => /x_proposals|x_approvals|x_post_log/.test(read(f)) && !f.startsWith('src/lib/x-posts/'));
  check('only src/lib/x-posts reads or writes the X posts tables', readers.length === 0, readers.join(', '));
  const fetchers = walk('src').filter((f) => /discord\.com\/api|api\.x\.com/.test(read(f)) && f !== 'src/lib/x-posts/apis.ts');
  check("only src/lib/x-posts/apis.ts calls Discord's or X's API (server side)", fetchers.length === 0, fetchers.join(', '));
  check('the switches as release 1 ships them: cards on, posting off, suggestions off', X_POSTS.cards === true && X_POSTS.post === false && (X_POSTS as unknown as { suggest: boolean }).suggest === false);

  await new Promise<void>((r) => server.close(() => r()));
}
