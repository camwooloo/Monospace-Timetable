//! Monospace Timetable — the portable desktop shell.
//!
//! One `.exe`, no installer, no runtime to deploy, nothing written to the
//! registry. A school copies it onto a machine or a shared drive and it runs.
//!
//! ## What lives on which side of the fence
//!
//! Rust owns the window, the updater, file open/save and the IPC bridge.
//! **The webview owns the workbook.** The engine is the TypeScript from
//! Monospace itself, running unchanged inside the webview, and the `.xlsx` bytes
//! come back over the bridge already made — because the palette in
//! `timetableSheet.ts` is hundreds of measured OKLab constants whose own rule is
//! "measure, never reason from the constants", and re-deriving them in a second
//! writer is how the printed sheet quietly stops matching the screen.
//!
//! So: no zip writing in here, no cell formatting, no colour maths. If a change
//! to this crate needs any of those, it is in the wrong crate.
//!
//! ## The order of the first half-second, and why it is that order
//!
//! 1. Clean up a `.old` binary a previous update left behind.
//! 2. **Pre-flight WebView2** — before any window exists. See `webview2.rs`.
//! 3. Work out where files can be written. See `portable.rs`.
//! 4. Build the window and the webview; serve the document over a custom
//!    protocol so it gets a real origin.
//! 5. Check for an update in the background.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod files;
mod html;
mod portable;
mod update;
mod webview2;

use std::borrow::Cow;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop, EventLoopBuilder, EventLoopProxy},
    window::WindowBuilder,
};
use wry::WebViewBuilder;

use bridge::UserEvent;

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn main() -> wry::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let has = |flag: &str| args.iter().any(|a| a == flag);

    // ⚠️ EVERY BRANCH BELOW PRINTS, AND A RELEASE BUILD HAS NOWHERE TO PRINT.
    // `windows_subsystem = "windows"` is what stops a console flashing on a
    // double-click, and the price is that the process starts with no console
    // at all: run `MonospaceTimetable.exe --diagnostics` from a Command
    // Prompt and every `println!` goes into the void, silently. That is the
    // one command the help text tells a technician to run on a support call,
    // so borrow the console we were launched from before anything is written.
    if !args.is_empty() {
        attach_parent_console();
    }

    if has("--help") || has("-h") {
        print_help();
        return Ok(());
    }
    if has("--version") || has("-V") {
        println!("Monospace Timetable {VERSION}");
        return Ok(());
    }
    if has("--diagnostics") {
        println!("{:#}", diagnostics());
        return Ok(());
    }
    if has("--html") {
        return Ok(write_standalone_document(&args));
    }

    // A leftover `.old` from the last update. Cheap, and doing it before the
    // window means a failed cleanup never delays what the user can see.
    update::cleanup();

    // ⭐ PRE-FLIGHT. Nothing has been drawn yet, which is the point: a machine
    // with no WebView2 gets the browser and one message box, not a black window.
    if !webview2::available() {
        webview2::fall_back_to_browser(&html::browser_fallback_document("webview2-missing"));
        return Ok(());
    }

    run()
}

