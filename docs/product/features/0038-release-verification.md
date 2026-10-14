# 0038 — Release verification

Status: Planned · Milestone 10, Release readiness

Check the app on Windows, the first release's only OS
([decision 0027](../../architecture/decisions/0027-windows-first-release.md)),
before shipping.

## Tasks

Four PRs, each test first.

- [x] **Retrieval disclosure.** Say on the Import screen, beside the retrieval
  controls, what retrieval uses and sends: the history link the game cached,
  sent only to HoYoverse's history service, on the user's request.
  - The retrieval card already said it finds the history link in the game's
    files and runs only on a click; the user chose the smallest change for the
    rest, so its list now reads "Needs an internet connection to contact
    HoYoverse; runs only when you click".
- [x] **Automated release checks,** in the native end-to-end tests:
  - an accessibility audit of every screen and the About dialog with a bundled
    axe-core, finding no violations;
  - a large history: the mock serves about 20,000 rolls, and retrieval,
    saving, paging, filters and the three layouts stay within time bounds;
  - bundled resources: the release build's frontend references nothing
    remote and carries its typeface, icons and notices. The native permissions
    are already checked: the capability grants only the listed commands.
  - Done as [decision 0028](../../architecture/decisions/0028-release-checks.md):
    the audit enforces best practices as well as WCAG, since a run across the
    app found none of either; the large-history bounds are about three times
    the measured times, at least 500 ms. WebKitGTK reports no resource timings
    for the app's own protocol, so the resources check records anything the CSP
    blocks while the About dialog's views load, and checks the page refers
    only to its own files and routes; the typeface and notices were already
    checked to load offline.
- [x] **Windows CI.** A Windows job runs the Rust unit tests and builds the
  release executable as an artifact; tests that assume Unix are fixed.
  - Done on `windows-2025`, on every pull request like the Linux job, keeping
    this repository's builds, not fork pull requests', for 30 days as
    `astral-index-dev-build-unsigned-<commit>`. Running the unit tests on
    Windows first found that Windows refused to start them without Tauri's
    resource and manifest, which `build.rs` now links into test binaries, and
    20 tests that assumed Linux paths, origin, folder names, webview folder and
    icon size; the app itself needed no change.
- [ ] **Release checklist on Windows.** A checklist in the development docs,
  run on the CI-built executable: local workflows, requested fetching, network
  failures, an upgrade over the previous build with saved history, portable
  mode, keyboard use, and the About dialog's data folder and issues buttons
  opening Explorer and the browser. The results are recorded, and installer
  packaging is left to [0039](0039-distribution.md).
