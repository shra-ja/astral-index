# 0052 — Windows polish

Status: Planned · Milestone 10, Release readiness

Fix three problems the user saw in the first-release sign-off on Windows
([0038](0038-release-verification.md)), where WebView2 shows classic scrollbars
and the user reads the About dialog at full size.

## Tasks

One PR, test first.

- [ ] **Dismiss About from outside.** A press on the backdrop outside the About
  dialog closes it, as Close and Esc do, returning focus to the About button.
  Presses inside the dialog, its licence and notices views included, keep it
  open.
- [ ] **Reflow the licence text.** The About dialog's licence view joins the
  lines within each paragraph of `LICENSE`, so the text wraps to the dialog's
  width; the file and its words stay unchanged. The third-party notices stay
  exactly as generated.
- [ ] **Stable scrollbar gutter on History.** The History screen's scroll region
  keeps room for its scrollbar whether or not the current tab or layout needs
  one, so the content no longer shifts sideways when switching between them.
