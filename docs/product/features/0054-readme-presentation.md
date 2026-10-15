# 0054 — README presentation

Status: In progress · Milestone 10, Release readiness

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

- [ ] **Logo.** The brand's open lockup, the regular emblem beside the regular
  wordmark ([decision 0023](../../architecture/decisions/0023-astral-brand.md)),
  as SVGs for dark and light backgrounds, chosen by the reader's GitHub theme
  through a `<picture>` element. A script builds them from the brand files in
  `src-ui/src/assets/brand/`, which gain the light wordmark as supplied, and a
  check fails if they stop matching them.
- [ ] **Screenshots.** A script drives the mock debug binary, with its synthetic
  history, through the History screen's list view and the import review, and
  saves them as PNGs at twice the pixel density, committed and re-generated
  whenever the screens change. No real account or history appears.
- [ ] **The README.** A centred header: the logo, a one-line description under
  120 characters, one row of badges (latest release, licence, CI status, Tauri,
  Rust, TypeScript, Vue), and a link row (Download · Features · Development).
  Then the History screenshot; the features as they are today, with the review
  screenshot beside retrieval; a Download section mirroring the release notes'
  Usage text with portable mode; privacy and where data lives, in a few lines;
  development links; the licence and disclaimer. No table of contents, GIFs,
  alerts, planned features, requirements, warnings or recovery help. This also
  completes 0039's release docs, and records that neither the notes nor the
  README mention the warnings an unsigned executable meets.
