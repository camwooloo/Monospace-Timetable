//! The embedded front-end document.
//!
//! `build.rs` stages exactly one file at `$OUT_DIR/app.html` — either the built
//! front-end or the placeholder — so this `include_str!` never has to care which
//! and the crate always compiles on its own.

/// The whole front-end, inlined. ~600 KB in a real build.
pub const DOCUMENT: &str = include_str!(concat!(env!("OUT_DIR"), "/app.html"));

/// `"frontend"` or `"placeholder"`. Reported by `--diagnostics`.
pub const SOURCE: &str = env!("MONOSPACE_HTML_SOURCE");

/// The path the document was staged from, for support calls.
pub const ORIGIN: &str = env!("MONOSPACE_HTML_ORIGIN");

/// The document with a marker script injected, for the copy we drop in `%TEMP%`
/// and hand to the default browser when WebView2 is missing.
///
/// The marker matters: in the browser there is no `window.MonospaceShell`, so
/// the page falls back to `<input type=file>` and a download link on its own —
/// but it cannot otherwise tell "the user opened the standalone HTML on
/// purpose" from "the app bounced me here because this PC has no WebView2", and
/// those want different words on screen.
pub fn browser_fallback_document(reason: &str) -> String {
    let marker = format!(
        "<script>window.__MONOSPACE_FALLBACK__={{reason:{}}};</script>",
        serde_json::Value::String(reason.to_string())
    );
    insert_after_doctype(DOCUMENT, &marker)
}

/// Put `snippet` immediately after the doctype so it runs before the page's own
/// scripts. A `<script>` ahead of `<html>` is hoisted into `<head>` by every
/// parser; prepending it *before* the doctype would drop the page into quirks
/// mode, and appending it at the end would run it too late to be read.
fn insert_after_doctype(doc: &str, snippet: &str) -> String {
    let lower = doc.to_ascii_lowercase();
    match lower.find("<!doctype") {
        Some(start) => match lower[start..].find('>') {
            Some(offset) => {
                let at = start + offset + 1;
                let mut out = String::with_capacity(doc.len() + snippet.len() + 1);
                out.push_str(&doc[..at]);
                out.push('\n');
                out.push_str(snippet);
                out.push_str(&doc[at..]);
                out
            }
            None => format!("{doc}\n{snippet}"),
        },
        None => format!("{snippet}\n{doc}"),
    }
}

#[cfg(test)]
mod tests {
    use super::insert_after_doctype;

    #[test]
    fn lands_after_the_doctype_not_before_it() {
        let out = insert_after_doctype("<!doctype html>\n<title>x</title>", "<script>1</script>");
        assert!(out.starts_with("<!doctype html>"), "quirks mode would follow");
        assert!(out.find("<script>1</script>").unwrap() < out.find("<title>").unwrap());
    }

    #[test]
    fn tolerates_a_document_with_no_doctype() {
        let out = insert_after_doctype("<title>x</title>", "<script>1</script>");
        assert!(out.starts_with("<script>1</script>"));
    }

    #[test]
    fn the_embedded_document_is_a_whole_page() {
        assert!(super::DOCUMENT.len() > 500, "staged document looks truncated");
        assert!(super::DOCUMENT.to_ascii_lowercase().contains("<script"));
    }
}
