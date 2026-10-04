# 2026-09-17: shell test evidence (archived 2026-10-04)

Archived from living docs. Statements and “Next” items below describe their
historical context, not current priorities.

## From TESTING.md

### Red-green evidence for milestone 1

On `feat/offline-shell`, based on authorized documentation baseline `2d78399`:

1. UI tests ran against a one-line placeholder and failed on the absent heading
   and game selector. The empty state and selection handler made both pass.
2. Coverage-validator tests ran against a no-op: 14 failed because missing or
   invalid coverage was accepted. The implementation then passed all 15 tests
   with full branch coverage.
3. The native test ran against an empty Rust `main`; session creation timed out
   because no window existed. The Tauri event loop made native assertions pass.
   Harness fixes then ensured a graceful real app exit and coverage from that
   process, rather than accepting a killed process as success.
4. Automated probes introduce an unexecuted TypeScript file/branch, an uncovered
   Rust branch, an uncompiled Rust source file, and missing/incomplete reports.
   Each must fail the real gate, then restore source and regenerate clean reports.

Milestone 1 had no Rust domain logic. Native integration covers startup and the
build script; the milestone 2 response tests below now run in the same harness.