/// Attach to the console that launched us, if there was one.
///
/// Only ever called on the command-line paths. Failing is the normal case and
/// means the app was started from Explorer: there is no console to attach to,
/// nobody is reading stdout, and the window opens as it should. Note that
/// `cmd.exe` does not wait for a GUI-subsystem process, so the output lands
/// after the prompt returns — `start /wait` if that matters.
#[cfg(windows)]
fn attach_parent_console() {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    unsafe {
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

/// macOS and Linux builds are console-subsystem by definition; stdout already
/// goes where it was pointed.
#[cfg(not(windows))]
fn attach_parent_console() {}

fn print_help() {
    println!(
        "Monospace Timetable {VERSION}
A portable timetable builder. Free, and yours.

  (no arguments)   open the app
  --diagnostics    print what this copy can see: WebView2, where files go,
                   whether it can update itself. Useful on a support call.
  --html [PATH]    write the app out as a single self-contained web page and
                   print where it went. Opens in any browser.
  --version
  --help"
    );
}

/// `--html [PATH]`: drop the embedded document somewhere openable.
///
/// The same page the app runs, minus the shell — which is exactly what a school
/// with a locked-down PC ends up using, so it is worth being able to produce on
/// demand rather than only as an accident of a missing runtime.
fn write_standalone_document(args: &[String]) {
    let explicit = args
        .iter()
        .position(|a| a == "--html")
        .and_then(|i| args.get(i + 1))
        .filter(|a| !a.starts_with('-'))
        .map(PathBuf::from);

    let path = explicit.unwrap_or_else(|| {
        std::env::temp_dir()
            .join("Monospace Timetable")
            .join("Monospace Timetable.html")
    });

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::write(&path, html::browser_fallback_document("requested").as_bytes()) {
        Ok(()) => println!("{}", path.display()),
        Err(e) => eprintln!("could not write {}: {e}", path.display()),
    }
}

fn diagnostics() -> Value {
    let status = webview2::detect();
    let data = portable::resolve();
    let writability = update::writability();
    json!({
        "app": "Monospace Timetable",
        "version": VERSION,
        "frontEnd": { "source": html::SOURCE, "stagedFrom": html::ORIGIN, "bytes": html::DOCUMENT.len() },
        "platform": std::env::consts::OS,
        "webview2": { "version": status.version, "detectedBy": status.source },
        "installDir": update::install_dir().map(|p| p.display().to_string()),
        "dataDir": data.path.display().to_string(),
        "dataDirKind": data.kind.as_str(),
        "dataDirNote": data.note,
        "canSelfUpdate": writability.is_yes(),
        "canSelfUpdateReason": writability.reason(),
    })
}

// ───────────────────────────────── the app ─────────────────────────────────

/// Everything the IPC handler needs. Cheap to clone into the handler closure.
struct Shell {
    proxy: EventLoopProxy<UserEvent>,
    data: portable::Location,
    /// The download URL of a pending update, held between the check and the OK.
    pending_update: Arc<Mutex<Option<String>>>,
}

impl Shell {
    fn reply(&self, message: Value) {
        let _ = self.proxy.send_event(UserEvent::Eval(bridge::deliver(&message)));
    }
}

fn run() -> wry::Result<()> {
    let event_loop: EventLoop<UserEvent> = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let window = WindowBuilder::new()
        .with_title("Monospace Timetable")
        // Frameless, with the title bar drawn by the front-end — the shape of
        // Cam's other apps. `drag`, `minimize`, `toggleMaximize` and `close`
        // exist in the bridge because of this, and the window is resizable
        // because a timetable grid needs the room.
        .with_decorations(false)
        .with_resizable(true)
        .with_inner_size(LogicalSize::new(1280.0, 840.0))
        .with_min_inner_size(LogicalSize::new(920.0, 620.0))
        .build(&event_loop)
        .expect("create window");

    // A native drop shadow, so a frameless window still reads as a window
    // against a light desktop instead of a floating rectangle.
    #[cfg(windows)]
    {
        use tao::platform::windows::WindowExtWindows;
        window.set_undecorated_shadow(true);
    }

    let data = portable::resolve();
    let pending_update: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let shell = Shell {
        proxy: proxy.clone(),
        data: data.clone(),
        pending_update: pending_update.clone(),
    };

    let builder = WebViewBuilder::new()
        .with_url(bridge::APP_URL)
        .with_custom_protocol(bridge::SCHEME.to_string(), serve_document)
        .with_initialization_script(bridge::INIT_SCRIPT)
        .with_ipc_handler(move |request: wry::http::Request<String>| {
            handle_message(request.body(), &shell);
        })
        // Matches the front-end's own dark ground, so a slow first paint is a
        // dark window rather than a white flash.
        .with_background_color((15, 16, 18, 255))
        .with_devtools(cfg!(debug_assertions));

    // WebView2 cannot register a non-standard scheme, so wry serves the custom
    // protocol over https instead. https and not http because that is a secure
    // context, and a secure context is what `crypto.subtle` and friends require.
    #[cfg(windows)]
    let builder = {
        use wry::WebViewBuilderExtWindows;
        builder.with_https_scheme(true)
    };

    let webview = builder.build(&window)?;

    // Background: is there a newer release? Reported only if there is — an
    // "already up to date" nobody asked for is noise. The explicit `checkUpdate`
    // message answers all three outcomes.
    spawn_startup_update_check(proxy.clone(), pending_update.clone());

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(ev) => match ev {
                UserEvent::Eval(js) => {
                    let _ = webview.evaluate_script(&js);
                }
                UserEvent::Minimize => window.set_minimized(true),
                UserEvent::ToggleMaximize => window.set_maximized(!window.is_maximized()),
                UserEvent::Close => *control_flow = ControlFlow::Exit,
                UserEvent::Drag => {
                    let _ = window.drag_window();
                }
                UserEvent::OpenExternal(url) => files::open_external(&url),
                UserEvent::Reveal(path) => files::reveal(&path),

                // ⚠️ The dialogs run HERE, on the main thread, inside the event
                // loop — not in the IPC handler. See the banner in files.rs.
                UserEvent::PickAndOpenDocument => {
                    let message = match files::open_document(&window) {
                        files::Outcome::Done(doc) => json!({
                            "type": "documentOpened",
                            "path": doc.path.display().to_string(),
                            "name": doc.name,
                            "text": doc.text,
                        }),
                        files::Outcome::Cancelled => json!({ "type": "documentOpenCancelled" }),
                        files::Outcome::Failed(message) => {
                            json!({ "type": "documentOpenFailed", "message": message })
                        }
                    };
                    let _ = webview.evaluate_script(&bridge::deliver(&message));
                }
                UserEvent::PickAndSaveDocument { text, suggested } => {
                    let message = match files::save_document(&window, &text, &suggested) {
                        files::Outcome::Done(path) => saved_message("documentSaved", &path),
                        files::Outcome::Cancelled => json!({ "type": "documentSaveCancelled" }),
                        files::Outcome::Failed(message) => {
                            json!({ "type": "documentSaveFailed", "message": message })
                        }
                    };
                    let _ = webview.evaluate_script(&bridge::deliver(&message));
                }
                UserEvent::PickAndSaveWorkbook { bytes, suggested } => {
                    let message = match files::save_workbook(&window, &bytes, &suggested) {
                        files::Outcome::Done(path) => saved_message("workbookSaved", &path),
                        files::Outcome::Cancelled => json!({ "type": "workbookSaveCancelled" }),
                        files::Outcome::Failed(message) => {
                            json!({ "type": "workbookSaveFailed", "message": message })
                        }
                    };
                    let _ = webview.evaluate_script(&bridge::deliver(&message));
                }
            },
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                *control_flow = ControlFlow::Exit
            }
            _ => {}
        }
    });
}

