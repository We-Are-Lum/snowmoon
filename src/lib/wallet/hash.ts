/**
 * A transaction hash from what a person pastes (owner, 2026-10-15): the hash itself, or a block
 * explorer link that holds it. Null when there is none, or more than one different hash.
 * Used by the balance screen's "add a payment by its hash" box; the server checks the rest.
 */
export function txHashFrom(input: string): `0x${string}` | null {
  const found = [...new Set((input.match(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g) ?? []).map((h) => h.toLowerCase()))];
  return found.length === 1 ? (found[0] as `0x${string}`) : null;
}
