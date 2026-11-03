# 2026-11-02: UIGF reading (archived 2026-11-03)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## UIGF reading (2026-11-02)

Integrated through PR #159.

`feat/uigf-reading`, 0030's third task: `uigf::read` refuses files outside UIGF v4.0 to v4.2 whole, naming legacy UIGF, SRGF or the version found, and reads each Star Rail account as rolls in the retrieved shape, or says why it cannot be imported: a repeated UID, an invalid time zone, no records, or records counted by the fields they lack or the values they get wrong; malformed UIDs are only counted. Rolls may now lack a count or language, as UIGF allows; HoYoverse's still need both. A pool ID repeating its category, as StarDB writes, is dropped. Tests check each account the reader would import against UIGF v4.2's pinned schema, through the dev-only `jsonschema` crate. Red: the optional-field test failed to parse a record without a language, and all nine reader tests failed against a stub, and 100,000 accounts took 90 s to read until UIDs were counted once; green: all 290 unit tests pass, at 100% unit coverage.