fn saved_message(kind: &str, path: &std::path::Path) -> Value {
    json!({
        "type": kind,
        "path": path.display().to_string(),
        "name": path.file_name().map(|n| n.to_string_lossy().into_owned()),
    })
}

/// Serve the one embedded document. Every path returns it — the front-end is a
/// single file with everything inlined, so there is nothing else to fetch, and
/// a deep link typed by hand should land on the app rather than a 404.
fn serve_document(
    _id: wry::WebViewId,
    _request: wry::http::Request<Vec<u8>>,
) -> wry::http::Response<Cow<'static, [u8]>> {
    wry::http::Response::builder()
        .header(wry::http::header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(wry::http::header::CACHE_CONTROL, "no-store")
        .body(Cow::Borrowed(html::DOCUMENT.as_bytes()))
        .expect("static response")
}

// ──────────────────────────────── the bridge ────────────────────────────────

fn handle_message(body: &str, shell: &Shell) {
    let message: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let text_field = |key: &str| message[key].as_str().unwrap_or("").to_string();

    match message["type"].as_str().unwrap_or("") {
        "ready" => shell.reply(boot_payload(shell)),

        "drag" => send(shell, UserEvent::Drag),
        "minimize" => send(shell, UserEvent::Minimize),
        "toggleMaximize" => send(shell, UserEvent::ToggleMaximize),
        "close" => send(shell, UserEvent::Close),

        "openDocument" => send(shell, UserEvent::PickAndOpenDocument),

        "saveDocument" => {
            let text = text_field("text");
            match message["path"].as_str().filter(|p| !p.is_empty()) {
                // Already has a home: Ctrl+S goes straight to disk. Re-prompting
                // on every save is the difference between a tool and a chore.
                Some(path) => {
                    let path = PathBuf::from(path);
                    shell.reply(match files::save_document_to(&path, &text) {
                        Ok(()) => saved_message("documentSaved", &path),
                        Err(message) => json!({ "type": "documentSaveFailed", "message": message }),
                    });
                }
                None => send(
                    shell,
                    UserEvent::PickAndSaveDocument {
                        text,
                        suggested: message["suggestedName"]
                            .as_str()
                            .unwrap_or("timetable")
                            .to_string(),
                    },
                ),
            }
        }

        "writeWorkingCopy" => {
            let path = shell.data.working_copy();
            shell.reply(match portable::write_atomic(&path, &text_field("text")) {
                Ok(()) => json!({ "type": "workingCopyWritten", "path": path.display().to_string() }),
                Err(e) => json!({
                    "type": "workingCopyFailed",
                    "message": format!(
                        "Your work could not be saved to {}: {e}. Use Save As to put it somewhere \
                         you can write to.",
                        path.display()
                    ),
                }),
            });
        }

        "readWorkingCopy" => {
            let path = shell.data.working_copy();
            shell.reply(json!({
                "type": "workingCopy",
                "path": path.display().to_string(),
                "text": files::read_text(&path),
            }));
        }

        "saveWorkbook" => {
            let encoded = text_field("base64");
            if encoded.len() > bridge::MAX_WORKBOOK_BASE64 {
                shell.reply(json!({
                    "type": "workbookSaveFailed",
                    "message": "That workbook is too large to hand over to be saved.",
                }));
                return;
            }
            use base64::Engine as _;
            match base64::engine::general_purpose::STANDARD.decode(encoded.as_bytes()) {
                Ok(bytes) => send(
                    shell,
                    UserEvent::PickAndSaveWorkbook {
                        bytes,
                        suggested: message["suggestedName"]
                            .as_str()
                            .unwrap_or("Timetable")
                            .to_string(),
                    },
                ),
                Err(_) => shell.reply(json!({
                    "type": "workbookSaveFailed",
                    "message": "The workbook did not arrive intact. Try exporting it again.",
                })),
            }
        }

        "checkUpdate" => {
            let proxy = shell.proxy.clone();
            let pending = shell.pending_update.clone();
            std::thread::spawn(move || {
                let message = match update::check() {
                    Ok(Some(available)) => {
                        *pending.lock().unwrap() = Some(available.download_url.clone());
                        update_available_payload(&available)
                    }
                    // Checked and current — said out loud, because the user asked.
                    Ok(None) => json!({ "type": "updateUpToDate", "version": VERSION }),
                    // ⚠️ Not the same as "up to date", and never reported as it.
                    Err(e) => json!({
                        "type": "updateCheckFailed",
                        "message": format!(
                            "Could not check for updates ({e}). This usually means the school \
                             network blocked it rather than anything being wrong with the app."
                        ),
                    }),
                };
                let _ = proxy.send_event(UserEvent::Eval(bridge::deliver(&message)));
            });
        }

        "applyUpdate" => {
            /* ⚠️ `take()`, NOT `clone()`, AND THAT IS THE WHOLE GUARD.
               This downloads a few megabytes and then renames the RUNNING exe.
               A teacher on a school connection clicks Apply, sees nothing for
               twenty seconds and clicks again — with a clone, that is two
               threads downloading and two calls to `swap_in_place`, and the
               second rename removes the `.old` the first just made, so
               whichever thread fails has nothing to roll back to.

               Taking the URL out makes the second click a no-op. It is put
               back on failure, below, so a genuine retry still works. */
            let Some(url) = shell.pending_update.lock().unwrap().take() else {
                return;
            };
            let proxy = shell.proxy.clone();
            let pending = shell.pending_update.clone();
            std::thread::spawn(move || match update::apply(&url) {
                Ok(()) => {
                    update::restart();
                    let _ = proxy.send_event(UserEvent::Close);
                }
                Err(e) => {
                    /* The update did not happen, so the offer stands. */
                    *pending.lock().unwrap() = Some(url);
                    let message = json!({
                        "type": "updateFailed",
                        "kind": e.kind(),
                        "message": e.message(),
                        "pageUrl": update::releases_page(),
                    });
                    let _ = proxy.send_event(UserEvent::Eval(bridge::deliver(&message)));
                }
            });
        }

        "reveal" => {
            if let Some(path) = message["path"].as_str().filter(|p| !p.is_empty()) {
                send(shell, UserEvent::Reveal(PathBuf::from(path)));
            }
        }
        "revealDataDir" => {
            let _ = std::fs::create_dir_all(&shell.data.path);
            send(shell, UserEvent::Reveal(shell.data.path.clone()));
        }
        "openExternal" => {
            if let Some(url) = message["url"].as_str() {
                send(shell, UserEvent::OpenExternal(url.to_string()));
            }
        }

        // An unknown message is a front-end newer than this shell — which
        // happens the moment somebody runs an old exe against a new page. Ignore
        // it rather than crashing the loop.
        _ => {}
    }
}

