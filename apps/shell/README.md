# `apps/shell` — the portable Windows app

One `.exe`. No installer, no runtime to deploy, nothing in the registry. A school
copies it onto a machine or a shared drive and it runs.

```
cd apps/shell                # ⚠️ not the repo root — see "Building" below
cargo xwin build --release --target x86_64-pc-windows-msvc
python3 scripts/check-static-crt.py \
  target/x86_64-pc-windows-msvc/release/MonospaceTimetable.exe
```

## Where the fence is

**Rust owns** the window, the updater, file open/save, and the IPC bridge.
**The webview owns the workbook.**

The engine is Monospace's own TypeScript, running unchanged inside the webview,
and the `.xlsx` bytes come back over the bridge already made. That is not a
convenience — `timetableSheet.ts` carries hundreds of measured OKLab constants
whose own rule is *measure, never reason from the constants*, and a second writer
in Rust is how the printed sheet quietly stops matching the screen. There is one
writer. It is in TypeScript.

So: no zip writing here, no cell formatting, no colour maths. A change to this
crate that needs any of those is in the wrong crate.

## The bridge

`src/bridge.rs` is the contract, and its doc comment is the reference — every
message, both directions, in a table. The short version:

```js
window.MonospaceShell.onMessage(function (m) { /* boot, documentOpened, … */ });
window.MonospaceShell.send({ type: "ready" });
```

Three things the front-end must know:

- **`window.MonospaceShell` exists only inside the app.** In the standalone HTML,
  and in the browser fallback below, it is `undefined` and the page should use
  `<input type="file">` and a download instead. Test for the object, never for a
  user-agent string.
- **Cancel is not failure.** Every dialog has its own `…Cancelled` reply. Folding
  it into the failure branch gives you an app that reports a problem every time
  somebody changes their mind, which teaches people to ignore the message that
  matters.
- **Messages are queued until you register a handler**, so `boot` cannot be lost
  to a slow mount. `boot` is the one carrying where files are being saved and
  whether this copy can update itself.

The document is served over a custom protocol, not `with_html`, so it gets a real
origin and `localStorage` works. wry rewrites the URL per platform — on Windows it
becomes `https://monospace.localhost/index.html`. Do not hard-code either form.

## Three things that go wrong in schools

**No WebView2.** An old desktop on an image nobody has touched since 2019 has no
Edge WebView2 Runtime, and a `wry` app on it is a black rectangle. `src/webview2.rs`
checks *before* any window exists — `GetAvailableCoreWebView2BrowserVersionString`
first, then EdgeUpdate's `pv` value in all three places an install can land, with
`0.0.0.0` treated as absent because that is EdgeUpdate's own sentinel for "not
installed". When it is missing, the embedded document is written to `%TEMP%`,
handed to the default browser, and **one** message box explains what happened. The
school gets its timetable today.

> ⚠️ Never bundle the fixed-version runtime instead. It is over 250 MB — eighty
> times this whole app — and Microsoft states it cannot run from a network share,
> which is exactly where a school will put it.

**A read-only location.** The app gets run from a network share or `Program Files`,
so the update's rename cannot succeed and the data folder beside the exe cannot be
created. Both are *decided*, not discovered:

| | what happens |
|---|---|
| Data folder | `MonospaceTimetable-Data` beside the exe → `%APPDATA%` → `%TEMP%`. The boot payload carries `dataDirKind` **and** `dataDirNote`, a sentence for the UI to show. A portable app that quietly writes somewhere else is how a term's work gets left on a machine nobody logs into again. |
| Updating | `update::writability()` runs at startup, so `updateAvailable` arrives with `canApply: false` and a reason. The UI offers the download link instead of an Apply button that was always going to fail. If it fails anyway, `ApplyError` says which failure it was, in words a teacher can act on. |

**A filtering proxy.** School networks intercept TLS with a private CA and answer
blocked downloads with a 200. Hence `try_proxy_from_env`, the `native-certs`
feature in `Cargo.toml`, and a check that the downloaded bytes start with `MZ` — a
size check alone happily accepts a 900 KB "Access Denied" page as a binary. And a
failed check is reported as `updateCheckFailed`, never as `updateUpToDate`; they
are not the same reassurance.

## Building

⚠️ **Build from `apps/shell/`, not the repo root.** `+crt-static` lives in
`.cargo/config.toml`, and cargo resolves that file by *current working directory*,
not by manifest path. Build from the wrong folder and the flag is silently dropped,
the exe needs the VC++ redistributable, and it fails on the locked-down PCs least
able to install one — with a dialog that names a DLL rather than the app.

`scripts/check-static-crt.py` is the check that settles it. It reads the PE import
table and fails on `vcruntime` / `msvcp` / `api-ms-win-crt-*` / `ucrtbase`, on a
console subsystem (which would flash a black window on every launch), and on the
wrong machine type. Run it on every release artefact.

### Wiring in the front-end

`build.rs` stages one document at `$OUT_DIR/app.html` and `src/html.rs` includes it:

- `MONOSPACE_TIMETABLE_HTML=/path/to/timetable.html` if it is set, which is how CI
  points at the artefact the front-end job produced — it WINS over the default below;
- otherwise `../tool/dist/timetable.html` if it exists — the constant is
  `FRONTEND_HTML` in `build.rs`, and it has to name the same file as `apps/tool`'s
  build script and as `HTML_ARTEFACT` in both workflows;
- otherwise `assets/placeholder.html`, with a build warning.

The placeholder is not filler: it exercises **every** message in the bridge, so the
shell can be smoke-tested on a real Windows machine before the front-end exists,
and a failing school build can be narrowed to "shell" or "front-end" in one screen.
`--diagnostics` reports which of the three was embedded.

It must be **one self-contained document** — no `<script src>`, no external
stylesheet, no CDN. The same bytes get written to `%TEMP%` and opened in a plain
browser when WebView2 is missing, and anything fetched at runtime is a blank page
on the machines that need the fallback most.

### The icon

`assets/icon.png` is picked up by `build.rs` and embedded as the exe's file icon.
It is currently absent, so the build warns and ships without one. Note the
`#[cfg(windows)]` there is the **host**: a cross-build from macOS skips it
entirely, and the release builds on `windows-latest` are where it takes effect.

## Command line

| | |
|---|---|
| *(none)* | open the app |
| `--diagnostics` | JSON: WebView2, where files go, whether it can self-update. For support calls. |
| `--html [PATH]` | write the app out as a single self-contained page and print where it went |
| `--version`, `--help` | |

## What has actually been proven

| Claim | Evidence |
|---|---|
| It links for Windows, static CRT, GUI subsystem, x86-64 | `scripts/check-static-crt.py` on the cross-built exe |
| The bridge works end to end | run on macOS: page load over the custom protocol → init script → `ready` → `boot` → `writeWorkingCopy` → file on disk |
| The read-only fallbacks fire | `chmod 555` the exe's folder, then `--diagnostics` |
| 13 unit tests | `cargo test` |

⚠️ **A cross-build proves it links and nothing more. It has never proved one
starts.** The WebView2 pre-flight, the exe swap, the registry probe and the
message box have all been *compiled* for Windows and none of them have been *run*
there. CI on `windows-latest` is where that gets settled.
