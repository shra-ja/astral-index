# 0030 — Tag-versioned releases

Date: 2026-10-15
Status: Accepted

## Context

Astral Index has never been released. Its version, 0.1.0, is written in four
manifests that a check keeps in step, and CI publishes unsigned development
builds of the Windows executable
([decision 0027](0027-windows-first-release.md)). The first release, and every
later one, needs a version scheme, a release process that an AI agent can run
on request, release notes, and a download format. The project is personal and
spends no money.

## Decision

- **Semantic versioning, from git tags alone.** No manifest declares a version,
  except a fixed `0.0.0` placeholder in `src-tauri/Cargo.toml`, which the Tauri
  CLI requires; the release tags (`v1.0.0`, `v1.1.0`…) are the only record.
  Builds receive the version through Tauri's `TAURI_CONFIG` at compile time,
  which sets the About dialog's version and the executable's Windows file
  properties. The first release is 1.0.0.
- **Builds say what they are.** About shows "Version 1.2.0" for a release
  build, "Version 1.2.0 · dev build a1b2c3d" for a CI build (the last tag and
  the commit), and "local build" for anything built elsewhere.
- **One action releases.** A manually started workflow works out the next
  version from the Conventional Commits since the last tag (a breaking change
  is major, a feature minor, anything else a patch) unless a version is given,
  refuses unless `main`'s latest commit passed every check, builds the release
  executable and creates a **draft** GitHub Release titled with the tag, such as
  `v1.2.0`, with the executable attached. The user publishes the draft, which
  creates the tag. No version-bump commit or pull request is made, and no
  branch rule is bypassed.
- **Notes follow one template, generated or written.** They open with the
  heading "Astral Index" and the tag, linked to the changes since the previous
  tag. The workflow then lists the pull requests merged since the last tag,
  read from their merge commits, whose titles are Conventional Commits:
  Breaking changes, Features and Fixes, each title without its type prefix and
  with its pull request; other types are left out, and a release with none
  says the app's features are unchanged. A "Usage" section ends the
  notes: download and run the executable, with a `data` folder beside it for
  portable mode. An optional `notes` input replaces the generated sections
  inside the same frame, and the draft can be edited before it is published,
  so an agent can describe the release for users without the notes looking
  different. The first release has no previous tag, so it needs its notes
  given by hand.
- **The download is the executable alone.** `Astral-Index-v1.2.0.exe`, run
  from any folder, with portable mode as before; no installer. GitHub shows each
  asset's SHA-256 digest, so no checksum file is attached. The licences and
  third-party notices are in the About dialog, inside the executable, which
  the licences accept, so no files ship beside it.
- **Unsigned for now.** Signing through the SignPath Foundation, free for
  open-source projects, is a backlog item
  ([0053](../../product/features/0053-code-signing.md)); it accepts only
  projects already released. Releases document the SmartScreen and antivirus
  warnings an unsigned executable can meet.

## Alternatives and consequences

- **Release Please** keeps a release pull request open, bumps versions and
  writes a changelog, and releases when it is merged: one click, but a
  permanently visible bot pull request, and its pull request does not trigger
  the required checks without a token or a workaround.
- **semantic-release** releases on every merge with a feature or fix, which
  suits libraries, not a desktop app, and must push version bumps past the
  branch rules.
- **Changesets** and **release-plz** need a file per pull request, or bump only
  Cargo files.
- **Release Drafter** keeps a private draft up to date and releases on Publish,
  but leaves the version files behind.
- **A version-bump pull request** before each release keeps the version in the
  source, at the cost of a second step every time.
- **Signing:** Azure Artifact Signing serves individual developers only in the
  United States and Canada, and a certificate authority's certificate costs
  money every year.
- The notes and the version come from merge commits, which carry each pull
  request's title, and from squash merges, which end with its number. Rebase
  merges carry neither, so the repository no longer allows them (2026-10-15,
  with the user's approval).
- The version is not in the source: the tags and the Releases page say what
  was released. CI must fetch tags to know the last version. Local builds
  carry no version.
- After 1.0.0, schema changes need migrations, tested against a synthetic
  database of the released schema
  ([decision 0029](0029-automated-release-verification.md)).

## Evidence

The user's choices on 2026-10-15, after comparing release tools, signing
services and download formats.
