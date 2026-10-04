# 0024 — App shell and import screens

Status: Done · Milestone 6, Desktop UI foundation
Decisions: [0013](../../architecture/decisions/0013-visual-design.md)

The sidebar shell with History and Import screens per game, restyled import
screens and bundled icons.

## Tasks

- [x] Add the app shell from [decision 0013](../../architecture/decisions/0013-visual-design.md):
  a sidebar with the game switcher and separate History and Import screens
  per game, opening on Star Rail's History. Move the existing retrieval flow
  onto the Import screen; Genshin Impact's Import screen says retrieval is
  coming soon.
- [x] Restyle the Import screens to the design: sources, progress, review,
  saved and failure screens, with the retrieval flow reporting its outcome.
  The review's roll preview and the per-category progress counts follow
  their own items.
- [x] Replace the hand-drawn inline SVG icons with Lucide
  (`@lucide/vue`, ISC licence, bundled per icon), keeping the brand mark
  and game monograms custom. No behaviour change.
