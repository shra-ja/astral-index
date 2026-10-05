# 0002 — Offline shell

Status: Done · Milestone 1, Runnable offline shell
Decisions: [0001](../../architecture/decisions/0001-shell-and-test-stack.md)

A runnable Tauri desktop shell with bundled assets, a restrictive CSP and an
accessible first screen.

## Tasks

- [x] Select and record vanilla TypeScript/Vite/npm, Tauri 2, and Ubuntu 24.04.
- [x] Create `feat/offline-shell` from the authorized baseline before adding code.
- [x] Pin asdf Node/Rust toolchains and exact frontend/Rust dependencies.
- [x] Scaffold Tauri with bundled assets and restrictive production CSP.
- [x] Use red-green-refactor for an accessible empty state with game selection.
- [x] Document and run setup, tests, coverage, lint/type and production build commands.
- [x] Launch and exercise the native shell in an isolated network namespace.
- [x] Commit the milestone with Conventional Commits and publish
  [PR #1](https://github.com/shra-ja/astral-index/pull/1).

## Notes

Milestone 1 implementation and validation are complete on Ubuntu 24.04 x86_64.
The user confirmed hosted CI passed and required checks were configured on
2026-09-19. Windows/macOS and installer packaging remain untested and are covered
by milestone 11 release validation. Review, integration and branch deletion follow
the standard workflow in `../CONTRIBUTING.md`.
