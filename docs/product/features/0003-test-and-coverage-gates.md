# 0003 — Test and coverage gates

Status: Done · Milestone 1, Runnable offline shell
Decisions: [0001](../../decisions/0001-shell-and-test-stack.md)

Mandatory 100% coverage, gates that are proven to fail, and CI running the same
checks.

## Tasks

- [x] Establish frontend/tooling V8 coverage and native LLVM branch instrumentation,
  including `build.rs`; enforce 100% per-file metrics and source inventory.
- [x] Prove gate failures for unexecuted files, missed branches and missing reports.
- [x] Add CI running the same local checks and uploading coverage/screenshots.
- [x] Obtain a passing hosted **Tests and 100% coverage** run.
- [x] Configure **Tests and 100% coverage** as a required check on protected `main`.
