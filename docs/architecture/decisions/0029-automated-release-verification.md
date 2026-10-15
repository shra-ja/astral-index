# 0029 — Automated release verification

Date: 2026-10-14
Status: Accepted; amends [decision 0028](0028-release-checks.md)'s manual
release checks.

## Context

Release verification ([feature 0038](../../product/features/0038-release-verification.md))
planned a manual checklist, run on Windows before each release: local
workflows, requested fetching, network failures, an upgrade over the previous
build, portable mode, keyboard use, the window and taskbar icon, and the About
dialog's buttons. Most of it repeats what the native end-to-end tests already
check against the mock debug binary, only on Linux under WebKitGTK rather than
on Windows under WebView2.

Tests never call HoYoverse or use player credentials, so no automated check can
retrieve a real history from a real installation.

## Decision

- **No manual checks before a release.** Windows behaviour is checked in CI by
  a smoke test of the release executable, without WebDriver: its window opens
  with the committed icon and no console, its history and webview profile go
  to the local data folder or, in portable mode, to `data` beside it, it reopens
  on saved history, and closing the window exits cleanly. The UI stays tested
  end to end on Linux under WebKitGTK.
- **One live sign-off for the first release.** The user retrieves a real
  history once with the CI-built executable on Windows, from the installed
  game's cache, and the result is recorded without account details.
- **Later releases rely on the automated checks alone.** A change on
  HoYoverse's side, such as to the history API or the game's cache, breaks
  retrieval whatever is released, and is fixed in the repository when found;
  a release check would not prevent it. The app is not mission-critical, so the
  user accepts the risk.
- **The upgrade check becomes a migration test.** Pre-release schemas need no
  migrations; after the first release, a synthetic database of the released
  schema is kept as a fixture, and each migration's tests open it
  ([0039](../../product/features/0039-distribution.md)).

## Alternatives and consequences

- **A manual checklist for every release:** checks Windows, WebView2 and live
  HoYoverse together, but repeats the automated tests by hand each time.
- **A live retrieval for every release:** the only check of the real contract,
  but it needs an account and its auth context, which no automated test may use.
- **The end-to-end suite on Windows as well:** tried first. Edge WebDriver
  attaches to WebView2 through its debugging port, but wry passes WebView2 its
  own browser arguments, which override `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`,
  so no driver can reach the app without a debugging switch in the app itself.
  The hosted runner's display is also fixed at 1024×768, too small for the
  suite's window sizes. The user chose the smoke test over a switch in debug
  builds.
- Left unchecked, as accepted risks: HoYoverse's API and the game's cache
  location changing between releases, screen-reader use (axe-core checks only
  what it can detect), the opener plugin's actual launch of Explorer and the
  browser (the mock records each request instead), and true Windows display
  scaling, which a hosted runner cannot change.
- WebView2 rendering and behaviour that differ from WebKitGTK's go unchecked.
  WebView2 is Chromium-based, and the frontend's logic is shared, so the user
  accepts this risk too.

## Evidence

The user's choices on 2026-10-14, after weighing a per-release manual checklist
against automated Windows checks and a one-off live sign-off, and on 2026-10-15,
after CI showed WebView2 ignoring the debugging flag from the environment: every
WebView2 process of the running app carried only wry's
`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`, and the port
never opened.
