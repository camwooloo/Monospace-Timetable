/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TIMETABLE'S OWN ACCENT — ONE COLOUR, STORED ON THE ORGANISATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam: *"there should also be a Customise section allowing users to tweak the
 * accent colours from our default purples."*
 *
 * ── ⚠️ THIS IS NOT THE APP ACCENT, AND IT IS NOT PER USER ────────────────
 * Monospace already has two accents and this is a third, deliberately:
 *
 *   users.accent               A PERSON'S preference for the whole app.
 *                              Appearance settings. Follows them everywhere.
 *   organisations.themeOverride.accent
 *                              The org's branding for its own routes, which
 *                              may or may not beat the personal one
 *                              (`enforceTheme`).
 *   organisations.timetableAccent   ⭐ THIS ONE. The colour of the TIMETABLE
 *                              DOCUMENT — the week bands in the grids and the
 *                              furniture of the exported workbook.
 *
 * It is ORG-LEVEL and never per user, because the timetable is a DOCUMENT that
 * gets printed, exported, pinned to a staffroom wall and mailed around. Two
 * teachers comparing printouts of the same week must be comparing the same
 * sheet; a per-user accent would mean the school's timetable is a different
 * colour in every conversation about it. The exported .xlsx settles the
 * argument on its own: the bytes are written once, on a server, with no user
 * on the other end to have a preference.
 *
 * ⭐ THE SECOND AND THIRD OF THOSE NOW MEET, IN ONE DIRECTION ONLY. Customise
 * offers to take the org's brand accent as this one's starting value —
 * `timetableAccentFromBrand()` below is the whole of that bridge, and its
 * banner argues why it is a COPY rather than a live link. After it there is no
 * brand colour any more, only a colour, held to every rule any other accent is.
 *
 * It is ONE colour and not three. The workbook's palette is a base purple plus
 * its Office "Lighter 40%" / "Lighter 60%" tints — the tints are DERIVED, so
 * exposing them as separate controls would let an admin pick three unrelated
 * colours and produce a sheet whose bands no longer read as one family. One
 * base in, a family out.
 *
 * ── ⚠️ THE COLOUR MATHS IS NOT IN THIS FILE, ON PURPOSE ──────────────────
 * convex/lib/timetableSheet.ts owns the palette: which fills exist, how the
 * tints are computed or written out, what ink sits on them and what the
 * contrast has to clear. This file owns the STORE and its FORMAT, so that the
 * mutation, the settings control and the two grids all agree on what a stored
 * accent IS before anybody derives anything from it.
 *
 * THE CONTRACT THIS FILE OFFERS THE PALETTE:
 *
 *   · A resolved accent is ALWAYS `#rrggbb`, lowercase, six hex digits, no
 *     shorthand and no alpha. `resolveTimetableAccent()` is the only reader
 *     and it can never return undefined — absent means
 *     `DEFAULT_TIMETABLE_ACCENT`, which is the purple the workbook already
 *     uses, so a school that never opens Customise gets exactly the file it
 *     gets today.
 *   · AND THAT IS THE WHOLE CONTRACT — the store hands over a `#rrggbb` and
 *     stops. ⚠️ THERE IS DELIBERATELY NO `accentToArgb()` HERE. One was
 *     written, exported and never called: the workbook never fills a cell with
 *     the accent ITSELF, only with its two tints, and `towardsWhite()` in
 *     convex/lib/timetableSheet.ts already emits those in the `FFRRGGBB` form
 *     exceljs wants. A second converter sitting beside it, advertised in this
 *     banner as the bridge, is the drift this file exists to avoid — if a
 *     solid-accent fill is ever wanted, derive it where the other fills are
 *     derived rather than here.
 *
 * ⭐ AND IT IS THREADED. The palette takes ONE optional accent argument
 * wherever `STRUCTURE_BASE` and `SHEET_FILL.structure` / `.structureAlt` used
 * to be read directly, defaulting to today's constants when it is absent:
 *
 *   `sheetFills(accent)`            the PRINTED fills — the workbook and the
 *                                   light grid. No clamp; the resolved default
 *                                   returns `SHEET_FILL` itself, so the
 *                                   exported file is byte-identical to the one
 *                                   this feature shipped against.
 *   `gridSurfaces(paper, isDark, accent)`
 *                                   the two grids' furniture. The DARK half is
 *                                   clamped on three measured contrast ratios,
 *                                   because the printed half is previewed by
 *                                   the admin and the dark half is previewed
 *                                   by nobody. `darkFrameFor()` has the whole
 *                                   argument.
 *
 * Nothing here had to change for that; this file is deliberately free of any
 * maths that would have to be kept in step with it. ⚠️ IN PARTICULAR, THE
 * VALIDATOR BELOW IS STILL A FORMAT TEST AND MUST STAY ONE — it is also what
 * greys out the Save button, so a contrast rule smuggled into it would refuse
 * a school's brand colour with the words "Not a hex colour yet".
 *
 * ── PURE ────────────────────────────────────────────────────────────────
 * No `_generated`, no `ctx`, no Convex imports. convex/schema.ts's neighbours
 * import their taxonomies this way (see `convex/lib/activityCategories.ts`) and
 * the CLIENT imports this module directly for the swatches and the preview, so
 * the validator that guards the write and the validator that greys out the
 * Save button are the same function rather than two that drift.
 */

