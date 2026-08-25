//! ⭐ THE WEBVIEW2 PRE-FLIGHT.
//!
//! This is the difference between an app that works and a blank window, and the
//! machines it matters on are exactly the ones this project exists for: an
//! eight-year-old school desktop on an image nobody has touched since Windows 10
//! 1809, where the Edge WebView2 Runtime was never installed.
//!
//! ⚠️ CHECK BEFORE CREATING THE WEBVIEW. If you create it first and handle the
//! error, `tao` has already put a window on screen and the user sees a black
//! rectangle for however long the failure takes to surface. Detection is two
//! registry reads and a function call; do it while nothing is visible.
//!
//! Two probes, in order:
//!   1. `GetAvailableCoreWebView2BrowserVersionString` — the authoritative one.
//!      It is what WebView2 itself calls. Statically linked in via
//!      `webview2-com-sys`, so there is no loader DLL to ship or find.
//!   2. The `pv` value under EdgeUpdate's client GUID for the Evergreen Runtime,
//!      in all three places an install can land. A backstop for the case where
//!      the loader call fails for a reason other than absence.
//!
//! ⚠️ NEVER BUNDLE THE FIXED-VERSION RUNTIME instead. It is over 250 MB — eighty
//! times this whole app — and Microsoft states it cannot be run from a network
//! share, which is where a school will put it.
//!
//! When it is missing we do not nag and quit. The front-end is one self-contained
//! HTML document by design, so we write it to `%TEMP%`, hand it to the default
//! browser, and show ONE message box saying what happened. The school gets its
//! timetable today and installs the runtime whenever IT gets to it.

/// What we found, and how.
#[derive(Debug, Clone)]
pub struct Status {
    pub version: Option<String>,
    /// `"loader"`, `"registry"`, `"absent"`, or `"not-applicable"`.
    pub source: &'static str,
}

impl Status {
    pub fn present(&self) -> bool {
        self.version.is_some()
    }
}

// ─────────────────────────────────── Windows ───────────────────────────────────

