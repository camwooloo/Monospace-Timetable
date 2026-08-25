//! Self-update from GitHub Releases, for an app that ships as one portable exe.
//!
//! The shape is Discord-Quests': ask the releases API for the latest tag, compare
//! dotted versions, download the `.exe` asset, rename the *running* exe to
//! `.old` (Windows permits that, and only that), write the new bytes to the
//! original path, relaunch, and delete the `.old` on the next start.
//!
//! ⭐ THREE THINGS THAT VERSION DOES NOT COVER, ALL OF THEM SCHOOL-SHAPED:
//!
//! 1. **A read-only location.** The app is run from a network share, or from
//!    `Program Files`, or off a locked desktop image, and the rename cannot
//!    succeed. We test for it with [`writability`] BEFORE offering the update at
//!    all, so the UI shows "download it yourself" with a link instead of an
//!    Apply button that is going to fail — and if it fails anyway (the share
//!    went read-only between the check and the click), [`ApplyError`] says so in
//!    words a teacher can act on. It is never a silent no-op.
//! 2. **A filtering proxy.** School networks intercept TLS with a private CA and
//!    serve a block page with HTTP 200. Hence `try_proxy_from_env`, the
//!    `native-certs` feature in Cargo.toml, and [`looks_like_an_exe`] — a size
//!    check alone happily accepts a 900 KB "Access Denied" page as a binary.
//! 3. **A failed check is not "no update".** `check()` distinguishes them, so
//!    the UI can say "couldn't reach GitHub" rather than implying the app is
//!    current when nobody actually asked.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::Value;

const REPO: &str = "camwooloo/Monospace-Timetable";
const CURRENT: &str = env!("CARGO_PKG_VERSION");
const UA: &str = "MonospaceTimetable-Updater";

/// Anything smaller than this is not one of our builds — the release exe is
/// around 3 MB. Keeps error pages and truncated downloads out.
const MIN_PLAUSIBLE_BYTES: usize = 1_000_000;
/// And anything larger has gone wrong in the other direction.
const MAX_PLAUSIBLE_BYTES: usize = 200_000_000;

/// A release newer than this build.
#[derive(Debug, Clone)]
pub struct Available {
    pub version: String,
    pub download_url: String,
    pub notes: String,
    /// Where to send someone who has to install it by hand.
    pub page_url: String,
}

pub fn releases_page() -> String {
    format!("https://github.com/{REPO}/releases/latest")
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        // Honours HTTPS_PROXY / HTTP_PROXY / NO_PROXY. Without it the update
        // check is a hang-then-timeout on any network that requires a proxy.
        .try_proxy_from_env(true)
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(60))
        .build()
}

/// `Ok(None)` means "checked, nothing newer". `Err` means "could not check" —
/// a distinction the UI must keep, because they are not the same reassurance.
pub fn check() -> Result<Option<Available>, String> {
    let response = agent()
        .get(&format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .set("User-Agent", UA)
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("could not reach GitHub: {e}"))?;

    let body: Value = response
        .into_json()
        .map_err(|e| format!("GitHub sent something unreadable: {e}"))?;

    let Some(tag) = body["tag_name"].as_str() else {
        return Err("the latest release has no tag".into());
    };
    let version = tag.trim_start_matches('v').to_string();
    if !is_newer(&version, CURRENT) {
        return Ok(None);
    }

    let Some(download_url) = body["assets"].as_array().and_then(|assets| {
        assets.iter().find_map(|a| {
            let name = a["name"].as_str()?;
            name.to_ascii_lowercase()
                .ends_with(".exe")
                .then(|| a["browser_download_url"].as_str().map(str::to_string))
                .flatten()
        })
    }) else {
        return Err(format!("release {version} has no .exe attached to it"));
    };

    Ok(Some(Available {
        version,
        download_url,
        notes: body["body"].as_str().unwrap_or("").to_string(),
        page_url: releases_page(),
    }))
}

