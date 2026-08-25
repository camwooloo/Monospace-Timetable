/**
 * Types for the two crypto leaves `src/browser/crypto-shim.ts` stands on.
 *
 * ⚠️ Neither package ships types and neither has a `@types/` entry. They are
 * declared to the SHAPE EXCELJS CALLS and no wider — `encryptor.js` uses
 * `createHash(algorithm)` → `.update(buf)` → `.digest()`, and `randomBytes(n)`.
 * A broader declaration would be inventing an API surface nobody has checked.
 */

declare module "create-hash" {
  type Hash = {
    update(data: Uint8Array | string): Hash;
    digest(): Uint8Array;
    digest(encoding: string): string;
  };
  function createHash(algorithm: string): Hash;
  export = createHash;
}

declare module "randombytes" {
  function randomBytes(size: number): Uint8Array;
  export = randomBytes;
}
