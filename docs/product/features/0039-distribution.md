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
- [x] **Release workflow.** Started by hand or `gh workflow run`: a tested
  script works out the next version from the merged pull requests' titles
  since the last tag, unless one is given; the workflow refuses unless `main`
  passed every check, builds and smoke-tests the release executable, and
  creates a draft release with it and the notes: generated from the titles, or
  given by hand, in the same template. Publishing the draft creates the tag.
  - The notes' template was settled with the user from three rounds of drafts:
    the title is the tag, the body opens with "Astral Index" and the tag linked
    to the comparison, then Breaking changes, Features and Fixes (other types
    are left out), then "Usage"; the download is
    `Astral-Index-v1.2.0.exe`. One optional `notes` input replaces the
    generated sections, so an agent's notes keep the same frame. The draft
    leaves the tag to publishing. The first release needs notes given by hand.
  - The checks step was tried read-only against `main`: all five passed, and
    an unknown name came back as missing. A preview against real history, with
    a temporary local tag, matched the agreed draft.
  - A read-only reviewer agent found no blockers. Fixed from its review: the
    guide claimed a `BREAKING CHANGE` footer counts (only a `!` in the title
    reaches the merge commit); a second run for the same version would have
    made a second draft, so the drafting job now refuses one; a tag such as
    `v1.0.0-rc1` would have been read as the last release, so `git describe`
    skips tags that are not plain versions and the tooling refuses any that
    get through; the checks gate now counts only GitHub Actions' runs; the
    guide's preview now updates `main` and its tags first; and the CI test pins
    the checkouts' credentials, the artifacts' paths and the gate's exit. Rebase
    merges, which carry no pull request number, would have been left out, so
    the user turned off rebase merging; squash merges stay allowed.
  - The smoke test also checks that the executable's file version is the one
    `TAURI_CONFIG` gave the build, in CI and in the release, and a release run
    restores the Rust cache that main's checks saved but saves none itself.
- [x] **Shared Windows build.** One composite action builds and smoke-tests the
  release executable for both CI's Windows release job and the release
  workflow, taking the version and build identity as inputs, so the two builds
  cannot drift apart; `tooling/ci.test.ts` checks that the rest of the two jobs
  (runner, timeout, environment, checkout and setup) still match.
  - The action installs cargo-about, builds with `TAURI_CONFIG` and
    `ASTRAL_INDEX_BUILD` from its `version` and `build` inputs, and smoke-tests
    with the same; checkout and setup stay in the jobs, as CI alone needs the
    history to find the last tag and saves caches. CI's build-naming step now
    gives the action the version as an output rather than setting job-wide
    variables, so only the action names a build.
- [ ] **Release docs.** The README's download section: Windows 10 or 11 x64
  with WebView2, checking the download against the digest GitHub shows, the
  SmartScreen and antivirus warnings an unsigned executable meets, running it
  from any folder, portable mode, and recovery help (backing up and restoring
  `history.sqlite`, a database that will not open, resetting the webview
  profile, removing the app). DEVELOPMENT gets a Releasing guide that the user
  or an agent can follow.
- [ ] **First release and migration fixture.** Release 1.0.0. Once it is
  published and looks right, add a tag ruleset that stops `v*` tags being
  deleted or moved and lets only repository admins create them (a repository
  setting, with the user's approval); it comes after, so redoing 1.0.0 needs no
  bypass. Then keep a
  synthetic database of its schema as a test fixture that each later
  migration's tests open, to show saved history survives an upgrade
  ([decision 0029](../../architecture/decisions/0029-automated-release-verification.md)).
