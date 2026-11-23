/**
 * The site's logo, drawn once for every place it appears: the header and the
 * docs layout (Logo.astro) and the social cards (src/pages/og/_card.ts).
 * Replace the drawing here to rebrand them all. Keep it a single-colour
 * mark; each place fills it with its own text colour.
 */
export const logo = {
  /** The drawing's box; callers size it by height and keep the ratio. */
  width: 48,
  height: 32,
  paths: [
    "M14 4L2 16L14 28L17 25L8 16L17 7Z",
    "M34 4L46 16L34 28L31 25L40 16L31 7Z",
    "M15 17L18 14L22 18L29 11L32 14L22 24Z",
  ],
};
