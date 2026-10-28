# 2026-10-27: shared Rust test helpers (archived 2026-10-28)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Shared Rust test helpers (2026-10-27)

Integrated through PR #151.

`test/shared-rust-test-helpers`: the Rust integration tests share `tests/common/`: one temporary folder per test, named after its test crate and removed on drop, in place of four copies and nine hand-made folders removed only at a test's end; the synthetic page, its account and a store holding it; the test-only migration after 1.0.0, written out four times before; the folder-listing helper; the 1.0.0 fixture's path; and the import counts query that restore's and the released databases' tests both ran. A test that panics now leaves no folder behind, and the rest of its crate still runs, as an injected panic showed; before, it left its folder in the system's temporary folder. Each crate keeps its test count, and all pass, with clippy clean.
