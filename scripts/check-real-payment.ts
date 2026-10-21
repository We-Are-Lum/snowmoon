/**
 * The owner's real smart-wallet payment, read from Base (owner, 2026-10-19: "confirm the reader now recognises
 * smart-wallet payments, which arrive as internal transfers … Test with my real tx"). Read only, over Base's public
 * endpoint: no key, no database, nothing credited.
 *   npm run check:real-payment -- <the paying wallet's address>
 * The transaction (0xe1f5f745…717d, Base block 52,762,821) goes to the ERC-4337 EntryPoint v0.6 with no value; the ETH
 * reaches IMAGES.prepaid.payTo as an internal transfer. Passes when the reader credits it to the paying wallet as ETH
 * (about $1) and refuses it for any other wallet.
 */
import { chain, readPayment } from '../src/lib/wallet/chain';

const TX = '0xe1f5f745490f1d7176f5d26a360b68924f9bf5b4e13e93c88790d03e0d48717d' as const;
const payer = process.argv[2];
if (!payer || !/^0x[0-9a-fA-F]{40}$/.test(payer)) {
  console.error('usage: npm run check:real-payment -- <paying wallet address>');
  process.exit(2);
}
const t = await chain().getTransaction({ hash: TX });
const mine = await readPayment(TX, payer);
const other = await readPayment(TX, '0x' + '2'.repeat(40));
const internal = t.to?.toLowerCase() === '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789' && t.value === 0n;
const ok = internal && mine.ok && mine.token === 'ETH' && mine.usd > 0.9 && mine.usd < 1.1 && !other.ok;
console.log(JSON.stringify({ to: t.to, value: String(t.value), internal_transfer: internal, for_payer: mine, for_someone_else: other }, (_, v) => (typeof v === 'bigint' ? String(v) : v)));
console.log(ok ? 'check:real-payment: the reader credits the smart-wallet payment to its payer only' : 'CHECK FAILED');
process.exit(ok ? 0 : 1);