/// Compare dotted version strings (`"0.3.10" > "0.3.9"`).
fn is_newer(remote: &str, current: &str) -> bool {
    let parse = |s: &str| {
        s.split('.')
            .filter_map(|p| p.trim().parse::<u32>().ok())
            .collect::<Vec<_>>()
    };
    let (a, b) = (parse(remote), parse(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

// ─────────────────────────── can we update in place? ───────────────────────────

#[derive(Debug, Clone)]
pub enum Writability {
    Yes,
    /// With the sentence to put on screen.
    No(String),
}

impl Writability {
    pub fn is_yes(&self) -> bool {
        matches!(self, Writability::Yes)
    }
    pub fn reason(&self) -> Option<&str> {
        match self {
            Writability::Yes => None,
            Writability::No(why) => Some(why),
        }
    }
}

/// Can we replace the running exe where it sits?
///
/// Probes the *directory holding the exe*, because that is what the rename and
/// the write both need. Called at startup (it costs one file create) and again
/// if an apply fails, to tell "this was always read-only" from "something went
/// wrong just now".
pub fn writability() -> Writability {
    let Ok(exe) = std::env::current_exe() else {
        return Writability::No("The app could not work out where it is running from.".into());
    };
    let Some(dir) = exe.parent() else {
        return Writability::No("The app is running from a location with no folder.".into());
    };

    let probe = dir.join(".monospace-update-probe");
    match std::fs::write(&probe, b"probe") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            Writability::Yes
        }
        Err(_) => Writability::No(format!(
            "This copy of the app is in a folder it cannot change ({}). That is normal for a \
             network drive or a managed computer. Updates have to be installed by replacing the \
             file — download the new one and put it there, or copy the app somewhere of your own \
             first.",
            dir.display()
        )),
    }
}

// ────────────────────────────────── applying ──────────────────────────────────

#[derive(Debug)]
pub enum ApplyError {
    Download(String),
    /// Downloaded, but it is not a Windows executable. Almost always a proxy's
    /// block page or a login redirect served with a 200.
    NotAnExecutable,
    UnlikelySize(usize),
    /// The rename failed and the folder is genuinely not writable.
    ReadOnlyLocation(String),
    /// The rename or write failed for some other reason — antivirus holding the
    /// file open is the usual one.
    Swap(String),
}

impl ApplyError {
    /// What the user is shown. No error codes, no "failed to", one next step.
    pub fn message(&self) -> String {
        match self {
            ApplyError::Download(e) => format!(
                "The update could not be downloaded ({e}). If this computer is on a school \
                 network, the download may have been blocked. You can get the file from {}.",
                releases_page()
            ),
            ApplyError::NotAnExecutable => format!(
                "What came back was not the app — usually a sign that a web filter answered \
                 instead of GitHub. Nothing has been changed. You can download the update \
                 yourself from {}.",
                releases_page()
            ),
            ApplyError::UnlikelySize(n) => format!(
                "The download was {n} bytes, which is not a complete copy of the app. Nothing \
                 has been changed. Try again, or download it from {}.",
                releases_page()
            ),
            ApplyError::ReadOnlyLocation(dir) => format!(
                "The app cannot replace itself because the folder it is in ({dir}) is read-only \
                 — that is normal for a shared network drive. Nothing has been changed. Download \
                 the new version from {} and ask whoever manages the drive to put it in place, \
                 or copy the app to your own computer and update there.",
                releases_page()
            ),
            ApplyError::Swap(e) => format!(
                "The app could not be replaced ({e}). Antivirus software sometimes holds the file \
                 open — close the app and try again, or download the new version from {}.",
                releases_page()
            ),
        }
    }

    /// A short tag the front-end can branch on without parsing prose.
    pub fn kind(&self) -> &'static str {
        match self {
            ApplyError::Download(_) => "download",
            ApplyError::NotAnExecutable => "not-an-executable",
            ApplyError::UnlikelySize(_) => "unlikely-size",
            ApplyError::ReadOnlyLocation(_) => "read-only-location",
            ApplyError::Swap(_) => "swap",
        }
    }
}

