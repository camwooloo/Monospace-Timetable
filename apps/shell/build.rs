//! Build script. Two jobs, both best-effort, neither allowed to fail the build.
//!
//! 1. Decide which front-end document gets baked into the exe, and stage it at
//!    `$OUT_DIR/app.html` so `src/html.rs` can `include_str!` a path that always
//!    exists. This is what lets the crate build and run on its own before the
//!    front-end package exists.
//! 2. On a Windows host, turn `assets/icon.png` into an `.ico` and attach it as
//!    the exe's file icon so Explorer and the taskbar show it.

use std::path::{Path, PathBuf};

/// ⭐ WHERE THE FRONT-END IS EXPECTED, relative to this crate.
///
/// One self-contained `.html` with every byte inlined — no `<script src>`, no
/// external stylesheet, no CDN — because the same document is also shipped as
/// the standalone browser build and gets written to `%TEMP%` and opened in the
/// default browser when WebView2 is missing. Anything it fetches at runtime is
/// a blank page on the machines that need the fallback most.
///
/// Override with the `MONOSPACE_TIMETABLE_HTML` environment variable, which is
/// how CI points at the artefact the front-end job produced.
const FRONTEND_HTML: &str = "../tool/dist/timetable.html";

/// Used when `FRONTEND_HTML` is absent. Kept as a real file rather than a
/// string literal in here so it can be opened in a browser and worked on.
const PLACEHOLDER_HTML: &str = "assets/placeholder.html";

fn main() {
    println!("cargo:rerun-if-env-changed=MONOSPACE_TIMETABLE_HTML");
    stage_frontend();

    println!("cargo:rerun-if-changed=assets/icon.png");
    #[cfg(windows)]
    embed_resources();
}

// ───────────────────────────── front-end staging ─────────────────────────────

fn stage_frontend() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("app.html");

    let candidate = match std::env::var("MONOSPACE_TIMETABLE_HTML") {
        Ok(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => manifest.join(FRONTEND_HTML),
    };

    println!("cargo:rerun-if-changed={}", candidate.display());

    if candidate.is_file() {
        match std::fs::copy(&candidate, &out) {
            Ok(bytes) => {
                // Reported at runtime by `--diagnostics`, so a support call can
                // establish whether a school is running a real build or a shell
                // with the placeholder in it without guessing from the UI.
                println!("cargo:rustc-env=MONOSPACE_HTML_SOURCE=frontend");
                println!(
                    "cargo:rustc-env=MONOSPACE_HTML_ORIGIN={}",
                    candidate.display()
                );
                println!("cargo:rustc-env=MONOSPACE_HTML_BYTES={bytes}");
                return;
            }
            Err(e) => println!(
                "cargo:warning=shell: could not read {} ({e}); falling back to the placeholder",
                candidate.display()
            ),
        }
    } else {
        println!(
            "cargo:warning=shell: no front-end at {} — embedding the placeholder UI. \
             Set MONOSPACE_TIMETABLE_HTML to point at the built document.",
            candidate.display()
        );
    }

    let placeholder = manifest.join(PLACEHOLDER_HTML);
    println!("cargo:rerun-if-changed={}", placeholder.display());
    let bytes = std::fs::copy(&placeholder, &out)
        .unwrap_or_else(|e| panic!("shell: placeholder {} is missing ({e})", placeholder.display()));
    println!("cargo:rustc-env=MONOSPACE_HTML_SOURCE=placeholder");
    println!("cargo:rustc-env=MONOSPACE_HTML_ORIGIN={}", placeholder.display());
    println!("cargo:rustc-env=MONOSPACE_HTML_BYTES={bytes}");
}

// ─────────────────────── exe icon and version block ───────────────────────
//
// `#[cfg(windows)]` here is the HOST, not the target: a cross-build from macOS
// skips this entirely. That is a known, accepted gap — the release builds run
// on windows-latest, where this path is live. The runtime window/taskbar icon
// in main.rs is separate and works either way.
//
// ⚠️ THE VERSION BLOCK IS NOT CONDITIONAL ON THE ICON, AND IT USED TO BE.
// This function returned early when `assets/icon.png` was missing — and it IS
// missing — so the released exe carried no VERSIONINFO resource at all: blank
// ProductName, blank FileDescription, blank version in Explorer's Properties →
// Details. That is precisely the tab a school IT technician opens after the
// release page has told them to click through "Windows protected your PC" on
// an unsigned binary, and finding nothing there is the wrong answer. The icon
// is decoration; the version block is the only thing inside the file that says
// what it is and who wrote it. Add the icon whenever there is one, embed the
// metadata always.

#[cfg(windows)]
fn embed_resources() {
    let mut res = winresource::WindowsResource::new();

    match encode_icon() {
        Some(ico) => {
            res.set_icon(&ico);
            println!("cargo:warning=shell: embedded exe icon from assets/icon.png");
        }
        None => println!(
            "cargo:warning=shell: no usable assets/icon.png — the exe gets the default file \
             icon. The version block is still embedded."
        ),
    }

    res.set("FileDescription", "Monospace Timetable");
    res.set("ProductName", "Monospace Timetable");
    res.set("LegalCopyright", "© Cam Wooloo — AGPL-3.0-only");
    // winresource cannot always find the SDK's rc.exe on its own.
    if let Some(rc_dir) = find_rc_dir() {
        res.set_toolkit_path(&rc_dir);
    }
    // A warning and not a panic: a missing rc.exe must not stop somebody
    // building the app, and the CI check that matters reads the PE headers.
    if let Err(e) = res.compile() {
        println!("cargo:warning=shell: exe resource embed failed: {e}");
    }
}

