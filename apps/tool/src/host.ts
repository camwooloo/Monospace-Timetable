/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ THE HOST — ONE CODE PATH, A THIN ADAPTER, AND NEVER TWO APPS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The same document is the standalone `timetable.html` a school downloads AND
 * the page the Rust shell embeds. ⚠️ THE ONLY THING THAT MAY DIFFER BETWEEN
 * THEM IS **HOW BYTES REACH THE DISK** — a browser has a file picker and a
 * download, the shell has a native dialog and `std::fs`. Everything above this
 * file is identical, and a screen that branches on `isShell()` is a bug: two
 * behaviours for one subject is exactly what Monospace's own CLAUDE.md records
 * as multiplying every feature and every bug by N.
 *
 * ── ⚠️⚠️ THIS FILE ONCE DESCRIBED A PROTOCOL THE SHELL DOES NOT SPEAK ─────
 * It documented `window.__TIMETABLE_HOST__`, requests shaped `{ id, op }` with
 * ops `openDoc`/`saveDoc`/`openUrl`, and replies through
 * `window.__timetableReply(id, …)`. **Rust implements none of that.** It
 * injects `window.MonospaceShell`, reads `message["type"]` with ops
 * `openDocument`/`saveDocument`/`openExternal`, and answers by calling
 * `window.MonospaceShell.receive(...)`.
 *
 * Nothing connected. `detect()` never found its flag, so the exe ran as a
 * BROWSER: no native dialogs, no working copy on disk, and — the one Cam asked
 * for by name — no auto-update, because nothing ever sent `checkUpdate`. Rust's
 * unknown-message arm is `_ => {}`, so every call was swallowed in silence.
 * Both halves compiled, both test suites passed, and no test crosses the
 * bridge. This file now speaks the protocol the shell actually implements.
 *
 * ── ⭐ HOW THE SHELL IS DETECTED ─────────────────────────────────────────
 * Rust injects, before this script runs, an object with `present: true`,
 * `send`, `onMessage` and `receive`. Its `receive` BUFFERS until a handler is
 * registered, which is why registration happens at module load and not at
 * first use. Sniffing the user agent or `window.ipc` alone would both be
 * wrong: a WebView2 page served from a real web server is a BROWSER as far as
 * this file is concerned — it has no `std::fs` behind it.
 *
 * ── ⚠️ THE PROTOCOL, WRITTEN DOWN BECAUSE TWO PROGRAMS SHARE IT ───────────
 * Requests are one JSON object with a `type`:
 *
 *     → { type: "ready" }                                    ask for the boot payload
 *     → { type: "openDocument" }                             pick a file, read it
 *     → { type: "saveDocument", text, suggestedName, path }  native save dialog;
 *                                                             a non-empty `path`
 *                                                             saves straight there
 *     → { type: "saveWorkbook", base64, suggestedName }       ditto, for the .xlsx
 *     → { type: "openExternal", url }                         the system browser
 *     → { type: "drag" | "minimize" | "toggleMaximize" | "close" }
 *
 * ⚠️ REPLIES ARE AN EVENT STREAM AND CARRY NO REQUEST ID. Rust answers with
 * `{ type: "documentOpened" | "documentOpenCancelled" | "documentSaved" | … }`.
 * So a call is matched to its answer by FAMILY, and only one of each family can
 * be outstanding — which is true by construction: each is a modal OS dialog,
 * and a second cannot be opened while the first is up. A second call while one
 * is pending settles the first as cancelled rather than leaking it.
 *
 * ⚠️ `Cancelled` IS NOT AN ERROR AND MUST NOT BE SHOWN AS ONE. A school that
 * presses Escape on a save dialog has not hit a fault, and a red toast saying
 * so teaches them the app is broken. Every caller here maps it to `null`.
 *
 * ⚠️ THE WORKBOOK CROSSES THE BRIDGE AS BASE64 and not as a byte array. wry's
 * IPC is a string channel; a 250 KB `Uint8Array` serialised as a JSON array of
 * integers is ~1.2 MB of text, and `JSON.parse` on the Rust side has to build
 * every one of them. Base64 is 1.33x and `base64::decode` is a memcpy.
 */

export type HostKind = "browser" | "shell";

type ShellMessage = Record<string, unknown> & { type?: string };

declare global {
  interface Window {
    /** Injected by `bridge::INIT_SCRIPT` before any app code runs. */
    MonospaceShell?: {
      present?: boolean;
      send: (message: unknown) => void;
      onMessage: (fn: (message: ShellMessage) => void) => void;
      receive: (message: ShellMessage) => void;
    };
    ipc?: { postMessage: (msg: string) => void };
  }
}

/** What the app got back. `null` means the person cancelled. */
export type OpenedFile = { name: string; text: string } | null;

