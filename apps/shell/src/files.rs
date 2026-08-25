//! Native file dialogs and the reads and writes behind them.
//!
//! ⚠️ EVERY FUNCTION IN HERE MUST BE CALLED ON THE MAIN THREAD, from inside the
//! `tao` event loop — never from the wry IPC handler directly. A modal dialog
//! runs its own message pump, so blocking the event loop is what "modal" means
//! and the webview keeps painting behind it; but blocking *inside* the IPC
//! handler blocks the webview mid-call, and on Windows that is a deadlock
//! waiting to be reported as "the app freezes when I click Save".
//!
//! The route is therefore always: IPC handler parses → sends a `UserEvent` →
//! the event loop runs the dialog → the result goes back to JS as a message.
//!
//! Rust knows nothing about what is inside these files. The document is the
//! engine's `.timetable.json`; the workbook is bytes the webview produced with
//! the streaming writer. Neither is parsed, validated or rewritten here — one
//! writer, and it is not this one.

use std::path::{Path, PathBuf};

use raw_window_handle::{HasDisplayHandle, HasWindowHandle};
use rfd::FileDialog;

/// The extension the engine defines for a saved school document.
pub const DOCUMENT_EXTENSION: &str = "timetable.json";

/// Refuse to load anything absurd as a document. A real school's file is tens
/// of kilobytes; this only exists so picking a video by mistake fails in one
/// second with a sentence rather than by exhausting memory.
const MAX_DOCUMENT_BYTES: u64 = 64 * 1024 * 1024;

/// What came of asking the user for a file.
#[derive(Debug)]
pub enum Outcome<T> {
    Done(T),
    /// The user pressed Cancel. Not an error, and must not be reported as one.
    Cancelled,
    Failed(String),
}

#[derive(Debug)]
pub struct OpenedDocument {
    pub path: PathBuf,
    pub name: String,
    pub text: String,
}

pub fn open_document<W>(parent: &W) -> Outcome<OpenedDocument>
where
    W: HasWindowHandle + HasDisplayHandle,
{
    let Some(path) = FileDialog::new()
        .set_title("Open a timetable")
        .add_filter("Timetable file (*.timetable.json)", &["json"])
        .add_filter("All files", &["*"])
        .set_parent(parent)
        .pick_file()
    else {
        return Outcome::Cancelled;
    };

    match read_document(&path) {
        Ok(text) => Outcome::Done(OpenedDocument {
            name: file_name(&path),
            path,
            text,
        }),
        Err(e) => Outcome::Failed(e),
    }
}

fn read_document(path: &Path) -> Result<String, String> {
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "“{}” is {:.0} MB, which is far too big to be a timetable file. Nothing was opened.",
            file_name(path),
            size as f64 / 1_048_576.0
        ));
    }
    match std::fs::read(path) {
        Err(e) => Err(format!("“{}” could not be read: {e}", file_name(path))),
        Ok(bytes) => String::from_utf8(bytes).map_err(|_| {
            format!(
                "“{}” is not a timetable file — it is not text at all. A timetable file is JSON \
                 you could open in Notepad.",
                file_name(path)
            )
        }),
    }
}

/// Ask where to put a document, then write it.
pub fn save_document<W>(parent: &W, text: &str, suggested: &str) -> Outcome<PathBuf>
where
    W: HasWindowHandle + HasDisplayHandle,
{
    let Some(path) = FileDialog::new()
        .set_title("Save the timetable")
        .add_filter("Timetable file (*.timetable.json)", &["json"])
        .set_file_name(&ensure_suffix(suggested, DOCUMENT_EXTENSION))
        .set_parent(parent)
        .save_file()
    else {
        return Outcome::Cancelled;
    };

    // `.timetable.json` is two extensions, and every save dialog on Windows
    // understands only the last one — so a user who typed "Autumn" gets
    // "Autumn.json" back from the dialog and we have to finish the job here.
    let path = ensure_path_suffix(path, DOCUMENT_EXTENSION);

    match crate::portable::write_atomic(&path, text) {
        Ok(()) => Outcome::Done(path),
        Err(e) => Outcome::Failed(format!("“{}” could not be saved: {e}", file_name(&path))),
    }
}

/// Write a document to a path already chosen, with no dialog. This is what makes
/// Ctrl+S behave: the second save of a file goes straight to disk.
pub fn save_document_to(path: &Path, text: &str) -> Result<(), String> {
    crate::portable::write_atomic(path, text)
        .map_err(|e| format!("“{}” could not be saved: {e}", file_name(path)))
}

