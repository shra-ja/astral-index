# 0052 — Windows polish

Status: Done · Milestone 10, Release readiness

Fix problems the user saw in the first-release sign-off on Windows
([0038](0038-release-verification.md)), where WebView2 shows classic scrollbars
and the user reads the About dialog at full size.

## Tasks

One PR, test first.

- [x] **Dismiss About from outside.** A press on the backdrop outside the About
  dialog closes it, as Close and Esc do, returning focus to the About button.
  Presses inside the dialog, its licence and notices views included, keep it
  open.
  - A press counts only when it starts and ends outside, so a drag from inside,
    such as selecting text, keeps the dialog open. Natively, the backdrop's
    presses reach the dialog element itself, outside its box.
  - The dialog now closes natively for Close and a backdrop press, as for Esc:
    while it is modal, the About button is inert, so the app's own focus call
    did nothing and Close left focus on the page body, a bug the end-to-end
    test now catches.
- [x] **Reflow the licence text.** The About dialog's licence view joins the
  lines within each paragraph of `LICENSE`, so the text wraps to the dialog's
  width; the file and its words stay unchanged. The third-party notices stay
  exactly as generated.
- [x] **Stable scrollbar gutter on History.** The History screen's scroll region
  keeps room for its scrollbar whether or not the current tab or layout needs
  one, so the content no longer shifts sideways when switching between them.
  - WebKitGTK's scrollbars overlay the content and take no room, even with
    `GTK_OVERLAY_SCROLLING=0`, so Linux cannot show the shift; the end-to-end
    test checks that the screen computes `scrollbar-gutter: stable` instead.
- [x] **Scrollbars in the app's colours.** Every scrolling area shows a thin
  scrollbar: a `--text-faint` thumb, at least 3:1 against every background, on
  a transparent track, rather than Chromium's default dark scrollbar at full
  width.
  - Added after the user asked whether the scrollbar matched the app; they
    chose the thin bar, which also narrows the room the stable gutter keeps.
    WebKitGTK computes the style but keeps its overlay scrollbars.
- [x] **The bare emblem in the sidebar.** The brand made the tile optional at
  every size, so the sidebar shows the open lockup at H 18 and, collapsed, the
  emblem alone at the same size, about 35 px wide
  ([decision 0023](../../architecture/decisions/0023-astral-brand.md)). The
  application icon keeps its tile.
  - The user found the tile did not stand out enough. A preview showed the bare
    emblem vanishing on light Windows themes as an application icon, which can
    hold one colour only, and a round tile looking smaller, so both were
    declined for the icon.
- [x] **No white flash on launch.** The window and its webview start in the
  sidebar's colour, `#0b0d11`, the app's darkest, so the moment before the
  first screen paints is dark rather than WebView2's default white.
  - No automated test can see that background: Tauri's mock runtime discards
    it, and WebKitGTK paints the page's own canvas over it (an end-to-end check
    read white with and without the fix). A unit test fails instead if the
    colour drifts from `main.css`'s `--sidebar`. The user checked builds in the
    window colour, `#101318`, and the sidebar's on Windows, and chose the
    darker sidebar colour.
