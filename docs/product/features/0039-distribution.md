# 0039 — Distribution

Status: In progress · Milestone 10, Release readiness

Release the app as a standalone Windows executable, versioned from git tags,
with generated notes and documented requirements and recovery help
([decision 0030](../../architecture/decisions/0030-tag-versioned-releases.md)).

## Tasks

One PR each, test first.

- [x] **Version from tags.** No manifest declares a version; CI builds receive
  it through `TAURI_CONFIG`: the last tag for CI builds, the release's own for
  release builds. The About dialog says which: "Version 1.2.0", "Version 1.2.0 ·
  dev build a1b2c3d" or "Local build". `npm run versions:check` fails if a
  manifest declares a version again.
  - The Tauri CLI refuses to build without a Cargo version, so
    `src-tauri/Cargo.toml` keeps a fixed `0.0.0` placeholder, the only version
    the check allows. A release build made with `TAURI_CONFIG` and a commit
    reported both through `app_info`. Test builds, locally and in the Linux
    jobs, carry neither, so the tests see a local build; only the Windows
    release job names its build.
- [ ] **Release workflow.** Started by hand or `gh workflow run`: a tested
  script works out the next version from the Conventional Commits since the
  last tag, unless one is given; the workflow refuses unless `main` passed
  every check, builds the release executable, tags it and creates a draft
  release with the executable and generated notes (breaking changes, features
  and fixes from the merged pull requests' titles, the requirements and the
  full changelog link) below an optional summary. A tag ruleset protects
  `v*` tags (a repository setting, with the user's approval).
- [ ] **Release docs.** The README's download section: Windows 10 or 11 x64
  with WebView2, checking the download against the digest GitHub shows, the
  SmartScreen and antivirus warnings an unsigned executable meets, running it
  from any folder, portable mode, and recovery help (backing up and restoring
  `history.sqlite`, a database that will not open, resetting the webview
  profile, removing the app). DEVELOPMENT gets a Releasing guide that the user
  or an agent can follow.
- [ ] **First release and migration fixture.** Release 1.0.0, then keep a
  synthetic database of its schema as a test fixture that each later
  migration's tests open, to show saved history survives an upgrade
  ([decision 0029](../../architecture/decisions/0029-automated-release-verification.md)).