/// Ask where to put the workbook, then write the bytes the webview generated.
pub fn save_workbook<W>(parent: &W, bytes: &[u8], suggested: &str) -> Outcome<PathBuf>
where
    W: HasWindowHandle + HasDisplayHandle,
{
    let Some(path) = FileDialog::new()
        .set_title("Save the timetable workbook")
        .add_filter("Excel workbook (*.xlsx)", &["xlsx"])
        .set_file_name(&ensure_suffix(suggested, "xlsx"))
        .set_parent(parent)
        .save_file()
    else {
        return Outcome::Cancelled;
    };

    let path = ensure_path_suffix(path, "xlsx");

    // Not written atomically on purpose: the user chose this exact path in a
    // save dialog, and a stray "Timetable.writing" appearing next to it in
    // Explorer if the write fails is worse than a short partial file.
    match std::fs::write(&path, bytes) {
        Ok(()) => Outcome::Done(path),
        Err(e) => Outcome::Failed(format!(
            "“{}” could not be saved: {e}. If it is open in Excel, close it and try again.",
            file_name(&path)
        )),
    }
}

pub fn read_text(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

/// `("Autumn", "timetable.json")` → `"Autumn.timetable.json"`, and an input that
/// already ends that way is left alone.
fn ensure_suffix(name: &str, suffix: &str) -> String {
    let name = name.trim();
    let name = if name.is_empty() { "timetable" } else { name };
    if name.to_ascii_lowercase().ends_with(&format!(".{}", suffix.to_ascii_lowercase())) {
        name.to_string()
    } else {
        format!("{name}.{suffix}")
    }
}

fn ensure_path_suffix(path: PathBuf, suffix: &str) -> PathBuf {
    let name = file_name(&path);
    let fixed = ensure_suffix(&name, suffix);
    if fixed == name {
        path
    } else {
        path.with_file_name(fixed)
    }
}

// ───────────────────────────── showing things to the user ─────────────────────

/// Open the system file manager with `path` selected.
pub fn reveal(path: &Path) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // /select needs the argument glued to it with a comma and no space.
        let _ = std::process::Command::new("explorer.exe")
            .raw_arg(format!("/select,\"{}\"", path.display()))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg("-R").arg(path).spawn();
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let target = if path.is_dir() { path } else { path.parent().unwrap_or(path) };
        let _ = std::process::Command::new("xdg-open").arg(target).spawn();
    }
}

/// Open a link in the user's browser.
///
/// ⚠️ http and https only. The webview loads one embedded document, so there is
/// no untrusted page here today — but this is the one call in the shell that
/// hands a string to the operating system to interpret, and `file://` or a
/// registered application scheme is a very different thing to open than a link.
pub fn open_external(url: &str) {
    let lowered = url.to_ascii_lowercase();
    if !(lowered.starts_with("http://") || lowered.starts_with("https://")) {
        return;
    }

    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let verb = wide("open");
        let target = wide(url);
        unsafe {
            // ShellExecuteW rather than `cmd /C start`: no console window to
            // suppress, and no chance of the URL being read as a shell argument.
            ShellExecuteW(
                None,
                PCWSTR(verb.as_ptr()),
                PCWSTR(target.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            );
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_double_extension_survives_the_save_dialog() {
        // What a Windows save dialog hands back when the user typed "Autumn".
        assert_eq!(ensure_suffix("Autumn", DOCUMENT_EXTENSION), "Autumn.timetable.json");
        assert_eq!(ensure_suffix("Autumn.json", DOCUMENT_EXTENSION), "Autumn.json.timetable.json");
        // Already right — left alone, not doubled.
        assert_eq!(
            ensure_suffix("Autumn.timetable.json", DOCUMENT_EXTENSION),
            "Autumn.timetable.json"
        );
        assert_eq!(
            ensure_suffix("Autumn.TIMETABLE.JSON", DOCUMENT_EXTENSION),
            "Autumn.TIMETABLE.JSON"
        );
        assert_eq!(ensure_suffix("  ", DOCUMENT_EXTENSION), "timetable.timetable.json");
    }

    #[test]
    fn workbook_names_get_one_xlsx_and_only_one() {
        assert_eq!(ensure_suffix("IT_Room_Timetable_2627_1", "xlsx"), "IT_Room_Timetable_2627_1.xlsx");
        assert_eq!(ensure_suffix("IT_Room_Timetable_2627_1.xlsx", "xlsx"), "IT_Room_Timetable_2627_1.xlsx");
    }

    #[test]
    fn ensure_path_suffix_keeps_the_directory() {
        let p = ensure_path_suffix(PathBuf::from("/tmp/some dir/Autumn"), DOCUMENT_EXTENSION);
        assert_eq!(p, PathBuf::from("/tmp/some dir/Autumn.timetable.json"));
    }
}
