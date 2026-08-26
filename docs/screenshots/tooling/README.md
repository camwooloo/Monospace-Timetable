# Capturing the screenshots

The images in `docs/screenshots/` are captured headlessly rather than by hand, so
they are reproducible, always the same size, and always show the same school.

**They are 1600×1002** — an 800×501 viewport at `deviceScaleFactor: 2`. Every
existing image is that size and a new one that is not will look wrong beside them
in the README.

## Running it

Playwright is **deliberately not a dependency of this repo**. It is ~100 MB of
browser for a job done a few times a year, and every contributor would pay for it
on `npm install`. Install it ad hoc instead:

```
mkdir -p /tmp/shots && cd /tmp/shots && npm init -y && npm i playwright
```

Then, from the repo root, with the built document being served:

```
npm run build --workspace apps/tool
node apps/tool/scripts/serve.mjs &
node docs/screenshots/tooling/shoot.mjs
```

`shoot.mjs` seeds `seed.mjs` — a real 2026/27 year and the reference IT room rota
— into `localStorage`, restores it, and captures each screen.

## ⭐ `audit.mjs` is the one that earns its keep

`shoot.mjs` produces pictures; `audit.mjs` asserts things about them that no
other check in this repo can see.

It walks every Rota screen and fails on a field that is **near-white** or whose
text is **clipped**. Both of those shipped in v0.6.0: the rota list drew eighteen
white boxes on the dark theme, because the global styling selects
`input[type="text"]` and those inputs carried no `type` attribute at all — an
attribute selector does not match an element that lacks the attribute. The
typecheck was clean, 99 tests passed, and the byte-for-byte workbook gate passed.
None of them can see a white box.

```
node docs/screenshots/tooling/audit.mjs
```

If you add a screen, add it to the list in `audit.mjs`.
