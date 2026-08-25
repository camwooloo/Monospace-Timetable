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
 * ── ⭐ HOW THE SHELL IS DETECTED, AND WHY IT IS A FLAG RATHER THAN A SNIFF ──
 * Rust injects, before this script runs:
 *
 *     window.__TIMETABLE_HOST__ = { kind: "shell", version: "0.1.0" };
 *
 * and `wry` supplies `window.ipc.postMessage(string)`. Sniffing the user agent
 * or the presence of `window.ipc` alone would both be wrong: a WebView2 page
 * served from a real web server is a BROWSER as far as this file is concerned
 * — it has no `std::fs` behind it — and the flag is the only thing that can
 * say which. It is injected by the host that can actually honour the calls.
 *
 * ── ⚠️ THE SHELL PROTOCOL, WRITTEN DOWN BECAUSE TWO PROGRAMS SHARE IT ─────
 * Requests are JSON, one object, always carrying an `id` this file made up:
 *
 *     → { id, op: "openDoc" }                        pick a file, read it
 *     → { id, op: "saveDoc", json, suggested }       native save dialog
 *     → { id, op: "saveWorkbook", b64, suggested }   ditto, for the .xlsx
 *     → { id, op: "openUrl", url }                   the About link, in the
 *                                                     system browser — a wry
 *                                                     webview navigating away
 *                                                     is the app disappearing
 *
 * ⚠️ FOUR OPERATIONS, AND THAT IS THE WHOLE PROTOCOL. Anything a school can do
 * that does not put bytes on a disk happens in the page. Do not add a fifth
 * "while we are here" — a protocol two programs share is a thing that has to
 * be implemented twice and can go out of step, so it earns its size the way a
 * file format does.
 *
 * Rust answers by CALLING BACK IN, exactly once per id:
 *
 *     window.__timetableReply(id, { ok: true,  value?: … })
 *     window.__timetableReply(id, { ok: false, error: "…", cancelled?: true })
 *
 * ⚠️ `cancelled` IS NOT AN ERROR AND MUST NOT BE SHOWN AS ONE. A school that
 * presses Escape on a save dialog has not hit a fault, and a red toast saying
 * so teaches them the app is broken. Every caller here maps it to `null`.
 *
 * ⚠️ THE WORKBOOK CROSSES THE BRIDGE AS BASE64 and not as a byte array. wry's
 * IPC is a string channel; a 250 KB `Uint8Array` serialised as a JSON array of
 * integers is ~1.2 MB of text, and `JSON.parse` on the Rust side has to build
 * every one of them. Base64 is 1.33× and `base64::decode` is a memcpy.
 */

export type HostKind = "browser" | "shell";

type Reply = { ok: boolean; value?: unknown; error?: string; cancelled?: boolean };

declare global {
  interface Window {
    __TIMETABLE_HOST__?: { kind?: string; version?: string };
    __timetableReply?: (id: number, reply: Reply) => void;
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
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SHELL
   ══════════════════════════════════════════════════════════════════════════ */

let nextId = 1;
const waiting = new Map<number, (r: Reply) => void>();

function shellCall(op: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  return new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    window.ipc?.postMessage(JSON.stringify({ id, op, ...extra }));
  });
}

/* ⚠️ INSTALLED UNCONDITIONALLY, at module load, and not inside the shell
   branch. Rust may reply before the first `await` has been set up if a dialog
   is dismissed instantly, and a missing global there is a request that never
   resolves — a button that stays spinning for ever with nothing in the
   console. Harmless in a browser: nothing ever calls it. */
window.__timetableReply = (id, reply) => {
  const resolve = waiting.get(id);
  if (!resolve) return;
  waiting.delete(id);
  resolve(reply);
};

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
  readonly version: string;
  constructor(version: string) {
    this.version = version;
  }
  async openDocument(): Promise<OpenedFile> {
    const r = await shellCall("openDoc");
    if (!r.ok) {
      if (r.cancelled) return null;
      throw new Error(r.error ?? "The file could not be opened.");
    }
    const v = r.value as { name?: string; text?: string } | undefined;
    if (!v?.text) return null;
    return { name: v.name ?? "timetable", text: v.text };
  }
  async saveDocument(json: string, suggested: string): Promise<string | null> {
    const r = await shellCall("saveDoc", { json, suggested });
    if (!r.ok) {
      if (r.cancelled) return null;
      throw new Error(r.error ?? "The file could not be saved.");
    }
    return String((r.value as { name?: string })?.name ?? suggested);
  }
  async saveWorkbook(bytes: Uint8Array, suggested: string): Promise<string | null> {
    const r = await shellCall("saveWorkbook", {
      b64: bytesToBase64(bytes),
      suggested,
    });
    if (!r.ok) {
      if (r.cancelled) return null;
      throw new Error(r.error ?? "The workbook could not be saved.");
    }
    return String((r.value as { name?: string })?.name ?? suggested);
  }
  openExternal(url: string) {
    void shellCall("openUrl", { url });
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
}

/* ══════════════════════════════════════════════════════════════════════════
   PICKING ONE
   ══════════════════════════════════════════════════════════════════════════ */

function detect(): Host {
  const flag = window.__TIMETABLE_HOST__;
  if (flag?.kind === "shell" && typeof window.ipc?.postMessage === "function") {
    return new ShellHost(flag.version ?? "0.0.0");
  }
  /* ⚠️ THE FLAG WITHOUT THE CHANNEL IS A BROWSER. A half-injected shell that
     took the shell path would hang on the first save with no way to recover;
     falling back to the download always produces the file. */
  return new BrowserHost();
}

export const host: Host = detect();
export const isShell = host.kind === "shell";
