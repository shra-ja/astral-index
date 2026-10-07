

## Banner catalogue plan (2026-10-07)

Integrated through PR #82.
On `docs/banner-catalogue-plan`, docs only. Decision 0022: a separate,
standalone downloader writes a catalogue folder of banner metadata and art that
the app loads; the app never fetches either. Features 0034 and 0036 move to
milestone 12. Decision 0021: history completeness is the user's responsibility;
the partial-history clause leaves milestone 9 for backlog feature 0046. Evidence:
`npm run docs:check` and markdownlint pass.

## Styled tooltip (2026-10-07)

Integrated through PR #83.
Feature 0033's first task, on `feat/styled-tooltip`. A shared `AppTooltip`
(decision 0013, amended): 400 ms under the pointer, at once on keyboard focus,
hoverable, Escape hides it, placed by `@floating-ui/vue`. The collapsed sidebar
names its links in tooltips; "Choose file…" is `aria-disabled`, with a tooltip.
Evidence: the tooltip, sidebar and file-import tests failed first, then passed.
WebKitGTK's automation never sets `:focus-visible`, so the native Tab check
failed; the tooltip now tracks the last input (`input-modality.ts`, red then
green), and end to end checks hover, Escape and Tab.

## Grid layout (2026-10-07)

Integrated through PR #84.
Feature 0033's second task, on `feat/history-layouts`. The History toolbar's
layout switch (List, Grid; Icons comes next) shows the page as tiles, kept while
the screen is open. The art button, Banner column and 50/50 button moved to 0034
and 0036. Evidence: the switch, grid and History tests failed first, then
passed. Natively, three layout bugs were caught red then fixed: list icons
stretched by a leaking `.row` style, the toolbar squeezed under the rolls in
short windows, and the tabs' measuring copy widening the screen.
