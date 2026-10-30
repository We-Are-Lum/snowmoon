export {};
/**
 * Hide routes answer 503 "try again" when the database fails, never a bare 500 (2026-10-19, docs/db-interleave.md).
 * The database here is an address nothing listens on, so every query fails at once.
 *   npm run test:try-again
 * With the Dashboard, the image and scene Hide routes take a wallet sign-in too, so all four are checked here.
 */
process.env.IMAGES_TICKET_SECRET = 'x'.repeat(48);
process.env.STUDIO_DATABASE_URL = 'postgres://studio_writer@127.0.0.1:9/postgres';
const { signSession } = await import('../src/lib/wallet/session');
const { TRY_AGAIN } = await import('../src/lib/try-again');
const routes: Record<string, [(r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>, string]> = {
  'remix frame Hide': [(await import('../src/app/api/remix/[id]/hide/route')).POST, '00000000-0000-0000-0000-000000000000'],
  'storyboard Hide': [(await import('../src/app/api/remix/storyboard/[id]/hide/route')).POST, '00000000-0000-0000-0000-000000000000'],
  'image Hide': [(await import('../src/app/api/images/[id]/hide/route')).POST, '00000000-0000-0000-0000-000000000000'],
  'scene Hide': [(await import('../src/app/api/scenes/[id]/hide/route')).POST, '1'],
};
const failures: string[] = [];
let passed = 0;
const token = signSession(42, '0x' + '1'.repeat(40))!;
const quiet = console.error;
console.error = () => {};
for (const [name, [POST, id]] of Object.entries(routes)) {
  const res = await POST(new Request('https://snowmoon.party/x', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}' }), { params: Promise.resolve({ id }) });
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