fn send(shell: &Shell, event: UserEvent) {
    let _ = shell.proxy.send_event(event);
}

/// Everything the front-end needs to know about the machine it is running on,
/// in one message, so it never has to ask twice or guess.
fn boot_payload(shell: &Shell) -> Value {
    let status = webview2::detect();
    let writability = update::writability();
    json!({
        "type": "boot",
        "version": VERSION,
        "platform": std::env::consts::OS,
        "frontEndSource": html::SOURCE,
        "webview2": status.version,
        "webview2DetectedBy": status.source,
        "installDir": update::install_dir().map(|p| p.display().to_string()),
        "dataDir": shell.data.path.display().to_string(),
        // "beside-exe" | "user-profile" | "temp"
        "dataDirKind": shell.data.kind.as_str(),
        // Present whenever files are NOT going beside the exe. Show it.
        "dataDirNote": shell.data.note,
        "workingCopyPath": shell.data.working_copy().display().to_string(),
        "documentExtension": files::DOCUMENT_EXTENSION,
        "canSelfUpdate": writability.is_yes(),
        "canSelfUpdateReason": writability.reason(),
        "releasesPage": update::releases_page(),
    })
}

fn update_available_payload(available: &update::Available) -> Value {
    // ⭐ Decided BEFORE the user is offered a button, not after they press it.
    // On a read-only share the swap cannot work, so the UI is told to offer the
    // download link instead of an Apply that is going to fail.
    let writability = update::writability();
    json!({
        "type": "updateAvailable",
        "version": available.version,
        "notes": available.notes,
        "pageUrl": available.page_url,
        "canApply": writability.is_yes(),
        "reason": writability.reason(),
    })
}

fn spawn_startup_update_check(
    proxy: EventLoopProxy<UserEvent>,
    pending: Arc<Mutex<Option<String>>>,
) {
    std::thread::spawn(move || {
        if let Ok(Some(available)) = update::check() {
            *pending.lock().unwrap() = Some(available.download_url.clone());
            let _ = proxy.send_event(UserEvent::Eval(bridge::deliver(&update_available_payload(
                &available,
            ))));
        }
    });
}
