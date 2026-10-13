# 0027 — Windows as the first release's only OS

Date: 2026-10-13
Status: Accepted

## Context

The product brief left native validation on Windows and the release OSes open.
Honkai: Star Rail's PC client runs on Windows, and automatic cache discovery
targets a Windows installation, natively or from WSL. Development and CI run on
Ubuntu and WSL, where the native end-to-end tests drive the app through
WebKitGTK; nothing automated has run on Windows, and the app was last tried
there natively with PR #37.

## Decision

- **Windows is the first release's only OS.** Release verification
  ([feature 0038](../../product/features/0038-release-verification.md)) and
  distribution ([feature 0039](../../product/features/0039-distribution.md))
  cover Windows alone.
- **Linux stays a development and CI platform.** Its builds keep working and
  stay under the full check, but are not released or supported.
- **CI runs on Windows too.** A Windows job runs the Rust unit tests and builds
  the release executable, so Windows-only code is compiled and tested on every
  change, and manual checks start from a build of a known commit.

## Alternatives and consequences

- **Windows and Linux:** Linux is already checked end to end, but its players
  run the game through Proton or Wine, where the cache location is unverified,
  and distribution would need a second format.
- **macOS as well:** no macOS game client to find a cache from, and no Mac to
  verify on.
- Linux or macOS can become release OSes later, each with its own verification.
- The Windows job does not measure coverage, and the offline isolation and
  native end-to-end tests stay Linux-only, so Windows-only code is tested there
  but not counted by the coverage gates.

## Evidence

The user's choice on 2026-10-13, after weighing the Windows CI job's benefits
and costs.
