"""The ruleset ID, computed independently of the TypeScript (onchain v1 spike).

Reads a manifest (docs/minpentai/rulesets/solo-v1.json), serialises it as RFC 8785 (JCS) for the
values it may hold (objects, arrays, ASCII strings, integers, booleans, null; anything else is
refused), and hashes it with Keccak-256 written out here from the spec (FIPS 202's Keccak-f[1600]
with the original 0x01 padding, as Ethereum uses), so no library is shared with the TS side.

    python3 -I scripts/minpentai_ruleset_id.py docs/minpentai/rulesets/solo-v1.json
"""
import json
import sys

RC = [0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000, 0x000000000000808B,
      0x0000000080000001, 0x8000000080008081, 0x8000000000008009, 0x000000000000008A, 0x0000000000000088,
      0x0000000080008009, 0x000000008000000A, 0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
      0x8000000000008003, 0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
      0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008]
ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
M = (1 << 64) - 1


def rol(v, n):
    return ((v << n) | (v >> (64 - n))) & M if n else v


def keccak_f(a):
    for rc in RC:
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ rol(c[(x + 1) % 5], 1) for x in range(5)]
        a = [[a[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = rol(a[x][y], ROT[x][y])
        a = [[b[x][y] ^ (~b[(x + 1) % 5][y] & b[(x + 2) % 5][y]) for y in range(5)] for x in range(5)]
        a[0][0] ^= rc
    return a


def keccak256(data: bytes) -> str:
    rate = 136
    msg = bytearray(data) + b'\x01'
    while len(msg) % rate:
        msg += b'\x00'
    msg[-1] |= 0x80
    a = [[0] * 5 for _ in range(5)]
    for off in range(0, len(msg), rate):
        block = msg[off:off + rate]
        for i in range(rate // 8):
            x, y = i % 5, i // 5
            a[x][y] ^= int.from_bytes(block[8 * i:8 * i + 8], 'little')
        a = keccak_f(a)
    out = b''.join(a[i % 5][i // 5].to_bytes(8, 'little') for i in range(4))
    return '0x' + out.hex()


def jcs(v) -> str:
    if v is None:
        return 'null'
    if v is True:
        return 'true'
    if v is False:
        return 'false'
    if isinstance(v, int):
        if abs(v) > 2 ** 53 - 1:
            raise ValueError(f'integer out of the safe range: {v}')
        return str(v)
    if isinstance(v, float):
        raise ValueError(f'a non-integer number: {v}')
    if isinstance(v, str):
        if not v.isascii():
            raise ValueError(f'a non-ASCII string: {v!r}')
        return json.dumps(v, ensure_ascii=True)
    if isinstance(v, list):
        return '[' + ','.join(jcs(x) for x in v) + ']'
    if isinstance(v, dict):
        # JCS sorts keys by UTF-16 code units; for ASCII keys that is plain byte order.
        return '{' + ','.join(jcs(k) + ':' + jcs(v[k]) for k in sorted(v)) + '}'
    raise ValueError(f'not a JSON value: {v!r}')


if __name__ == '__main__':
    assert keccak256(b'') == '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    assert keccak256(b'abc') == '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'
    with open(sys.argv[1], encoding='utf-8') as f:
        print(keccak256(jcs(json.load(f)).encode('ascii')))
