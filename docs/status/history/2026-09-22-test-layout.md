# 2026-09-22: test layout (archived 2026-10-04)

Archived from living docs. Statements and “Next” items below describe their
historical context, not current priorities.

## From TESTING.md

### Test layout refactor (2026-09-22)

Historical layout, superseded for Rust unit tests by the 2026-09-25 refinement below.

Frontend tests now live in `src/tests/`; backend Rust tests and synthetic API
fixtures live in `src-tauri/tests/`. Cargo automatically discovers
`src-tauri/tests/hsr.rs` without a custom manifest target. Storage behavior and
failure tests live under `src-tauri/tests/storage/` and are included as test-only
library modules, preserving private connection access and a single storage test
artifact. Tooling tests are in `scripts/tests/`. Root `tests/` contains only the
application native end-to-end test and its X11 close-window helper.

This is a layout refactor: the baseline 17 frontend/tooling and 33 Rust tests
passed before moves. The same tests pass after moves; no application behavior or
test assertions changed. Coverage inventories and test-only exclusions follow
the new directories, with the same per-file thresholds and failure probes.