export interface Host {
  readonly kind: HostKind;
  readonly version: string;
  /** Pick and read a `.timetable.json`. `null` if cancelled. */
  openDocument(): Promise<OpenedFile>;
  /** Write the document. Returns the name it landed under, or `null`. */
  saveDocument(json: string, suggested: string): Promise<string | null>;
  /** Write the workbook. Returns the name it landed under, or `null`. */
  saveWorkbook(bytes: Uint8Array, suggested: string): Promise<string | null>;
  /** Open a URL where a URL belongs — a real browser, never in the app. */
  openExternal(url: string): void;
  /**
   * ⭐ THE WINDOW ITSELF. The shell is FRAMELESS (`with_decorations(false)`),
   * so the title bar is the front-end's job — and for a long time the front
   * end did not draw one, which left a window that could not be moved,
   * minimised or closed except by Alt+F4. In a browser these are no-ops: a
   * page cannot move the window it is in, and `WindowBar` is not rendered.
   */
  /**
   * ⚠️⚠️ FORGET WHERE THE OPEN DOCUMENT LIVED. Called whenever the document on
   * screen stops being the one on disk — New, and a restore from the browser's
   * courtesy backup.
   *
   * Without it the remembered path outlives the document it belonged to, and
   * the next Save writes the NEW timetable straight over the school's OLD file
   * with no dialog and nothing on screen having said so. The path exists to
   * stop Ctrl+S re-prompting; it must never outlive its document.
   */
  forgetDocumentPath(): void;
  windowDrag(): void;
  windowMinimize(): void;
  windowToggleMaximize(): void;
  windowClose(): void;
}

