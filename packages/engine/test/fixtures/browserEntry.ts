/**
 * The entry point the browser sandbox test bundles.
 *
 * ⭐ IT IMPORTS THE PACKAGE THE WAY A HOST WOULD — through `src/index.ts`, so
 * the bundle under test is the real dependency graph and not a shortcut to the
 * writer. The fixture document is built in-bundle so nothing has to cross the
 * `vm` boundary except the finished bytes.
 */

import { buildTimetableModel, bufferTimetableWorkbook } from "../../src/index";
import { makeFixtureDocument } from "./schoolDocument";

export async function generate(
  nowMs: number,
  password: string,
): Promise<Uint8Array> {
  const built = buildTimetableModel({
    document: makeFixtureDocument(),
    now: nowMs,
    generatedBy: "Fixture",
    password,
  });
  if (!built.ok) throw new Error(built.error);
  return bufferTimetableWorkbook(built.model);
}
