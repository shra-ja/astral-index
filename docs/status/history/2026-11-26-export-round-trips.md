# 2026-11-26: export round trips and one history read (archived 2026-11-26 and 2026-11-27)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### Export round trips (2026-11-26)

Integrated through PR #173.

`test/export-round-trips`: 0055's fifth task, tests only. Integration tests in `src-tauri/tests/export_round_trips.rs` export synthetic saved histories through `file_export` and take each account back through the Import screen's file import (`uigf::read`, then `file_import::resolve`). Back into its own history, every roll is a duplicate; into an empty one, each account returns on its own server with every written roll's fields unchanged, the 19-digit IDs included, and the roll without a pool ID is counted and left out. A UID saved on two servers is left out of All accounts but exports alone and imports into an empty history. The tests passed on first run, as the behaviour exists; probes showed they fail when the writer drops a record's count, ignores a repeated UID or writes IDs as numbers.

### One history read (2026-11-26)

Integrated through PR #174.

`refactor/one-history-read`: 0055's sixth task, a refactor with no change in behaviour. Storage's test-only `Store::history` is removed, so storage has one whole-account history read, `histories`. The integration tests read an account's saved rolls through `common::rolls`, which calls `histories` with the account chosen and gives an empty list for an account without rolls; their assertions passed unchanged, as none depended on the old ID-only order. History's damaged-payload cases (bad JSON, a repeated key, a roll whose UID, ID or category is not its row's or the game's) move to `histories`' unit tests. From review: on a real database, a payload that is not JSON fails in the query, which sorts by its fields, so export reports it as a database error rather than damaged history; this was already so and is unchanged. Every Rust unit and integration test passes.
