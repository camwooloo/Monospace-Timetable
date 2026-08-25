//! Where the app keeps its files.
//!
//! Portable means beside the exe: copy the exe to a USB stick and the school's
//! working timetable goes with it. But "beside the exe" is exactly where a
//! school will not have write access — the exe lands on a read-only network
//! share, or in `Program Files`, or on a locked-down desktop image — so the
//! fallback is decided here rather than discovered as a silent failure to save.
//!
//! ⚠️ THE FALLBACK IS ANNOUNCED, NOT ASSUMED. `Location::note` is sent to the
//! front-end in the boot payload so the UI can say where the file went. A
//! portable app that quietly writes somewhere other than its own folder is how
//! a term's work gets left behind on a machine nobody logs into again.

use std::path::{Path, PathBuf};

/// The file the app keeps its in-progress timetable in between launches.
pub const WORKING_COPY: &str = "working.timetable.json";

/// Folder created beside the exe. Named, not `Data`, because a portable exe is
/// very often sitting on somebody's Desktop and a folder called `Data` there is
/// a mystery in a month's time.
const BESIDE_EXE_DIR: &str = "MonospaceTimetable-Data";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// Beside the exe — what portable is supposed to mean.
    BesideExe,
    /// The user's roaming profile. Survives reboots; does not travel with the exe.
    UserProfile,
    /// Last resort. Survives the session and very little else.
    Temp,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::BesideExe => "beside-exe",
            Kind::UserProfile => "user-profile",
            Kind::Temp => "temp",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Location {
    pub path: PathBuf,
    pub kind: Kind,
    /// Present whenever we are *not* beside the exe: plain-English words the UI
    /// can show, explaining what happened and what it means.
    pub note: Option<String>,
}

impl Location {
    pub fn working_copy(&self) -> PathBuf {
        self.path.join(WORKING_COPY)
    }
}

/// Pick the first of the three that we can actually write to.
pub fn resolve() -> Location {
    if let Some(dir) = exe_dir().map(|d| d.join(BESIDE_EXE_DIR)) {
        if writable(&dir).is_ok() {
            return Location { path: dir, kind: Kind::BesideExe, note: None };
        }
    }

    if let Some(dir) = profile_dir() {
        if writable(&dir).is_ok() {
            return Location {
                path: dir.clone(),
                kind: Kind::UserProfile,
                note: Some(format!(
                    "This copy of the app is in a folder it cannot write to, so your work is \
                     being saved to {} instead. It will still be here next time you open the \
                     app on this computer, but it will not travel with the app if you move it.",
                    dir.display()
                )),
            };
        }
    }

    let dir = std::env::temp_dir().join("Monospace Timetable");
    let _ = std::fs::create_dir_all(&dir);
    Location {
        path: dir.clone(),
        kind: Kind::Temp,
        note: Some(format!(
            "Neither the app's own folder nor your user profile could be written to, so work is \
             being kept in a temporary folder ({}). Windows clears that folder from time to time \
             — save your timetable somewhere permanent before you finish.",
            dir.display()
        )),
    }
}

pub fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

#[cfg(windows)]
fn profile_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("Monospace Timetable"))
}

#[cfg(target_os = "macos")]
fn profile_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join("Library/Application Support/Monospace Timetable"))
}

#[cfg(all(not(windows), not(target_os = "macos")))]
fn profile_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .map(|p| p.join("monospace-timetable"))
}

/// Create `dir` and prove we can write a file in it, then clean up.
///
/// Creating the directory is not proof on its own: a read-only share can let
/// `create_dir_all` succeed against a folder that already exists, and roaming
/// profiles can be quota-full. The only honest test is to write a byte.
pub fn writable(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let probe = dir.join(".write-probe");
    std::fs::write(&probe, b"monospace")?;
    let _ = std::fs::remove_file(&probe);
    Ok(())
}

/// Write `text` to `path` without leaving a half-written file behind if the
/// power goes or the share drops: write a sibling temp file, then rename over.
///
/// `std::fs::rename` replaces an existing destination on Windows as well as
/// Unix, which is the property this depends on.
pub fn write_atomic(path: &Path, text: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("writing");
    std::fs::write(&tmp, text.as_bytes())?;
    match std::fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_atomic_replaces_and_leaves_no_temp() {
        let dir = std::env::temp_dir().join("monospace-shell-test-atomic");
        let _ = std::fs::remove_dir_all(&dir);
        let target = dir.join("doc.timetable.json");

        write_atomic(&target, "first").unwrap();
        write_atomic(&target, "second").unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "second");
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".writing"))
            .collect();
        assert!(leftovers.is_empty(), "left a temp file behind: {leftovers:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn writable_says_no_for_a_path_that_cannot_exist() {
        // A file, used as if it were a directory.
        let file = std::env::temp_dir().join("monospace-shell-test-not-a-dir");
        std::fs::write(&file, b"x").unwrap();
        assert!(writable(&file.join("inside")).is_err());
        let _ = std::fs::remove_file(&file);
    }
}
