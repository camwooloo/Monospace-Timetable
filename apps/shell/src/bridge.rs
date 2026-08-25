//! ⭐ THE CONTRACT BETWEEN THE WEBVIEW AND RUST. Change it here or not at all.
//!
//! Rust owns the window, the updater, file open/save and this bridge. It does
//! not own the workbook: the engine runs inside the webview, unchanged, and the
//! `.xlsx` bytes arrive here already made. There is one writer and it is in
//! TypeScript. Nothing in this crate opens a zip.
//!
//! ## Which way each thing goes
//!
//! **Front-end → Rust** — `window.MonospaceShell.send({ type, … })`
//!
//! | `type` | payload | what happens |
//! |---|---|---|
//! | `ready` | — | replies with `boot`. Safe to send more than once. |
//! | `drag` | — | starts a window drag. Send on `mousedown` in the title bar. |
//! | `minimize` / `toggleMaximize` / `close` | — | window buttons |
//! | `openDocument` | — | native Open dialog → `documentOpened` \| `documentOpenCancelled` \| `documentOpenFailed` |
//! | `saveDocument` | `text`, `suggestedName`, `path?` | with `path`, writes straight there (this is Ctrl+S on an already-saved file); without, opens Save As |
//! | `writeWorkingCopy` | `text` | writes the in-progress timetable to the data folder, no dialog |
//! | `readWorkingCopy` | — | replies with `workingCopy` — `text` is `null` when there isn't one |
//! | `saveWorkbook` | `base64`, `suggestedName` | native Save dialog → writes the `.xlsx` |
//! | `checkUpdate` | — | replies `updateAvailable` \| `updateUpToDate` \| `updateCheckFailed` |
//! | `applyUpdate` | — | downloads, swaps, relaunches. On failure replies `updateFailed` |
//! | `reveal` | `path` | shows the file in Explorer / Finder |
//! | `revealDataDir` | — | the same for the data folder |
//! | `openExternal` | `url` | http/https only |
//!
//! **Rust → front-end** — every message arrives at the one handler registered
//! with `window.MonospaceShell.onMessage(fn)`, as `{ type, … }`.
//!
//! `boot`, `documentOpened`, `documentOpenCancelled`, `documentOpenFailed`,
//! `documentSaved`, `documentSaveCancelled`, `documentSaveFailed`,
//! `workingCopy`, `workingCopyWritten`, `workingCopyFailed`, `workbookSaved`,
//! `workbookSaveCancelled`, `workbookSaveFailed`, `updateAvailable`,
//! `updateUpToDate`, `updateCheckFailed`, `updateFailed`.
//!
//! ⚠️ **Cancel is not failure.** Every dialog has its own `…Cancelled` reply and
//! the front-end must treat it as nothing happening. Folding it into the failure
//! branch produces an app that says something went wrong every time somebody
//! changes their mind, which teaches people to ignore the one that matters.
//!
//! ## Why there is a queue
//!
//! `boot` is sent the moment the page asks for it, which can be before the app's
//! own code has finished mounting and called `onMessage`. So `receive` buffers
//! until a handler is registered and then drains in order. Without that, the very
//! first message — the one carrying where files are saved and whether updates
//! can be installed — is the one most likely to be dropped.
//!
//! ## Detecting the shell
//!
//! `window.MonospaceShell` exists only inside the app. In the standalone HTML,
//! and in the browser fallback when WebView2 is missing, it is `undefined` and
//! the front-end uses `<input type="file">` and a download instead. Check for
//! the object, never for a user-agent string.

/// The custom scheme the document is served under.
///
/// ⚠️ NOT `with_html`. `NavigateToString` gives the page an opaque origin, and
/// an opaque origin has no `localStorage` — every per-device preference would
/// throw on read. It also caps at 2 MB, which a 600 KB document clears today and
/// might not later. A custom protocol gives a real, stable origin instead.
///
/// wry rewrites this per platform. On Windows it becomes
/// `https://monospace.localhost/index.html` (WebView2 cannot register a
/// non-standard scheme, so wry intercepts an https URL that starts with the
/// scheme name plus a dot); on macOS the `monospace://` URL is used as written.
/// The front-end must never hard-code either.
pub const SCHEME: &str = "monospace";
pub const APP_URL: &str = "monospace://localhost/index.html";

/// Ceiling on a single `saveWorkbook` payload, before base64 decoding.
///
/// A whole school year across 41 sheets is comfortably under a megabyte. This is
/// only here so a runaway front-end cannot ask the shell to hold a gigabyte of
/// string in memory on a machine with 4 GB in it.
pub const MAX_WORKBOOK_BASE64: usize = 128 * 1024 * 1024;

/// Events the front-end and the background threads send to the event loop.
///
/// Dialogs are in here rather than being run in the IPC handler on purpose —
/// see the warning at the top of `files.rs`.
pub enum UserEvent {
    /// Run this JavaScript in the webview.
    Eval(String),
    Minimize,
    ToggleMaximize,
    Close,
    Drag,
    OpenExternal(String),
    Reveal(std::path::PathBuf),
    PickAndOpenDocument,
    PickAndSaveDocument { text: String, suggested: String },
    PickAndSaveWorkbook { bytes: Vec<u8>, suggested: String },
}

/// Injected before any page script runs, so the front-end can rely on
/// `window.MonospaceShell` existing from its first line.
pub const INIT_SCRIPT: &str = r#"
(function () {
  if (window.MonospaceShell) return;
  var queue = [];
  var handler = null;
  window.MonospaceShell = {
    present: true,
    send: function (message) {
      window.ipc.postMessage(JSON.stringify(message));
    },
    onMessage: function (fn) {
      handler = fn;
      while (queue.length) fn(queue.shift());
    },
    // Called by Rust. Buffers until the front-end registers a handler.
    receive: function (message) {
      if (handler) handler(message); else queue.push(message);
    }
  };
})();
"#;

/// The JavaScript that delivers one message to the front-end.
///
/// Guarded on both halves: an `evaluate_script` that throws is silent, and a
/// message arriving during teardown — after the page has navigated or while it
/// is being torn down — would otherwise raise a `TypeError` nobody ever sees.
pub fn deliver(message: &serde_json::Value) -> String {
    format!(
        "window.MonospaceShell&&window.MonospaceShell.receive&&window.MonospaceShell.receive({});",
        message
    )
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn delivery_is_guarded_and_carries_the_payload() {
        let js = super::deliver(&json!({ "type": "boot", "version": "0.1.0" }));
        assert!(js.starts_with("window.MonospaceShell&&"));
        assert!(js.contains("\"type\":\"boot\""));
    }

    #[test]
    fn a_message_with_a_quote_in_it_stays_one_expression() {
        // serde_json escapes; if this ever regresses the injected script breaks
        // in a way that only shows up on a school name with an apostrophe.
        let js = super::deliver(&json!({ "type": "documentSaveFailed", "message": "St \"Mary\"'s" }));
        assert_eq!(js.matches("MonospaceShell.receive(").count(), 1);
        assert!(js.contains(r#"St \"Mary\"'s"#));
    }
}
