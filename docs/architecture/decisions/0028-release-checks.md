# 0028 — Accessibility audit and large-history bounds

Date: 2026-10-13
Status: Accepted

## Context

Release verification ([feature 0038](../../product/features/0038-release-verification.md))
checks accessibility and large histories before the first release. The unit
tests check names, roles and keyboard use component by component, but nothing
audited whole screens as the webview renders them, and the largest history any
test browsed natively held 1,250 rolls in a category.

axe-core, Deque's open-source accessibility engine, tags each rule with the WCAG
success criterion it tests or as a best practice. In 4.13.0, 70 rules cover WCAG
2.2 A and AA, such as `button-name` (4.1.2), `color-contrast` (1.4.3) and
`target-size` (2.5.8). Another 30 are best practices, which map to no WCAG
criterion, such as `heading-order`, `region` and `aria-dialog-name`. A run across
the app's states on 2026-10-13 found no violations of either kind, and planted
defects of each kind were reported.

## Decision

- **The native tests audit every screen and step** with axe-core, a pinned dev
  dependency injected through WebDriver, so the app ships nothing extra:
  History empty, as a list, grid and icons and with its date filter open; Import
  at its start, progress, review, saved and failed steps; the collapsed sidebar;
  the account menu; and the About dialog's summary, licence and notices.
- **Best practices are enforced with WCAG.** Any violation of a WCAG 2.2 A or AA
  rule, or of a best-practice rule, fails the test. With none found, the user
  chose to require both now, since conformance is easier to keep than to
  regain.
- **A large history has time bounds.** The mock's `large-history` scenario holds
  20,000 Character Event Warp rolls. The native test retrieves and saves it, then
  opens History, pages, filters and switches layouts, each within a bound of
  about three times the slowest of three local runs, as CI runners are slower,
  and at least 500 ms, since a WebDriver round trip and the 20 ms poll are a
  fair part of the quickest steps. Each run writes its timings to
  `test-results/large-history-timings.json`.

## Alternatives and consequences

- **WCAG only, best practices reported:** keeps the gate to conformance, but
  lets structural findings accumulate unnoticed.
- **Fixed, user-facing time targets:** say how the app should feel, but were
  not grounded in measurements; the measured bounds catch regressions instead.
- axe-core checks what can be detected automatically. Screen reader use, focus
  order and readability still need the manual release checks.
- A slower CI runner may come close to the tightest bounds; raise a bound only
  with new measurements recorded beside it.

## Evidence

- A planted unnamed `img` (`image-alt`, WCAG) and an `h4` straight after the
  `h1` (`heading-order`, best practice) failed the audit; without them every
  state passes.
- Three local runs, in ms: retrieval 18,379–18,414 (paced at 500 ms a request),
  saving 135–176, opening History 121–193, paging 5–48, filtering 168–215,
  grid 10–53 and icons 18–56. A 50 ms filtering bound failed the test.
