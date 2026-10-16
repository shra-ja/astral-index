# 0054 — README presentation

Status: Done · Milestone 10, Release readiness

Give the README the shape of a well-crafted project page before the first
release links to it: the brand at the top, a few badges, screenshots of the app
with synthetic history, and only what the app does today. Common to the guidance
(Standard Readme, Make a README, the awesome-readme collection) and to the
desktop apps studied: a logo with a one-line description, a few relevant badges,
a screenshot near the top, features as short bullets, download steps, material
for developers, and the licence last, kept concise.

## Tasks

One PR, test first, previewed locally as GitHub renders it before it is
committed, as the logo's and screenshots' look decides whether they need
refining.

- [x] **Logo.** The brand's open lockup, the regular emblem beside the regular
  wordmark ([decision 0023](../../architecture/decisions/0023-astral-brand.md)),
  as SVGs for dark and light backgrounds, chosen by the reader's GitHub theme
  through a `<picture>` element. A script builds them from the brand files in
  `src-ui/src/assets/brand/`, which gain the light wordmark as supplied, and a
  check, with a mutation probe, fails if they stop matching them.
- [x] **Screenshots.** A script drives the mock debug binary, with its synthetic
  history, and saves PNGs at twice the pixel density, committed and re-generated
  whenever the screens change; no real account or history appears.
  - The hero is the History screen's list view, framed as a Windows 11 window so
    the README shows a desktop app at a glance: a dark title bar in Segoe UI,
    with the app's icon and caption buttons, on the brand's blue, violet and
    plum, darkened and fading towards the bottom to GitHub's dark page colour,
    with a soft violet light behind the window and a strong shadow. The
    screenshot keeps its own pixels in the frame.
  - A two-image gallery under the features shows the import review and the
    History screen's grid view of the last 6 months' 5★ and 4★ rolls, without
    the sidebar, at 760 px wide, the narrowest window that keeps the filters on
    one line and the category tabs in view.
  - The mock's Character Event history spans about a year, from 31 Aug 2025 to
    7 Sep 2026, ten-pulls three days apart. Its newest month reads like real
    play: single pulls and ten-pulls, varied 4★ characters and light cones, a 4★
    or better at least every 10 rolls, Seele, a lost 50/50, at pity 74, then
    Robin • Summeretto at 67 on the first page. Its rarity totals are unchanged.
- [x] **The README.** A centred header: the logo, a one-line description under
  120 characters, one row of badges (latest release, licence, tests, Tauri,
  Rust, TypeScript, Vue), and a link row (Download · Features · Development).
  Then the hero; the features as they are today, followed by the gallery; a
  Download section pointing at the latest release, mirroring the release notes'
  Usage text with portable mode; storage, privacy and where data lives, in a few
  lines; development links; the licence and disclaimer. No table of contents,
  GIFs, alerts, planned features, requirements, warnings or recovery help. This
  also completes 0039's release docs, and records that neither the notes nor the
  README mention the warnings an unsigned executable meets.
