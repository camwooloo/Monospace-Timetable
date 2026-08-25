/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE MONOSPACE MARK — the square, the M and the tick, and nothing else
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⭐ TWO PATHS, NOT AN IMAGE. The square (which contains the M) takes
 * `currentColor`, so it is white on the dark theme and black on the light one
 * for free; the tick takes `var(--accent)`. That is the whole reason this is
 * geometry rather than a PNG: an image would need two files, would need to be
 * swapped on a theme change, and would still be soft at 96px.
 *
 * ⚠️ THE WHITE TILE THE REAL LOGO SITS ON IS DELIBERATELY NOT HERE. Monospace's
 * app icon is a white rounded tile with a dark M on it — correct on a home
 * screen, wrong in a dark left rail, where it reads as a lit window. The
 * background is dropped and the mark alone is drawn.
 *
 * ── ⚠️ WHERE THESE NUMBERS CAME FROM, BECAUSE IT MATTERS IF THEY EVER MOVE ──
 * `src/app/icon.svg` in the Monospace repo is a 2048×2048 AUTO-TRACE: 1,426
 * paths in 1,263 distinct fills, which is an anti-aliased raster in an SVG
 * wrapper, not artwork. It cannot be recoloured — there is no "the dark part"
 * to select. So these two paths were traced from `public/icon-512.png`
 * instead: pixels classified into ground / body / tick by distance from the
 * ground colour and hue, marching squares over each mask, then Douglas-Peucker
 * at ε=0.6% of the width.
 *
 * ⚠️ SO THIS IS A REDRAWING AND IT WAS MEASURED, NOT EYEBALLED. Rendered back
 * at 512² and diffed against the masks it came from: mean absolute error
 * 1.85/255 on the square and 0.49/255 on the tick, with the differing pixels
 * lying on the anti-aliased edge — a soft mask against a hard vector edge.
 * If the brand mark is ever redrawn properly, replace these two strings and
 * re-run that diff; do not nudge the numbers by eye.
 */

/** The rounded square and the M inside it. One `fill-rule="evenodd"` shape. */
export const MARK_SQUARE =
  "M16.5 15.04 L73.73 15.04 L72.95 16.21 L71.97 17.19 L71.97 17.38 L67.77 22.36 L20.31 22.36 L19.34 22.75 L18.46 23.63 L17.87 25.2 L17.87 79.3 L18.07 79.49 L18.07 80.27 L18.46 81.05 L19.53 82.13 L19.92 82.32 L20.7 82.32 L20.9 82.52 L75.39 82.52 L75.59 82.32 L76.17 82.32 L77.15 81.74 L78.03 80.66 L78.03 80.27 L78.22 80.08 L78.22 34.18 L83.89 27.54 L84.67 26.37 L85.74 25.29 L85.84 25.39 L85.84 83.2 L85.64 83.4 L85.45 84.77 L84.47 86.72 L82.62 88.57 L80.86 89.55 L80.47 89.55 L79.69 89.94 L16.6 89.94 L16.41 89.75 L14.84 89.36 L14.45 88.96 L13.87 88.77 L12.01 87.11 L11.23 85.94 L11.23 85.55 L10.84 84.96 L10.84 84.57 L10.45 83.79 L10.45 21.09 L10.64 20.9 L10.64 20.31 L12.01 17.77 L13.87 16.11 L15.82 15.14 Z M29.79 30.86 L32.42 30.76 L33.98 31.54 L34.86 32.42 L35.25 33.2 L36.82 35.16 L38.77 38.28 L39.36 38.87 L41.7 42.38 L41.7 42.77 L40.53 43.95 L40.53 44.14 L36.91 48.54 L36.43 48.44 L34.67 45.7 L34.18 45.21 L34.08 45.31 L34.08 71.09 L33.89 71.29 L33.89 71.88 L33.3 72.85 L32.81 73.34 L31.45 74.12 L29.1 74.12 L28.32 73.73 L27.44 73.05 L26.46 71.09 L26.46 34.38 L26.66 34.18 L26.86 33.2 L27.25 32.62 L28.52 31.35 Z M69.43 44.73 L69.82 44.73 L69.82 46.29 L69.63 46.48 L69.82 46.88 L69.82 70.12 L69.63 70.31 L69.63 71.48 L69.04 72.66 L67.97 73.73 L66.99 74.12 L64.84 74.12 L63.87 73.73 L62.79 72.66 L62.4 72.07 L62.21 70.9 L62.01 70.7 L62.01 53.71 L62.79 52.54 L63.96 51.37 L63.96 51.17 Z";

/** The tick, which overlaps the square's top-right corner and is drawn over it. */
export const MARK_TICK =
  "M84.47 9.77 L85.94 9.67 L86.13 9.86 L86.72 9.86 L87.5 10.25 L88.96 11.72 L89.36 12.7 L89.36 14.84 L88.57 16.21 L85.64 19.53 L84.67 20.9 L83.5 22.07 L83.5 22.27 L82.52 23.24 L81.54 24.61 L80.37 25.78 L79.59 26.95 L77.44 29.3 L77.44 29.49 L76.46 30.47 L76.46 30.66 L75.49 31.64 L75.49 31.84 L74.51 32.81 L73.54 34.18 L72.36 35.35 L70.61 37.7 L68.46 40.04 L67.68 41.21 L65.53 43.55 L65.53 43.75 L63.57 45.9 L62.79 47.07 L60.64 49.41 L59.86 50.59 L58.69 51.76 L58.69 51.95 L55.76 55.27 L54.98 56.45 L51.86 59.96 L51.07 61.13 L49.9 62.3 L49.12 63.48 L48.05 64.55 L47.85 64.55 L47.17 63.87 L46.39 62.5 L45.8 61.91 L45.02 60.55 L44.43 59.96 L43.65 58.59 L43.07 58.01 L42.29 56.64 L41.7 56.05 L40.92 54.69 L39.16 52.34 L38.96 51.76 L39.36 51.17 L40.92 49.41 L41.7 48.24 L42.87 47.07 L43.65 45.9 L43.95 45.8 L45.61 47.85 L47.75 51.17 L48.24 51.46 L50.29 49.02 L50.29 48.83 L51.27 47.85 L51.27 47.66 L52.25 46.68 L52.25 46.48 L53.42 45.31 L54.2 44.14 L58.5 39.26 L60.25 36.91 L61.43 35.74 L61.43 35.55 L64.55 32.03 L65.33 30.86 L66.5 29.69 L67.29 28.52 L68.46 27.34 L68.46 27.15 L71.58 23.63 L71.58 23.44 L72.56 22.46 L72.56 22.27 L73.54 21.29 L73.54 21.09 L74.51 20.12 L74.51 19.92 L75.49 18.95 L76.46 17.58 L80.76 12.7 L81.74 11.33 L82.62 10.45 L83.79 9.86 Z";

/**
 * The mark at `size` px.
 *
 * ⚠️ THE FILLS ARE SET IN CSS, NOT HERE (`.mark` in `aurora.css`). A
 * `fill="var(--accent)"` presentation attribute does resolve in every browser
 * this ships to, but it also puts a colour decision in a file whose banner
 * says the colours live in the stylesheet.
 */
export function mark(size = 44): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    `<path class="m-sq" fill-rule="evenodd" d="${MARK_SQUARE}"/>` +
    `<path class="m-tk" fill-rule="evenodd" d="${MARK_TICK}"/>`;
  return svg;
}