/**
 * ⭐ THE DEFAULT, AND IT IS NOT AN ARBITRARY PURPLE.
 *
 * `#8064a2` is Office's accent4 in the theme Cam's own IT_Room_Timetable
 * workbook carries — the colour every band, header and break row in the source
 * document is a tint of, and the colour `STRUCTURE_BASE` in
 * convex/lib/timetableSheet.ts already writes. Absent means this, so switching
 * Customise on changes nothing until somebody picks something.
 *
 * ⚠️ NOT `#7C3AED`, which is the APP's accent. They are close enough to look
 * like a typo of one another and they answer different questions: the app
 * accent is Monospace's brand, this is the school's document.
 */
export const DEFAULT_TIMETABLE_ACCENT = "#8064a2";

/**
 * The swatches offered in Customise. A starting point, not a whitelist — the
 * control also takes a typed hex, and the server validates FORMAT rather than
 * membership of this list, so a school's own brand colour is always reachable.
 *
 * They are all MID-TONE on purpose. The structural ink is black and it sits on
 * this colour lightened towards white, so a base that is already very pale
 * gives a band that is nearly white (the header stops reading as a header) and
 * one that is nearly black gives tints that swallow the ink. Mid-tone bases
 * behave under the same transform the source document's purple does.
 */
export const TIMETABLE_ACCENT_PRESETS: ReadonlyArray<{
  readonly name: string;
  readonly value: string;
}> = [
  { name: "School purple", value: DEFAULT_TIMETABLE_ACCENT },
  { name: "Violet", value: "#7c3aed" },
  { name: "Indigo", value: "#4f6bbf" },
  { name: "Ocean", value: "#3d7ea6" },
  { name: "Teal", value: "#3f8f8a" },
  { name: "Fern", value: "#4f8f5a" },
  { name: "Clay", value: "#a8635b" },
  { name: "Amber", value: "#a6803a" },
  { name: "Slate", value: "#5b6a7d" },
] as const;

/** `#rrggbb` and nothing else. No shorthand (`#abc` doubles ambiguously into
 *  an exported file), no `rgb()`, no named colours, no eight-digit alpha —
 *  the workbook has no alpha channel to put it in. */
const HEX6 = /^#[0-9a-f]{6}$/;

/**
 * ⭐ THE VALIDATOR, AND THE ONLY ONE. Returns the normalised colour, or `null`
 * when the input is not a colour this store accepts.
 *
 * ⚠️ THE SERVER CALLS THIS BEFORE WRITING. A colour arriving from a client is
 * a string, and this one ends up interpolated into a `style` attribute on two
 * grids and into an ARGB fill in a generated workbook. `"red; background:
 * url(…)"` is a perfectly ordinary string and must never reach either.
 * Rejecting on a strict pattern — rather than stripping characters until
 * something parses — is what makes that guarantee legible.
 *
 * Leading/trailing whitespace and a missing `#` are corrected because they are
 * what a paste out of a design tool looks like; anything else is refused.
 */
