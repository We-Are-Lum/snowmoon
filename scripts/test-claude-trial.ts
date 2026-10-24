/**
 * Offline checks for the Claude trial's helpers (scripts/lib/claude-trial.ts): prices, message shape,
 * the spend cap, and the call with a stand-in fetch. No network, no key.  npx tsx scripts/test-claude-trial.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { callClaude, CapReached, claudeCost, Ledger, toAnthropic, worstCaseClaudeUsd } from './lib/claude-trial';

// Prices: a million of each token type.
const M = 1_000_000;
const all = { input_tokens: M, output_tokens: M, cache_creation_input_tokens: M, cache_read_input_tokens: M };
assert.equal(Math.round(claudeCost('claude-opus-5-5', all) * 100) / 100, 4 + 20 + 5 + 0.2);
assert.equal(Math.round(claudeCost('claude-sonnet-5-5', all) * 100) / 100, 2 + 10 + 2.5 + 0.1);
assert.throws(() => claudeCost('claude-unknown', all));
// Worst case: 2,500 characters → 1,000 tokens at the cache-write price, plus every output token.
assert.equal(worstCaseClaudeUsd('claude-opus-5-5', 2500, 4000).toFixed(4), (1000 * 5e-6 + 4000 * 20e-6).toFixed(4));

// Shape: the system prompt becomes a cached system block; the reminder retry stays a second user turn.
const shaped = toAnthropic([
  { role: 'system', content: 'S' },
  { role: 'user', content: 'Q' },
  { role: 'user', content: 'reminder' },
]);
assert.deepEqual(shaped.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
assert.deepEqual(shaped.messages.map((m) => m.role), ['user', 'user']);
assert.throws(() => toAnthropic([{ role: 'user', content: 'Q' }, { role: 'system', content: 'late' }]));

// The cap: checked before a call with its worst case, kept across runs in its file.
const file = path.join(mkdtempSync(path.join(tmpdir(), 'trial-')), 'ledger.json');
const l = new Ledger(file, 5);
l.check(4.99, 'first');
l.add('claude-opus-5-5', 4.9);
assert.throws(() => l.check(0.2, 'next'), CapReached);
const again = new Ledger(file, 5);
assert.equal(again.spentUsd, 4.9);
assert.equal(JSON.parse(readFileSync(file, 'utf8')).by_model['claude-opus-5-5'], 4.9);

// The call: headers, body (no temperature, effort set, cached system), text from text blocks only, cost from usage.
let sent: { url: string; init: RequestInit } | null = null;
let tries = 0;
const fake = (async (url: string, init: RequestInit) => {
  sent = { url, init };
  if (tries++ === 0) return new Response('{}', { status: 529, headers: { 'retry-after': '0.01' } });
  return new Response(JSON.stringify({
    id: 'msg_1', model: 'claude-sonnet-5-5', stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Answer [c1-b2]' }],
    usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  }), { status: 200 });
}) as unknown as typeof fetch;
let busy = 0;
const r = await callClaude({ key: 'test', model: 'claude-sonnet-5-5', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'Q' }], maxTokens: 4000, effort: 'medium', fetchImpl: fake, onBusy: () => busy++ });
assert.equal(busy, 1);
assert.equal(r.text, 'Answer [c1-b2]');
assert.equal(r.costUsd.toFixed(6), (1000 * 2e-6 + 500 * 10e-6).toFixed(6));
const s = sent as unknown as { url: string; init: RequestInit };
assert.equal(s.url, 'https://api.anthropic.com/v1/messages');
const h = s.init.headers as Record<string, string>;
assert.equal(h['anthropic-version'], '2023-06-01');
const body = JSON.parse(String(s.init.body));
assert.equal(body.temperature, undefined);
assert.deepEqual(body.output_config, { effort: 'medium' });
assert.equal(body.system[0].cache_control.type, 'ephemeral');

console.log('claude trial helpers: ok');
