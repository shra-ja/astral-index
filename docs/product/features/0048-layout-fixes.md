# 0048 — Layout fixes

Status: In progress · Milestone 10, Release readiness
Decisions: [0013](../../architecture/decisions/0013-visual-design.md)

Make every screen use the window well from the 480×560 minimum to very large
windows: no content cut off or squeezed out of reach in small windows, and no
narrow content stranded in a corner or empty panels in large ones. Screens were
checked natively at 480×560, 1000×760, 1600×1000 and 2560×1440.

## Tasks

Each task is one PR, in this order. Each fix is checked natively, test first,
with end-to-end checks at those window sizes and screenshots looked at by eye.

- [x] Add a window size overlay for development: started with
  `ASTRAL_INDEX_SIZE_OVERLAY=1`, a development run (`npm run tauri:mock` or
  `tauri dev`) shows the window's width and height in CSS pixels in a corner,
  with the zoom when it is not 1, updating live while the window is resized, so
  narrow ranges of sizes where a layout breaks can be found by hand. It never
  appears in release builds or without the variable, so the end-to-end
  screenshots stay clean; it ignores the pointer and is hidden from assistive
  technology. Document it in DEVELOPMENT beside `ASTRAL_INDEX_ZOOM`.
- [x] Keep Review Import's category table in reach in small windows. At
  480×560 the summary and the action bar take the height and the "By Category"
  table shrinks to its heading, with no way to scroll to its rows. The table
  keeps its rows and the screen scrolls instead, with the action bar still in
  reach.
- [x] Fit History's rolls panel to its rolls. In tall windows the panel fills
  the height while a page holds 20 rolls, leaving most of it empty in every
  layout, and in short windows a scrolling panel sits inside a scrolling
  screen. The panel ends at its rolls and only the screen scrolls, at every
  size, with the list's column headings and the pager pinned in view; page
  sizes stay 20, 50 and 100. Narrow, the pager keeps to two lines.
- [x] Give every screen one shared maximum content width, about 1,600 px,
  centred, and amend decision 0013 with it. History and Review Import stop
  spreading their columns across very wide windows; Import's source cards
  share the width in a fluid grid rather than stopping at about 1,200 px in the
  top-left corner. The Import screen's states align the same way: today the
  saved card is centred in both directions, the failed card only horizontally,
  and the start screen not at all. Small and medium windows keep their layout.
- [ ] Narrow the shared content width to 1,360 px, amending decision 0013:
  1,600 px spreads the content too far. The breaks below were found by hand
  with the size overlay at `ASTRAL_INDEX_ZOOM=1.25`, and their sizes are window
  widths as it showed them. Under that zoom WebKitGTK appears to compare
  container queries with the unzoomed width, so they fire at 80% of their
  written width: the sidebar collapsed at 720 rather than 900. Windows display
  scaling is not a page zoom, so confirm this natively and record in
  DEVELOPMENT that breakpoints are checked at zoom 1.
- [ ] Collapse the sidebar before the content gives way, at an 1,100 px app
  width: where the expanded content would reach its first compact layout, the
  summary strip's two by two at 760 px, in a window of about 1,045 px. The
  content widens by 160 px when the sidebar collapses, so a content breakpoint
  between about 620 and 780 px reverses: after the collapse at 720 the Type
  column came back, and at zoom 1 the summary strip and the pager's label do the
  same. An end-to-end sweep narrows the window from about 1,700 px to 480 px
  and checks that no compact layout returns as it narrows and no text is
  clipped; later tasks extend it. Decision 0013 records the rule rather than
  the width, and 0036's Banner column revisits it.
- [ ] Keep every list column readable. Below about 840 the Time column stops
  moving and is cut off from about 820, and again once Type has dropped out: the
  Type and Time breakpoints are narrower than the columns' minimum widths, so
  rows overflow and are clipped. With no gap between columns, names run into
  the Pity column once Item is at its minimum, below about 942. Add a column gap
  and set the breakpoints from the column minimums, replacing decision 0013's
  mockup widths (Type 1,180, Banner 980, Time 760) with that rule.
- [ ] Match the toolbar to the design. It is taller than the canvas because the
  shared 44 px button minimum overrides its 32 px controls. Below about 930 only
  the layout switch wraps, alone on a second row; wrap in two groups instead,
  the rarity filters and date range on the first row and search, stretching,
  beside the layout switch on the second.
- [ ] Keep the pager's page buttons still and its lines steady. The buttons
  move between pages, since their number changes (four on page 1, seven on
  page 4) and the width of the "Showing" text shifts them: show seven places
  whenever there are seven or more pages, with fixed-width numbers centred
  whatever the text's width. At 859 the pager wraps to two lines with "Rows per
  page" still shown, until the label hides at 782 and one line fits again, and
  the same happens under 720 after the sidebar collapses: hide the label when
  one line stops fitting, measured in code as the tabs are.
- [ ] Keep Review Import's figures whole. Below 835 "Existing rolls skipped"
  wraps to three lines and the fixed 78 px tile cuts off its number: the
  figures switch to two by two by window width (760 px) rather than by content
  width. Switch by content width, where every label still fits on one line.

Filling a tall window with more rolls per page, rather than ending the panel at
its rolls, is [0049](0049-automatic-page-size.md).
