# 0023 — Visual design

Status: Done · Milestone 6, Desktop UI foundation
Decisions: [0013](../../decisions/0013-visual-design.md)

A reviewed visual design, a bundled typeface and a minimum window size.

## Tasks

- [x] Review the visual design with a mockup of the stored-history display.
  - [x] Mock up the history and import screens on a design canvas (outside
    the repository): sidebar game and screen switching, banner category tabs,
    a toolbar with rarity filters, search and list, grid and icon layouts,
    a pity column, the import flow with progress, review, saved and failure
    states, and styled tooltips. Icons and banner art stay placeholders.
  - [x] Choose the UI typeface: Hanken Grotesk, with tabular figures for
    numbers, after comparing IBM Plex Sans, Manrope, DM Sans and Figtree.
  - [x] Bundle Hanken Grotesk with the app (open font licence); no remote
    fonts.
  - [x] Record the visual design as a decision
    ([decision 0013](../../decisions/0013-visual-design.md)).
- [x] Set the app window's minimum size to 480×560 where the window is
  created. It excludes phones in either orientation; layouts are fluid above
  it, so the minimum can be lowered if mobile is ever targeted.
