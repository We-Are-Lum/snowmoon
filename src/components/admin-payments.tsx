'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch, useAuth } from '~/lib/client-auth';
import { isAdmin } from '~/lib/admins';

/**
 * /admin/payments for a signed-in admin (owner, 2026-11-25; branch ephelion-paid): the prepaid ledger. Everyone else,
 * and everyone until their sign-in is known, sees `fallback` (the site's usual "not found"). Payments in, charges with
 * what each bought, what was added back, refunds, and totals by UTC day; and a form to record a refund already sent.
 * Shown in time order only: nothing here orders anything by amount (P7).
 */
type Row = Record<string, string | number | null>;
type Ledger = { payments: Row[]; charges: Row[]; totals: Row[] };
const usd = (v: unknown) => `$${Number(v ?? 0).toFixed(3)}`;
const short = (a: unknown) => (typeof a === 'string' && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a ?? ''));
const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 16).replace('T', ' ') : '');

export function AdminPayments({ fallback }: { fallback: React.ReactNode }) {
  const auth = useAuth();
  const admin = auth.kind === 'signed-in' && isAdmin(auth.fid);
  const [l, setL] = useState<Ledger | null>(null);
  const [debitId, setDebitId] = useState('');
  const [tx, setTx] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await authFetch('/api/admin/payments', { cache: 'no-store' }).catch(() => null);
    setL(r?.ok ? ((await r.json()) as Ledger) : null);
  }, []);
  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);
  if (!admin) return <>{fallback}</>;
  if (!l) return <main className="admin-payments"><p>Loading the ledger…</p></main>;
  const refund = async () => {
    setNote(null);
    const r = await authFetch('/api/admin/payments/refund', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ debitId: Number(debitId), txHash: tx }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { error?: string; to?: string };
    setNote(r?.ok ? `Refund recorded, to ${short(out.to)}.` : out.error ?? 'Could not record it.');
    if (r?.ok) void load();
  };
  return (
    <main className="admin-payments">
      <h1>Payments</h1>
      <p>Prepaid balances: every payment, every charge with what it bought, what was added back, and refunds. Admins only; never public.</p>
      <h2>By day (UTC)</h2>
      <table>
        <thead><tr><th>Day</th><th>Paid in</th><th>Charged</th><th>of which paid items</th><th>Added back</th><th>Refunded</th></tr></thead>
        <tbody>{l.totals.map((t) => <tr key={String(t.day)}><td>{t.day}</td><td>{usd(t.paid)}</td><td>{usd(t.spent)}</td><td>{usd(t.paidItems)}</td><td>{usd(t.addedBack)}</td><td>{usd(t.refunded)}</td></tr>)}</tbody>
      </table>
      <h2>Charges</h2>
      <table>
        <thead><tr><th>#</th><th>When</th><th>Account</th><th>Person</th><th>Bought</th><th>For</th><th>Price</th><th>Added back</th><th>Refund</th></tr></thead>
        <tbody>{l.charges.map((c) => <tr key={String(c.id)}><td>{c.id}</td><td>{day(c.at)}</td><td>{c.account}</td><td>{c.person ?? ''}</td><td>{c.item ?? 'image or remix'}</td><td>{c.ref ?? ''}</td><td>{usd(c.usd)}</td><td>{c.addedBack ?? ''}</td><td>{short(c.refundTx)}</td></tr>)}</tbody>
      </table>
      <h2>Payments in</h2>
      <table>
        <thead><tr><th>When</th><th>Account</th><th>Wallet</th><th>Token</th><th>Dollars</th><th>Transaction</th></tr></thead>
        <tbody>{l.payments.map((p) => <tr key={String(p.txHash)}><td>{day(p.at)}</td><td>{p.account}</td><td>{short(p.address)}</td><td>{p.token}</td><td>{usd(p.usd)}</td><td>{short(p.txHash)}</td></tr>)}</tbody>
      </table>
      <h2>Record a refund</h2>
      <p>For a paid charge we couldn’t make, after it was added back. Send the USDC on Base to the balance’s own wallet first, then record its transaction here.</p>
      <form onSubmit={(e) => { e.preventDefault(); void refund(); }}>
        <label>Charge # <input value={debitId} onChange={(e) => setDebitId(e.target.value)} inputMode="numeric" /></label>
        <label>Refund transaction <input value={tx} onChange={(e) => setTx(e.target.value)} placeholder="0x…" /></label>
        <button type="submit" className="ic-secondary" disabled={!debitId || !tx}>Record the refund</button>
      </form>
      {note && <p role="status">{note}</p>}
    </main>
  );
}
