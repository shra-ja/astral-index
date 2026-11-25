# 2026-11-24: export read (archived 2026-11-25)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### Export read (2026-11-24)

Integrated through PR #169.

`feat/export-read`: 0055's first task. Storage reads every saved Star Rail account, or the one chosen, with its offset and rolls in export order, in one statement. Red: the three new unit tests failed on a stub that ran no SQL; green: all 308 Rust unit tests, with storage at 100% coverage. A real-SQLite test checks the order, and failed when any ordering term or the server filter was broken; it first missed the time term, so its data now has a later roll with a smaller ID. From review: the test also fails if the join keeps accounts without rolls or either game filter is dropped, the unit test if grouping ignores the UID, and the read's debug output hides the player's history (red first). The older `history` read is now used only by tests; 0055's "One history read" task retires it.
