/** The ESM half of `register-hooks.mjs`; see that file's banner. Intercepts
 *  exactly one specifier and passes everything else through. */
const STUB = new URL("../test/stubs/server-only.cjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return { url: STUB, format: "commonjs", shortCircuit: true };
  }
  return next(specifier, context);
}