export function normaliseTimetableAccent(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return HEX6.test(withHash) ? withHash : null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⭐ THE ORG'S BRAND COLOUR, OFFERED AS A TIMETABLE ACCENT
 *  ⚠️ AND IT IS A COPY, NOT A SUBSCRIPTION.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cam: *"in customise for the timetable there should also be an option to
 * adopt the brands accent colour from the theme and branding section."*
 *
 * The source is `organisations.themeOverride.accent` — org settings → Theme &
 * branding → **Org accent**. This function is the ONE bridge between that
 * store and this one, and it is deliberately one-way: nothing here writes to
 * the branding, and nothing in the branding reads this.
 *
 * ── ⚠️ COPY-ONCE, AND THE ARGUMENT IS NOT "IT WAS EASIER" ────────────────
 * The alternative is a marker — store `"brand"` and resolve it against the
 * branding on every read, so the timetable FOLLOWS the org accent for ever.
 * That was considered and rejected, on two grounds that are both about where
 * the consequence lands:
 *
 *   1. ⭐ THE TWO SETTINGS ARE NOT THE SAME KIND OF THING. Theme & branding
 *      colours this organisation's ROUTES: chrome, instantly visible to the
 *      person changing it, and instantly reversible. An admin trying three
 *      blues over an afternoon is doing something cheap. THIS colours a
 *      DOCUMENT — printed, exported to .xlsx, pinned to a staffroom wall and
 *      mailed around, which is the whole reason the banner above gives for it
 *      being org-level rather than per user. Following live would let the
 *      cheap control silently repaint the expensive one from a screen that
 *      mentions no timetable and previews none.
 *   2. ⚠️ THE PRINTED FILLS CARRY NO CLAMP, AND THAT RESTS ON THE ADMIN
 *      LOOKING. `darkFrameFor()`'s banner in convex/lib/timetableSheet.ts
 *      gives, as its first reason for correcting only the DARK grid, that
 *      Customise draws the workbook's own tints at size on white while the
 *      colour is being chosen — "clamp what nobody can see; leave alone what
 *      the admin is looking at". A brand colour arriving months later from
 *      another section would be an unpreviewed accent on the one surface with
 *      no correction to fall back on: a near-white brand colour prints a
 *      header band that is nearly white, and the school finds out in a
 *      staffroom printout.
 *
 * ── SO WHAT STOPS THE COPY DRIFTING SILENTLY? ────────────────────────────
 * Never claiming to follow, and keeping the comparison permanently on screen.
 * TimetableCustomise draws the brand colour BESIDE the timetable's own and
 * offers to take it whenever the two differ — so "these have diverged" is a
 * labelled row in the section that owns the document, not a fact that stopped
 * being visible the moment the copy was made. Change the brand colour and the
 * offer comes back by itself, next to a preview of what taking it would do.
 *
 * ⚠️ AND THE COPY IS AN ORDINARY ACCENT AFTERWARDS. It goes through
 * `normaliseTimetableAccent` here, is written by the same mutation, and is
 * read by the same `resolveTimetableAccent` — so `sheetFills()` prints it
 * unclamped and `gridSurfaces()` holds it to the same three measured contrasts
 * as any typed hex. There is no brand-colour path around the floors, because
 * after this function there is no brand colour, only a colour.
 *
 * Returns the value to WRITE, or `null` when there is no brand colour this
 * store can accept — none set, or one in a format the workbook has nowhere to
 * put. ⚠️ NULL MEANS DO NOT OFFER THE OPTION, never "offer the default
 * instead": a control that hands over a colour the branding does not actually
 * hold is lying about where that colour came from.
 */
export function timetableAccentFromBrand(
  brand: string | undefined | null,
): string | null {
  if (!brand) return null;
  return normaliseTimetableAccent(brand);
}

/**
 * ⭐ ALWAYS RESOLVED, never the raw optional — the same rule
 * `CalendarSummary.taughtWeekdays` follows and for the same reason: a
 * `?? DEFAULT` on the client is a second copy of the default, and the two
 * drift the first time one of them is edited.
 *
 * Read-time, lazy, no backfill. A stored value that somehow fails the pattern
 * (written before this validator existed, or by a hand-edited document)
 * resolves to the default rather than being handed on, because a broken colour
 * reaching a stylesheet is worse than an unexpected purple.
 */
export function resolveTimetableAccent(
  stored: string | undefined | null,
): string {
  if (!stored) return DEFAULT_TIMETABLE_ACCENT;
  return normaliseTimetableAccent(stored) ?? DEFAULT_TIMETABLE_ACCENT;
}
