# 0038 — Release verification

Status: Done · Milestone 10, Release readiness

Check the app on Windows, the first release's only OS
([decision 0027](../../architecture/decisions/0027-windows-first-release.md)),
before shipping.

## Tasks

Each code task is one PR, test first.

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
    this repository's builds, not fork pull requests', as
    `astral-index-dev-build-unsigned-<commit>`; since the CI pipeline change,
    only builds that pass every check, for 7 days. Running the unit tests on
    Windows first found that Windows refused to start them without the
    Common Controls manifest, which the linker now embeds in every Windows
    binary, and 20 tests that assumed Linux paths, origin, folder names,
    webview folder and icon; the app itself needed no change.
- [x] **Windows smoke test.** The release job runs the executable it builds and
  checks the native side: a windowed app with no console, the committed icon
  in Explorer and on the window, the history and webview profile in the local
  data folder or, in portable mode, in `data` beside it, a second start on saved
  history, and a clean exit from the close button. The UI stays tested end to
  end on Linux
  ([decision 0029](../../architecture/decisions/0029-automated-release-verification.md)).
  - The end-to-end suite was tried on Windows first, but WebView2 takes its
    debugging flag only from the app, so no WebDriver could attach; the user
    chose the smoke test over a switch in debug builds. It runs in the release
    job, which is already a required check. The window's icon is read from its
    small slot, where tao sets Tauri's one icon; the large slot stays empty.
- [x] **First-release sign-off.** The user retrieves a real history once with
  the CI-built executable on Windows, from the installed game's cache: new
  rolls only, then the full history, saved. The result is recorded in STATUS
  without account details. Later releases rely on the automated checks alone
  ([decision 0029](../../architecture/decisions/0029-automated-release-verification.md)).
  - Signed off by the user on 2026-10-15 with the CI build of `702d678`, its
    SHA-256 checked against the artifact's digest: retrieval of new rolls and
    saving, browsing the History screen, a full retrieval whose rolls were all
    skipped as already saved, and the About dialog all worked. The browser
    warned that the unsigned download held a virus, as heuristics and missing
    reputation flag new unsigned executables; signing is
    [0039](0039-distribution.md)'s. Three UI problems the user saw went to
    [0052](0052-windows-polish.md).