/** Told when the shell's boot payload lands, so the version can be shown. */
const bootWaiters = new Set<() => void>();
export function onShellBoot(fn: () => void): void {
  bootWaiters.add(fn);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SHELL
   ══════════════════════════════════════════════════════════════════════════ */

/** One outstanding request per family — see the banner. */
type Family = "open" | "saveDoc" | "saveBook";
type Settle = (value: unknown) => void;

const pending = new Map<Family, { settle: Settle; fail: (e: Error) => void }>();

function shellSend(message: ShellMessage): void {
  window.MonospaceShell?.send(message);
}

/**
 * Await one family's answer.
 *
 * ⚠️ A SECOND CALL SETTLES THE FIRST AS CANCELLED rather than replacing it and
 * leaking a promise nobody will ever resolve. It should not happen — each of
 * these is a modal OS dialog — but a promise that never settles leaves a button
 * spinning for ever with nothing in the console, which is the worst shape this
 * can fail in.
 */
function awaitFamily<T>(family: Family, message: ShellMessage): Promise<T> {
  const existing = pending.get(family);
  if (existing) existing.settle(null);
  return new Promise<T>((resolve, reject) => {
    pending.set(family, { settle: resolve as Settle, fail: reject });
    shellSend(message);
  });
}

function answer(family: Family, value: unknown): void {
  const waiter = pending.get(family);
  if (!waiter) return;
  pending.delete(family);
  waiter.settle(value);
}

function refuse(family: Family, message: string): void {
  const waiter = pending.get(family);
  if (!waiter) return;
  pending.delete(family);
  waiter.fail(new Error(message));
}

/** The version Rust reports, once its boot payload has landed. */
let shellVersion = "";
/**
 * ⭐ WHERE THE OPEN DOCUMENT LIVES ON DISK, so Ctrl+S can write straight to it.
 * Rust's `saveDocument` saves without a dialog when `path` is non-empty —
 * re-prompting on every save is the difference between a tool and a chore.
 */
let documentPath = "";

/* ⚠️ REGISTERED AT MODULE LOAD, NOT AT FIRST USE. `MonospaceShell.receive`
   buffers messages until a handler exists, and Rust may answer the `ready`
   below before any screen has mounted. */
window.MonospaceShell?.onMessage((message: ShellMessage) => {
  const text = (key: string) => (typeof message[key] === "string" ? (message[key] as string) : "");
  switch (message.type) {
    case "boot":
      shellVersion = text("version") || "0.0.0";
      for (const fn of bootWaiters) fn();
      break;

    case "documentOpened":
      documentPath = text("path");
      answer("open", { name: text("name") || "timetable", text: text("text") });
      break;
    case "documentOpenCancelled":
      answer("open", null);
      break;
    case "documentOpenFailed":
      refuse("open", text("message") || "The file could not be opened.");
      break;

    case "documentSaved":
      documentPath = text("path");
      answer("saveDoc", text("name") || null);
      break;
    case "documentSaveCancelled":
      answer("saveDoc", null);
      break;
    case "documentSaveFailed":
      refuse("saveDoc", text("message") || "The file could not be saved.");
      break;

    case "workbookSaved":
      answer("saveBook", text("name") || null);
      break;
    case "workbookSaveCancelled":
      answer("saveBook", null);
      break;
    case "workbookSaveFailed":
      refuse("saveBook", text("message") || "The workbook could not be saved.");
      break;

    /* ⚠️ EVERYTHING ELSE IS DELIBERATELY IGNORED. Rust also sends the working
       copy and the update messages; the page does not use them yet, and a
       `default:` that threw would turn a feature the shell has and the page
       has not into a crash. */
    default:
      break;
  }
});

/* Ask for the boot payload as soon as the channel exists. Its only consumer
   today is the version on the About screen, which is why a late answer is a
   repaint rather than a blocked start. */
if (window.MonospaceShell?.present) shellSend({ type: "ready" });

function bytesToBase64(bytes: Uint8Array): string {
  /* ⚠️ CHUNKED. `String.fromCharCode(...bytes)` spreads every byte as an
     argument and blows the call-stack limit somewhere around 100 KB — and the
     workbook is a quarter of a megabyte, so this would fail on real files and
     pass on every small one somebody tested with. */
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

class ShellHost implements Host {
  readonly kind = "shell" as const;
  get version(): string {
    return shellVersion || "0.0.0";
  }

  openDocument(): Promise<OpenedFile> {
    return awaitFamily<OpenedFile>("open", { type: "openDocument" });
  }

  saveDocument(json: string, suggested: string): Promise<string | null> {
    return awaitFamily<string | null>("saveDoc", {
      type: "saveDocument",
      text: json,
      suggestedName: suggested,
      /* Empty until the document has a home; Rust reads that as "ask". */
      path: documentPath,
    });
  }

  saveWorkbook(bytes: Uint8Array, suggested: string): Promise<string | null> {
    return awaitFamily<string | null>("saveBook", {
      type: "saveWorkbook",
      base64: bytesToBase64(bytes),
      suggestedName: suggested,
    });
  }

  openExternal(url: string) {
    shellSend({ type: "openExternal", url });
  }

  forgetDocumentPath() {
    documentPath = "";
  }

  windowDrag() {
    shellSend({ type: "drag" });
  }
  windowMinimize() {
    shellSend({ type: "minimize" });
  }
  windowToggleMaximize() {
    shellSend({ type: "toggleMaximize" });
  }
  windowClose() {
    shellSend({ type: "close" });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE BROWSER
   ══════════════════════════════════════════════════════════════════════════ */

class BrowserHost implements Host {
  readonly kind = "browser" as const;
  readonly version = "web";

  openDocument(): Promise<OpenedFile> {
    /* ⚠️ A PLAIN `<input type="file">` AND NOT `showOpenFilePicker`. The File
       System Access API is Chromium-only, and — the part that decides it — it
       throws `SecurityError` on a page opened from `file://`, which is exactly
       how a school opens the single downloaded HTML. The one surface it would
       improve is the one surface it does not work on. */
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.timetable.json,application/json";
      /* ⚠️ `cancel` IS NOT UNIVERSAL, so a dismissed picker may resolve
         never. That is deliberate rather than sloppy: the alternative is a
         focus/timeout race that fires a spurious "cancelled" on a slow disk,
         and a promise that never settles here only leaves one dead listener —
         the button is not disabled while it waits. */
      input.addEventListener("cancel", () => resolve(null));
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        resolve({ name: file.name, text: await file.text() });
      });
      input.click();
    });
  }

  async saveDocument(json: string, suggested: string): Promise<string | null> {
    this.download(new Blob([json], { type: "application/json" }), suggested);
    return suggested;
  }

  async saveWorkbook(bytes: Uint8Array, suggested: string): Promise<string | null> {
    this.download(
      new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      suggested,
    );
    return suggested;
  }

  private download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* One turn of the event loop, then let it go — revoking synchronously
       races the navigation the click started in Safari. */
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  openExternal(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /* Nothing to forget: a browser save is a download and never has a path. */
  forgetDocumentPath() {}

  /* No-ops: a page cannot move the window it is in, and `WindowBar` is not
     drawn in a browser. Present so nothing above this file has to ask which
     host it is talking to. */
  windowDrag() {}
  windowMinimize() {}
  windowToggleMaximize() {}
  windowClose() {}
}

/* ══════════════════════════════════════════════════════════════════════════
   PICKING ONE
   ══════════════════════════════════════════════════════════════════════════ */

function detect(): Host {
  /* ⚠️ BOTH HALVES, NOT JUST THE FLAG. `MonospaceShell` is injected by Rust and
     `window.ipc` is supplied by wry; a half-present shell that took the shell
     path would hang on the first save with no way to recover, and falling back
     to the download always produces the file. */
  if (window.MonospaceShell?.present && typeof window.ipc?.postMessage === "function") {
    return new ShellHost();
  }
  return new BrowserHost();
}

export const host: Host = detect();
export const isShell = host.kind === "shell";
