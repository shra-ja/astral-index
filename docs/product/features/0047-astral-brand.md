# 0047 — Astral brand

Status: In progress · Milestone 10, Release readiness
Decisions: [0013](../../architecture/decisions/0013-visual-design.md), [0017](../../architecture/decisions/0017-astral-index-name.md), [0023](../../architecture/decisions/0023-astral-brand.md)

Replace the placeholder brand mark and the live-text title with the Astral
Suite brand: the emblem in its rounded tile beside the Astral Index wordmark in
the sidebar, the tile alone in the collapsed sidebar, and an operating-system
application icon built from the emblem by the same tile rules. The app has a
dark theme only, so it uses the dark-background wordmark, from the brand's
small set at sidebar size. The window and
webview titles stay "Astral Index".

## Tasks

Each task is one PR, in this order.

- [x] Show the Astral lockup in the sidebar, test first.
  - Record a decision that amends decision 0013's custom brand mark: the
    emblem and wordmark files are kept as supplied in
    `src-ui/src/assets/brand/`, never edited here, and the lockup rules in this
    feature are their specification.
  - Add `astral-index-emblem-small.svg` and `astral-index-wordmark-small.svg`,
    the brand's small set for wordmarks up to 26 px high. The emblem is
    inlined, without its `<title>` and `<desc>`, so `currentColor` applies:
    lint forbids `v-html`, so `AstralTile` draws the file's paths, and a test
    keeps them identical.
  - Sidebar lockup: wordmark height H = 18 px, a 2.4 H tile (`#202735`,
    radius 0.506 H), the small emblem at 110% of the tile in `#faf9f5`, a 0.7 H
    gap and the two centred vertically. Size every part from H in CSS, and keep
    at least 0.7 H clear around the lockup, adjusting the sidebar's padding or
    width if the 186 px lockup does not fit.
  - The wordmark replaces the "Astral Index" text: an `img` with
    `alt="Astral Index"`, and the tile `aria-hidden`. Below 900 px the
    collapsed sidebar shows the tile alone at 32 px; the wordmark is hidden
    visually but still names the app to assistive technology.
  - Remove the old four-point star mark and its accent colour. Never recolour,
    stretch or re-type the wordmark, or show the emblem without its tile.
  - Verify natively: end-to-end screenshots of the expanded and collapsed
    sidebar, at 1× and with `ASTRAL_INDEX_ZOOM=1.25`.
- [ ] Replace the application icon with the Astral tile, test first where the
  build allows.
  - Replace `src-tauri/icons/source.svg`, the old gold star, with the emblem in
    its tile by the lockup's rules: `#202735` tile filling the canvas with a 21%
    corner radius, the emblem at 110% of the tile, centred, in `#faf9f5`. Use
    the small emblem for icon sizes up to 64 px and the regular emblem above.
  - Regenerate `icon.png` and `icon.ico` with `npx tauri icon`. If it takes
    one source only, assemble the small sizes from the small-emblem source and
    record the steps in DEVELOPMENT.
  - Verify: the mock binary's window and taskbar icon on Linux, the Windows
    cross-build's `.ico`, and the release `.deb`'s icon all show the tile.
- [ ] Update the living docs and close the feature: decision 0013's brand-mark
  line, the frontend README's assets, DEVELOPMENT's icon steps, and STATUS.
  `npm run check` passes and searching tracked files finds no remaining use of
  the old star mark's path or colours outside archived history.
