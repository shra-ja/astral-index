# 2026-11-26: export round trips (archived 2026-11-26)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### Export round trips (2026-11-26)

Integrated through PR #173.

`test/export-round-trips`: 0055's fifth task, tests only. Integration tests in `src-tauri/tests/export_round_trips.rs` export synthetic saved histories through `file_export` and take each account back through the Import screen's file import (`uigf::read`, then `file_import::resolve`). Back into its own history, every roll is a duplicate; into an empty one, each account returns on its own server with every written roll's fields unchanged, the 19-digit IDs included, and the roll without a pool ID is counted and left out. A UID saved on two servers is left out of All accounts but exports alone and imports into an empty history. The tests passed on first run, as the behaviour exists; probes showed they fail when the writer drops a record's count, ignores a repeated UID or writes IDs as numbers.
