# 0023 — Astral brand

Date: 2026-10-09
Status: Accepted

## Context

Decision 0013 gave the sidebar a custom brand mark: a hand-drawn four-point
star in an outlined square, beside the name as live text. Astral Index now
belongs to the Astral Suite, whose brand is a fixed emblem and wordmark: the
emblem in a rounded tile, followed by the wordmark, with every size derived from
the wordmark's height. The app's taskbar and installer icon is still an older
gold star.

## Decision

The sidebar shows the Astral lockup in place of decision 0013's brand mark and
the live-text name, and the application icon becomes the emblem in its tile
([feature 0047](../../product/features/0047-astral-brand.md)).

- **Files:** the emblem and wordmark SVGs are kept as supplied in
  `src-ui/src/assets/brand/` and never edited here. The brand has a small set,
  with heavier strokes and larger details, for wordmarks up to 26 px high
  (tiles up to 64 px), and a regular set above; the two are never mixed. The
  sidebar uses the small set, and the app has a dark theme only, so it carries
  the small emblem and the small dark-background wordmark.
- **Lockup:** sized from the wordmark's height H, 18 px in the sidebar: a
  2.4 H square tile in `#202735` with a 21% corner radius, the emblem at 110% of
  the tile, centred, in `#faf9f5`, a 0.7 H gap and the two centred vertically,
  with at least 0.7 H clear around it. The wordmark is never recoloured,
  stretched or re-typed as text, and the emblem never appears without its tile.
- **Collapsed sidebar:** the tile alone, at 32 px.
- **Drawing the emblem:** it is inlined so it takes `currentColor`. Lint forbids
  `v-html`, so `AstralTile` draws the supplied file's paths, without its title
  and description, and a unit test checks they match the file exactly.
- **Drawing the wordmark:** an `<img>` of the supplied file, the usual way to
  show a logo whose colours are fixed: the file stays as supplied, the browser
  caches it, and its gradient's `id` stays out of the page.
- **Application icon** (added 2026-10-10): the emblem in its tile by the same
  rules, the tile filling a square canvas with transparent corners. Sizes up to
  64 px use the small emblem and larger ones the regular emblem, so `icon.ico`
  holds 16 to 64 px from the small set and 256 px from the regular one. Tauri's
  icon command renders one source at a time, so `tooling/app-icons.ts` builds
  both tiles from the brand files, renders them, assembles the `.ico` and writes
  the PNGs the `.deb` installs and the Linux window uses. `npm run icons:check`
  fails when the committed icons stop matching the brand files.
- **Accessibility:** the wordmark is an image with the alt text "Astral Index"
  and the tile is decorative. In the collapsed sidebar the wordmark is hidden
  visually but kept for assistive technology, so the app has one name in every
  layout rather than a second label on the tile.

## Alternatives and consequences

- **`v-html` from the raw file:** follows the file most directly, but needs a
  lint rule disabled, which the project does not allow.
- **A CSS mask of the file:** keeps the file untouched with no copied paths, but
  depends on WebKitGTK's and WebView2's mask support and departs from the
  inline drawing the brand specifies.
- **An inline wordmark:** measured slightly sharper than an `<img>` with the
  regular wordmark's light strokes, but the small set's heavier strokes make
  that redundant, and it would need copied paths kept in step with the file.
- A new emblem or wordmark replaces the files in `assets/brand/`; the
  `AstralTile` test then fails until its paths are copied again.
