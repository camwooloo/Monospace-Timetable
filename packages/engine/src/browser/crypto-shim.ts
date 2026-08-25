/**
 * ══════════════════════════════════════════════════════════════════════════
 *  `crypto`, FOR THE THREE FUNCTIONS EXCELJS ACTUALLY CALLS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `exceljs/lib/utils/encryptor.js` is the whole of exceljs's use of `crypto`,
 * and it calls exactly three things: `createHash`, `getHashes` and
 * `randomBytes`. This provides those and nothing else.
 *
 * ── ⚠️ WHY NOT `crypto-browserify` ───────────────────────────────────────
 * It is the obvious alias and it brings ciphers, HMAC, Diffie-Hellman, ECDH
 * and public-key crypto with it — hundreds of kilobytes of code this package
 * can never reach, in a bundle whose whole selling point is that a school can
 * download one file. `create-hash` and `randombytes` are the two leaves of it
 * that are actually used.
 *
 * ── ⚠️⚠️ AND WHY NOT WebCrypto, WHICH IS RIGHT THERE ─────────────────────
 * Because `SubtleCrypto.digest()` is ASYNC and this hash cannot be.
 * `convertPasswordToHash` runs a loop of `spinCount` (100,000) sequential
 * SHA-512 rounds, each one feeding the next, inside a SYNCHRONOUS function
 * that returns a string. exceljs's own comment names the reason it cannot use
 * `pbkdf2` either: the four-byte little-endian iterator concatenated onto each
 * round is "the 'special' element of Excel password hashing". Turning that
 * loop async would mean changing exceljs, which is the one thing this port
 * does not do.
 *
 * `randomBytes` DOES sit on `crypto.getRandomValues` underneath — that part is
 * synchronous in the browser — so the salt is still cryptographically strong
 * and is not a `Math.random()` stand-in. ⭐ THAT MATTERS: the salt is one of
 * the three values the fixture gate normalises precisely because it must be
 * different in every workbook in the world.
 */

import createHash from "create-hash";
import randomBytes from "randombytes";

/**
 * ⚠️ exceljs CHECKS ITS ALGORITHM AGAINST THIS LIST and throws
 * `Hash algorithm 'sha512' not supported!` if it is absent — so an empty
 * array here is a password path that fails at export time with a confusing
 * message. These are the digests `create-hash` implements.
 */
export function getHashes(): string[] {
  return ["sha1", "sha224", "sha256", "sha384", "sha512", "md5", "rmd160"];
}

export { createHash, randomBytes };

export default { createHash, getHashes, randomBytes };