#[cfg(windows)]
mod imp {
    use super::Status;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
    };

    /// EdgeUpdate's client GUID for the Evergreen WebView2 Runtime.
    const RUNTIME_GUID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

    pub fn detect() -> Status {
        if let Some(version) = from_loader() {
            return Status { version: Some(version), source: "loader" };
        }
        if let Some(version) = from_registry() {
            return Status { version: Some(version), source: "registry" };
        }
        Status { version: None, source: "absent" }
    }

    /// The authoritative probe. Returns `Err` when no runtime is installed, and
    /// can also return `Ok` with a null pointer — both mean absent.
    fn from_loader() -> Option<String> {
        unsafe {
            let mut raw = PWSTR::null();
            let result =
                webview2_com_sys::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString(
                    PCWSTR::null(),
                    &mut raw,
                );
            if result.is_err() || raw.is_null() {
                return None;
            }
            let version = raw.to_string().ok();
            CoTaskMemFree(Some(raw.as_ptr() as *const _));
            version.filter(|v| !v.trim().is_empty() && v.trim() != "0.0.0.0")
        }
    }

    /// The backstop. An install can be machine-wide (recorded under
    /// WOW6432Node on 64-bit Windows, because EdgeUpdate is a 32-bit product)
    /// or per-user, so all three are checked.
    fn from_registry() -> Option<String> {
        let paths: [(HKEY, String); 3] = [
            (
                HKEY_LOCAL_MACHINE,
                format!(r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{RUNTIME_GUID}"),
            ),
            (
                HKEY_LOCAL_MACHINE,
                format!(r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{RUNTIME_GUID}"),
            ),
            (
                HKEY_CURRENT_USER,
                format!(r"Software\Microsoft\EdgeUpdate\Clients\{RUNTIME_GUID}"),
            ),
        ];

        for (root, subkey) in paths {
            // "0.0.0.0" is EdgeUpdate's own sentinel for "the key exists but
            // nothing is installed" — treating it as a version is the classic
            // way this check passes on a machine that has no runtime.
            if let Some(pv) = reg_string(root, &subkey, "pv") {
                let pv = pv.trim().to_string();
                if !pv.is_empty() && pv != "0.0.0.0" {
                    return Some(pv);
                }
            }
        }
        None
    }

    fn reg_string(root: HKEY, subkey: &str, value: &str) -> Option<String> {
        let subkey = wide(subkey);
        let value = wide(value);
        unsafe {
            let mut size: u32 = 0;
            let probe = RegGetValueW(
                root,
                PCWSTR(subkey.as_ptr()),
                PCWSTR(value.as_ptr()),
                RRF_RT_REG_SZ,
                None,
                None,
                Some(&mut size),
            );
            if probe.is_err() || size == 0 {
                return None;
            }

            let mut buffer = vec![0u16; (size as usize).div_ceil(2) + 1];
            let mut size_out = size;
            let read = RegGetValueW(
                root,
                PCWSTR(subkey.as_ptr()),
                PCWSTR(value.as_ptr()),
                RRF_RT_REG_SZ,
                None,
                Some(buffer.as_mut_ptr() as *mut _),
                Some(&mut size_out),
            );
            if read.is_err() {
                return None;
            }
            let chars = (size_out as usize / 2).min(buffer.len());
            let text: String = String::from_utf16_lossy(&buffer[..chars]);
            Some(text.trim_end_matches('\0').to_string())
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Write the front-end to `%TEMP%`, open it in the default browser, and say
    /// one thing about it. Returns whether the browser actually launched.
    pub fn fall_back_to_browser(document: &str) -> bool {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::{
            MessageBoxW, MB_ICONINFORMATION, MB_OK, MB_SETFOREGROUND, MB_TOPMOST, SW_SHOWNORMAL,
        };

        let dir = std::env::temp_dir().join("Monospace Timetable");
        let path = dir.join("Monospace Timetable.html");
        let written = std::fs::create_dir_all(&dir)
            .and_then(|()| std::fs::write(&path, document.as_bytes()))
            .is_ok();

        let mut opened = false;
        if written {
            let file = wide(&path.to_string_lossy());
            let verb = wide("open");
            unsafe {
                let result = ShellExecuteW(
                    None,
                    PCWSTR(verb.as_ptr()),
                    PCWSTR(file.as_ptr()),
                    PCWSTR::null(),
                    PCWSTR::null(),
                    SW_SHOWNORMAL,
                );
                // ShellExecuteW returns a fake HINSTANCE; anything above 32 is
                // success. It is the one Win32 API that still works this way.
                opened = result.0 as usize > 32;
            }
        }

        let body = if opened {
            format!(
                "This computer does not have the Microsoft Edge WebView2 Runtime, which \
                 Monospace Timetable normally uses to draw its window.\n\n\
                 Nothing is lost: the whole app has just been opened in your web browser \
                 instead, and it works there. Your timetable file is saved and opened through \
                 the browser's own Open and Save.\n\n\
                 To get the app window back, ask whoever looks after your computers to install \
                 the Edge WebView2 Runtime (it is a free Microsoft download, and most PCs \
                 already have it).\n\n\
                 The copy in your browser is at:\n{}",
                path.display()
            )
        } else {
            format!(
                "This computer does not have the Microsoft Edge WebView2 Runtime, which \
                 Monospace Timetable needs to draw its window, and your web browser could not \
                 be opened automatically either.\n\n\
                 A copy of the app has been saved here — open this file in any web browser and \
                 it will work:\n{}\n\n\
                 To get the app window back, ask whoever looks after your computers to install \
                 the Edge WebView2 Runtime. It is a free Microsoft download.",
                path.display()
            )
        };

        let title = wide("Monospace Timetable");
        let body = wide(&body);
        unsafe {
            MessageBoxW(
                None,
                PCWSTR(body.as_ptr()),
                PCWSTR(title.as_ptr()),
                MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND | MB_TOPMOST,
            );
        }
        opened
    }
}

// ───────────────────────────────── everywhere else ─────────────────────────────
//
// macOS uses WKWebView and Linux WebKitGTK — both are part of the system, so
// there is nothing to pre-flight. These builds exist so the shell can be
// developed and run on the Mac this is written on; the shipping target is
// Windows.

#[cfg(not(windows))]
mod imp {
    use super::Status;

    pub fn detect() -> Status {
        Status { version: None, source: "not-applicable" }
    }

    pub fn fall_back_to_browser(_document: &str) -> bool {
        false
    }
}

pub fn detect() -> Status {
    imp::detect()
}

/// True when the webview can be created. Non-Windows platforms always can.
pub fn available() -> bool {
    if cfg!(windows) {
        detect().present()
    } else {
        true
    }
}

pub fn fall_back_to_browser(document: &str) -> bool {
    imp::fall_back_to_browser(document)
}
