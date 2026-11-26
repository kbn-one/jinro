/**
 * Ids and keys for rooms and players.
 *
 * Ids are short and public (they go in links). Keys are 256-bit secrets handed out once and sent
 * back as `Authorization: Bearer <key>`; only their SHA-256 is stored, so the store leaking does
 * not let anyone act as a player.
 */

const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // no 0/1/i/l/o

/** A random id of `length` unambiguous characters (31^10 ≈ 2^49 for rooms). */
export function newId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  // 31 does not divide 256; the bias (< 1 %) does not matter for ids.
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join(
    "",
  );
}

/** A random 256-bit key, base64url. */
export function newKey(): string {
  return crypto.getRandomValues(new Uint8Array(32)).toBase64({
    alphabet: "base64url",
    omitPadding: true,
  });
}

export async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return new Uint8Array(digest).toHex();
}

/** The bearer token of a request, if any. */
export function bearer(request: Request): string | null {
  const m = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

/** Whether `key` hashes to `hash`, comparing in constant time. */
export async function keyMatches(
  key: string | null,
  hash: string,
): Promise<boolean> {
  if (!key) return false;
  const a = await hashKey(key);
  if (a.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

/** A uniformly random permutation (Fisher–Yates over crypto randomness). */
export function shuffle<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A uniform integer in [0, n), by rejection sampling. */
function randomBelow(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}