/// `MZ` — the DOS header every PE starts with. A block page never has it.
fn looks_like_an_exe(bytes: &[u8]) -> bool {
    bytes.starts_with(b"MZ")
}

/// Download the new exe and swap it into place. The caller relaunches.
///
/// Nothing is touched on disk until the bytes are in hand and have been checked,
/// so every failure above leaves the working copy of the app exactly as it was.
pub fn apply(download_url: &str) -> Result<(), ApplyError> {
    let exe = std::env::current_exe()
        .map_err(|e| ApplyError::Swap(format!("cannot locate the running app: {e}")))?;

    let response = agent()
        .get(download_url)
        .set("User-Agent", UA)
        .call()
        .map_err(|e| ApplyError::Download(e.to_string()))?;

    let mut bytes = Vec::new();
    std::io::copy(&mut response.into_reader().take(MAX_PLAUSIBLE_BYTES as u64 + 1), &mut bytes)
        .map_err(|e| ApplyError::Download(e.to_string()))?;

    if bytes.len() < MIN_PLAUSIBLE_BYTES || bytes.len() > MAX_PLAUSIBLE_BYTES {
        return Err(ApplyError::UnlikelySize(bytes.len()));
    }
    if !looks_like_an_exe(&bytes) {
        return Err(ApplyError::NotAnExecutable);
    }

    swap_in_place(&exe, &bytes)
}

fn swap_in_place(exe: &Path, bytes: &[u8]) -> Result<(), ApplyError> {
    let old = exe.with_extension("old");
    let _ = std::fs::remove_file(&old);

    // Windows allows renaming a running executable but not overwriting it; the
    // replacement then takes the original path, and the next launch picks it up.
    if let Err(e) = std::fs::rename(exe, &old) {
        // Which failure was it? Re-probe rather than reading the ErrorKind: a
        // read-only SMB share reports ERROR_NETWORK_ACCESS_DENIED, which Rust
        // does not map to PermissionDenied, and guessing here is how this
        // becomes "update failed" with no explanation.
        return Err(match writability() {
            Writability::No(_) => ApplyError::ReadOnlyLocation(
                exe.parent().map(|p| p.display().to_string()).unwrap_or_default(),
            ),
            Writability::Yes => ApplyError::Swap(e.to_string()),
        });
    }

    if let Err(e) = std::fs::write(exe, bytes) {
        // Put the working app back. Losing the old binary as well as failing the
        // update would leave the school with nothing to run.
        let _ = std::fs::rename(&old, exe);
        return Err(ApplyError::Swap(e.to_string()));
    }
    Ok(())
}

/// Launch the (now replaced) exe again.
pub fn restart() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::process::Command::new(exe).spawn();
    }
}

/// Remove the `.old` binary a previous update left behind. Best-effort: if
/// antivirus still has it open we simply try again next launch.
pub fn cleanup() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(exe.with_extension("old"));
    }
}

/// Only used to report where the app is running from in `--diagnostics`.
pub fn install_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_comparison_is_numeric_not_lexicographic() {
        assert!(is_newer("0.3.10", "0.3.9"), "10 > 9 by number, not by string");
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(is_newer("0.2", "0.1.9"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        // A tag we cannot parse must never read as newer.
        assert!(!is_newer("nightly", CURRENT));
    }

    #[test]
    fn a_block_page_is_not_an_executable() {
        assert!(looks_like_an_exe(b"MZ\x90\x00"));
        assert!(!looks_like_an_exe(b"<!doctype html><title>Access Denied</title>"));
        assert!(!looks_like_an_exe(b""));
    }

    #[test]
    fn every_apply_error_names_the_manual_route() {
        let errors = [
            ApplyError::Download("timeout".into()),
            ApplyError::NotAnExecutable,
            ApplyError::UnlikelySize(12),
            ApplyError::ReadOnlyLocation(r"\\server\apps".into()),
            ApplyError::Swap("locked".into()),
        ];
        for e in errors {
            let m = e.message();
            assert!(m.contains("github.com"), "{} gave no way out: {m}", e.kind());
            assert!(!m.is_empty());
        }
    }
}
