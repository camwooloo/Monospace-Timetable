# Release notes

One file per release, named for its tag: `v0.6.0.md` for `v0.6.0`.

**These are the release body AND what the in-app update dialog shows.** Write
them for a school IT technician deciding whether to update, not for whoever
wrote the commits — the commit list is one click away from the release page and
is no use to somebody standing in front of an update prompt.

- Markdown works. The app renders headings, bold, code, links, lists and
  tables. Keep it short: the dialog gives it about half the window.
- Do **not** put `<!-- app:end -->` in the file. The workflow appends it, and a
  second one would cut the notes at whichever came first.
- The release fails if the file is missing or under 40 characters of content.
  That is deliberate: falling back to a generated commit list would ship the
  thing this replaces, on the one release nobody remembered to write.
