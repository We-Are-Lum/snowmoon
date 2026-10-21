export {};
/**
 * Hide routes answer 503 "try again" when the database fails, never a bare 500 (2026-10-19, docs/db-interleave.md).
 * The database here is an address nothing listens on, so every query fails at once.
 *   npm run test:try-again
 * The image Hide route needs a Farcaster sign-in, which can't be signed offline; it is wrapped the same way.
 */
process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
process.env.STUDIO_DATABASE_URL = 'postgres://studio_writer@127.0.0.1:9/postgres';
const { signSession } = await import('../src/lib/wallet/session');
const { TRY_AGAIN } = await import('../src/lib/try-again');
const routes = {
  'remix frame Hide': (await import('../src/app/api/remix/[id]/hide/route')).POST,
  'storyboard Hide': (await import('../src/app/api/remix/storyboard/[id]/hide/route')).POST,
};
const failures: string[] = [];
let passed = 0;
const token = signSession(42, '0x' + '1'.repeat(40))!;
const quiet = console.error;
console.error = () => {};
for (const [name, POST] of Object.entries(routes)) {
  const res = await POST(new Request('https://snowmoon.party/x', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}' }), { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) });
  const j = (await res.json().catch(() => ({}))) as { error?: string; retry?: boolean };
  const ok = res.status === 503 && j.retry === true && j.error === TRY_AGAIN;
  ok ? passed++ : failures.push(`${name}: ${res.status} ${JSON.stringify(j)}`);
}
console.error = quiet;
const { db } = await import('../src/lib/db');
await db()?.end({ timeout: 1 });
if (failures.length) {
  console.error(`TRY-AGAIN TESTS FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`try-again tests passed: ${passed} hide routes answer 503 "try again" when the database fails`);