/// `assets/icon.png` → an `.ico` in `OUT_DIR`, or `None` if there isn't one.
///
/// ⚠️ SIX SIZES, NOT ONE, AND THAT IS NOT COMPLETENESS FOR ITS OWN SAKE. This
/// wrote a single 256×256 entry, which is the size Windows uses in exactly one
/// view. Explorer's Details and List views — the ones a school technician is
/// actually in when they open Properties on an unsigned download — draw at 16
/// and 20, and Windows got there by scaling 256 down on the fly, which turns a
/// 2px stroke into grey mush. The `.ico` format exists to carry the small ones
/// drawn deliberately; a downscale done here, once, beats one done per paint.
#[cfg(windows)]
fn encode_icon() -> Option<String> {
    let (rgba, w, h) = load_icon_png()?;
    let out_dir = std::env::var("OUT_DIR").ok()?;
    let ico_path = Path::new(&out_dir).join("icon.ico");

    let mut dir = ico::IconDir::new(ico::ResourceType::Icon);
    let mut added = 0usize;
    for size in [256u32, 128, 64, 48, 32, 16] {
        // Never upscale: a source smaller than the target would only invent
        // detail, and the entry is better absent than soft.
        if size > w || size > h {
            continue;
        }
        let scaled = if size == w && size == h {
            rgba.clone()
        } else {
            box_resize(&rgba, w, h, size, size)
        };
        let image = ico::IconImage::from_rgba_data(size, size, scaled);
        if let Ok(entry) = ico::IconDirEntry::encode(&image) {
            dir.add_entry(entry);
            added += 1;
        }
    }
    if added == 0 {
        return None;
    }
    println!("cargo:warning=shell: icon.ico carries {added} size(s)");
    dir.write(std::fs::File::create(&ico_path).ok()?).ok()?;
    ico_path.to_str().map(str::to_string)
}

/// Area-average downscale, premultiplying alpha.
///
/// ⚠️ THE PREMULTIPLY IS THE WHOLE POINT. Averaging straight RGBA lets a fully
/// transparent pixel's colour — black, here, in the rounded corners — drag the
/// average of its neighbours towards it, so the mark picks up a dark halo that
/// only shows at 16 and 32 and only against a light background. Weighting each
/// sample by its own alpha and dividing back out at the end is what stops it.
///
/// A box filter and not Lanczos: this is a downscale of a flat vector render
/// by an integer-ish factor, where the two are indistinguishable, and the
/// alternative is a build-dependency on an image crate for one function.
#[cfg(windows)]
fn box_resize(src: &[u8], sw: u32, sh: u32, dw: u32, dh: u32) -> Vec<u8> {
    let mut out = vec![0u8; (dw * dh * 4) as usize];
    for dy in 0..dh {
        let y0 = dy * sh / dh;
        let y1 = (((dy + 1) * sh + dh - 1) / dh).min(sh).max(y0 + 1);
        for dx in 0..dw {
            let x0 = dx * sw / dw;
            let x1 = (((dx + 1) * sw + dw - 1) / dw).min(sw).max(x0 + 1);
            let (mut r, mut g, mut b, mut a, mut n) = (0f64, 0f64, 0f64, 0f64, 0f64);
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * sw + x) * 4) as usize;
                    let av = src[i + 3] as f64 / 255.0;
                    r += src[i] as f64 * av;
                    g += src[i + 1] as f64 * av;
                    b += src[i + 2] as f64 * av;
                    a += av;
                    n += 1.0;
                }
            }
            let o = ((dy * dw + dx) * 4) as usize;
            if a > 0.0 {
                out[o] = (r / a).round().clamp(0.0, 255.0) as u8;
                out[o + 1] = (g / a).round().clamp(0.0, 255.0) as u8;
                out[o + 2] = (b / a).round().clamp(0.0, 255.0) as u8;
            }
            out[o + 3] = (a / n * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    out
}

/// Newest `…\Windows Kits\10\bin\<ver>\x64` directory that contains rc.exe.
#[cfg(windows)]
fn find_rc_dir() -> Option<String> {
    for root in [
        r"C:\Program Files (x86)\Windows Kits\10\bin",
        r"C:\Program Files\Windows Kits\10\bin",
    ] {
        let mut versions: Vec<_> = std::fs::read_dir(root)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .collect();
        versions.sort();
        for v in versions.into_iter().rev() {
            let dir = v.join("x64");
            if dir.join("rc.exe").exists() {
                return dir.to_str().map(str::to_string);
            }
        }
    }
    None
}

/// Decode `assets/icon.png` to RGBA, expanding RGB if needed.
#[cfg(windows)]
fn load_icon_png() -> Option<(Vec<u8>, u32, u32)> {
    let bytes = std::fs::read("assets/icon.png").ok()?;
    let mut reader = png::Decoder::new(&bytes[..]).read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let (w, h) = (info.width, info.height);
    match info.color_type {
        png::ColorType::Rgba => {
            buf.truncate((w * h * 4) as usize);
            Some((buf, w, h))
        }
        png::ColorType::Rgb => {
            let mut out = Vec::with_capacity((w * h * 4) as usize);
            for px in buf.chunks_exact(3) {
                out.extend_from_slice(px);
                out.push(255);
            }
            Some((out, w, h))
        }
        _ => None,
    }
}

// Silences an unused-import warning on non-Windows hosts.
#[cfg(not(windows))]
#[allow(dead_code)]
fn _unused(_: &Path) {}
