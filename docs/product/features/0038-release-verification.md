# 0038 — Release verification

Status: Planned · Milestone 10, Release readiness

Check the app on Windows, the first release's only OS
([decision 0027](../../architecture/decisions/0027-windows-first-release.md)),
before shipping.

## Tasks

Four PRs, each test first.

- [ ] **Retrieval disclosure.** Say on the Import screen, beside the retrieval
  controls, what retrieval uses and sends: the history link the game cached,
  sent only to HoYoverse's history service, on the user's request.
- [ ] **Automated release checks,** in the native end-to-end tests:
  - an accessibility audit of every screen and the About dialog with a bundled
    axe-core, finding no violations;
  - a large history: the mock serves about 20,000 rolls, and retrieval,
    saving, paging, filters and the three layouts stay within time bounds;
  - bundled resources: the release build's frontend references nothing
    remote and carries its typeface, icons and notices. The native permissions
    are already checked: the capability grants only the listed commands.
- [ ] **Windows CI.** A Windows job runs the Rust unit tests and builds the
  release executable as an artifact; tests that assume Unix are fixed.
- [ ] **Release checklist on Windows.** A checklist in the development docs,
  run on the CI-built executable: local workflows, requested fetching, network
  failures, an upgrade over the previous build with saved history, portable
  mode, keyboard use, and the About dialog's data folder and issues buttons
  opening Explorer and the browser. The results are recorded, and installer
  packaging is left to [0039](0039-distribution.md).
